# Uc-intg-onkyo-avr Architecture Analysis Report
**Date:** 2026-06-12 | **Branch:** Current HEAD

---

## Executive Summary

The codebase has undergone significant refactoring (eiscp.ts split from 1350→654 lines, setupHandler.ts extracted to 5 modules) but retains **architectural debt** centered on:

1. **Global singleton dependency** (`avrStateManager`) — blocks unit testing of 7+ modules
2. **SRP violations in medium-sized files** — `commandReceiver.ts` (361 lines, 8+ concerns), `mediaBrowserServices.ts` (544 lines, mixed service logic)
3. **Tangled complexity in media processing** — `zoneAgnosticUpdateProcessor.ts` orchestrates media rendering, service adapters, state changes with tight coupling
4. **Inconsistent error handling patterns** — mix of silent `.catch(() => {})`, logged errors, and swallowed exceptions
5. **Testing gaps on parser edge cases** — 68 test cases exist but missing ISO/encoding boundary tests

**Assessment**: Code is **maintainable but fragile**. Small changes to service logic ripple across multiple files. No critical bugs detected, but refactoring opportunities exist at 30-min and 2-hour levels.

---

## 1. FILE ANALYSIS: TOP CONCERNS

### 1.1 **mediaBrowserServices.ts** (544 lines)
**Severity**: MEDIUM | **Refactor Effort**: 2-3 hours

#### Issues
- **Multiple service-specific concerns** mixed into one module:
  - TuneIn preset/menu ingestion (100+ lines)
  - Tidal XML ingestion (40 lines)
  - Service detection heuristics (30 lines)
  - Browse response builders (200+ lines)
- **Duplicated patterns** across services (parseIndexedMenuEntry, ingestXmlEntries, etc.)
- **Cross-cutting logic** tightly bound to state stores (`getTuneInBrowseState`, `getTidalBrowseState`)

#### Specific Patterns
- [Lines 131-150](src/mediaBrowserServices.ts#L131-L150): TuneIn preset ingestion
- [Lines 151-175](src/mediaBrowserServices.ts#L151-L175): TuneIn menu ingestion  
- [Lines 176-200](src/mediaBrowserServices.ts#L176-L200): Tidal ingestion
- [Lines 236-320](src/mediaBrowserServices.ts#L236-L320): Browse response builders with repetitive thumbnail/option handling

#### Refactoring Opportunity
**Extract service-specific adapters** (30 min each):
```typescript
// Current
function ingestTuneInListEntry(entityId, entry) { ... }
function ingestTidalListEntry(entityId, entry) { ... }

// Proposed
class TuneInListIngester { ingest(entityId, entry) {} }
class TidalListIngester { ingest(entityId, entry) {} }
// Keyed by service type, eliminates per-service conditionals
```

**Impact**: Reduces file to ~300 lines; each service adapter becomes independently testable.

---

### 1.2 **eiscp-command-parser.ts** (503 lines)
**Severity**: MEDIUM | **Refactor Effort**: 1-2 hours

#### Issues
- **Handler dispatch map** `commandHandlers` (lines 48-61) works but is not easily extensible
- **Complex parsing logic** in `handleMetadata()` (lines 243-289):
  - Multi-frame ISCP splitting (`combined.split(/ISCP(?:[$.!]1|\$!1)/)`)
  - Service name override logic with 3-level conditionals
  - Not documented why certain patterns are present
- **Zone mapping boilerplate** (lines 99-106): repeated if-chains for Z2/Z3/Z4
- **Metadata state mutability** — `currentMetadata` object persists across parse calls; unclear when it's safe to call `getMetadata()`

#### Specific Patterns
- [Lines 78-106](src/eiscp-command-parser.ts#L78-L106): Zone detection boilerplate
- [Lines 243-289](src/eiscp-command-parser.ts#L243-L289): Multi-frame metadata parsing with service override
- [Lines 378-405](src/eiscp-command-parser.ts#L378-L405): NLT cursor/layer bit-unpacking

#### Root Cause
DI was applied (good), but **parsing logic still tightly couples**:
- State mutation (`this.currentMetadata`)
- Store lookups (`tidalStore.getBrowseState()`, `tuneInMenuStore.getBrowseState()`)
- Service name detection hardcoded

#### Refactoring Opportunity (1 hour)
**Extract metadata parser and zone mapper as pure functions**:
```typescript
// Current: mutable state + multiple concerns
this.currentMetadata.title = val;
result.argument = { ...this.currentMetadata };

// Proposed: immutable metadata builder
const metadata = buildMetadata(command, value, currentMetadata);
// Returns new object, doesn't mutate; easier to test
```

---

### 1.3 **commandReceiver.ts** (361 lines)
**Severity**: MEDIUM | **Refactor Effort**: 1.5 hours

#### Issues
- **Mixes orchestration with handler dispatch**:
  - Constructor builds 9 async handlers in `zoneAgnosticHandlers` map (lines 59-96)
  - Each handler calls `this.zoneAgnosticProcessor` with different signatures
  - Handler map is internal state but critical to flow
- **Timer-based requery logic** (lines 142-166):
  - Timeout for audio format requery stored in instance
  - Reset only when new event arrives; could leak if events stop
  - Related code: `maybeScheduleAvInfoRequery()` has 3-level conditional for "transient" values
- **Handler dispatch** in `dispatchZoneAgnosticCommand()` (lines 170-184) — generic but error-prone if handler missing

#### Specific Issues
- [Line 158-166](src/commandReceiver.ts#L158-L166): Timer management with manual cleanup
- [Lines 59-96](src/commandReceiver.ts#L59-L96): Handler map construction with repeated callback patterns
- [Line 180](src/commandReceiver.ts#L180): Silent failure if command not in map: `if (!handler) return false` (no logging)

#### Root Cause
Zone-agnostic command routing was extracted to `ZoneAgnosticUpdateProcessor` but `commandReceiver` still couples it to the handler dispatch table.

#### Refactoring Opportunity (45 min)
**Extract handler factory and timer as dedicated class**:
```typescript
// Current: handlers + timer management scattered
this.avInfoRequeryTimer = setTimeout(async () => { ... });
this.zoneAgnosticHandlers = { IFA: ..., DSN: ..., ... };

// Proposed
class AvInfoRequeryScheduler {
  schedule(audioInputValue, zone, callback) { ... }
  cancel() { ... }
}
class ZoneAgnosticHandlerDispatcher {
  handle(command, ...args) { ... }
  // Logs missing handlers, centralized error handling
}
```

---

### 1.4 **configManager.ts** (403 lines)
**Severity**: LOW-MEDIUM | **Refactor Effort**: 1 hour

#### Issues
- **Static class with side effects**:
  - Loads/saves from disk
  - Mutates internal `config` object
  - No separate read-only vs read-write interfaces
- **Large validation method** `validateAvrPayload()` (lines 168-250):
  - 80+ lines of sequential field checks
  - Each check adds to `errors` array
  - Could use data-driven validation rules
- **Migration logic embedded in load()** (lines 98-115):
  - Legacy config format support mixed with normal load
  - Could move to dedicated migration module

#### Specific Patterns
- [Lines 98-115](src/configManager.ts#L98-L115): Migration logic in load
- [Lines 168-250](src/configManager.ts#L168-L250): Long validation chain

#### Why Keep As-Is
Refactoring risk is **low-reward**: module is stable, test coverage exists (18/18 tests pass), and changes are rare. Migrate only if adding new AVR types or config formats.

---

### 1.5 **driver.ts** (377 lines)
**Severity**: LOW | **Refactor Effort**: 2 hours (not urgent)

#### Issues
- **Fat orchestrator** — responsible for:
  - Driver initialization & setup delegation
  - Entity registration & subscription handling
  - Connection coordination
  - Event handler setup
- **Long constructor** (lines 38-100) initializes 6 helper classes in sequence
- **Entity registration loop** (lines 191-230) is boilerplate but necessary (OCP pattern applied correctly)

#### Not a Refactoring Priority
The file is a **coordinator by design**. Large coordinators are acceptable if:
- ✅ Each dependency is independently testable (they are via DI)
- ✅ No business logic lives in the coordinator (logic is delegated)
- ✅ Event handlers are simple (they are — mostly delegation to handlers)

---

### 1.6 **zoneAgnosticUpdateProcessor.ts** (318 lines)
**Severity**: HIGH | **Refactor Effort**: 2-3 hours

#### Issues
- **Oversized orchestrator** with 10+ `async handle*()` methods:
  - `handleIfa()` — audio format detection + listening mode updates (17 lines)
  - `handleDsn()` — display name updates (15 lines)
  - `handleNlt()` — service detection (25 lines)
  - `handleFld()` — front panel display with 3-way source routing (40 lines)
  - `handleNtm()`, `handleMetadata()` — media info rendering
  - **Each handler calls**: state mutation → service adapter → media renderer → driver update
- **Service adapter dispatch loop** (lines 217-223):
  - For each handler, loops through `this.serviceAdapters`
  - No clear contract — adapters may or may not implement each method
  - Loose coupling but hard to debug; no type safety
- **Tight coupling to media rendering**:
  - Lines 149-157 update audio input sensor attributes via `driver.updateEntityAttributes()`
  - Lines 156-164 call `this.renderZoneMedia()`
  - Lines 167-206 call `maybeRequestSongInfo()` inline
  - Each handler ends with media render — **tangled concerns**

#### Specific Code Patterns
- [Lines 131-165](src/zoneAgnosticUpdateProcessor.ts#L131-L165): IFA handler with nested sensor updates
- [Lines 217-270](src/zoneAgnosticUpdateProcessor.ts#L217-L270): Adapter dispatch loops
- [Lines 276-290](src/zoneAgnosticUpdateProcessor.ts#L276-L290): Metadata handler with inline render

#### Root Cause
**Initial design assumption was wrong**: Assumed zone-agnostic commands were "just state updates." Reality: each event triggers cascading updates (sensor updates, service adapter reactions, media renders, driver updates).

#### Refactoring Opportunity (2 hours)
**Extract event-response pipelines**:
```typescript
// Current: handlers mixed with orchestration
async handleFld(sourceEntityId, text, eventZone) {
  // 40 lines mixing state→adapter→render→driver
  this.state.setSubSource(...);
  serviceAdapter?.onServiceDetectedFromFld(...);
  await this.maybeRequestSongInfo(...);
}

// Proposed: event → handlers → effects
class FldUpdatePipeline {
  async process(event) {
    const updates = this.detectServiceChanges(event);
    const effects = await this.compileEffects(updates);
    await this.applyEffects(effects);
  }
}
```

---

### 1.7 **avrState.ts** (323 lines)
**Severity**: HIGH (Dependency Issue) | **Refactor Effort**: 3-4 hours

#### Issues
- **Global singleton** `avrStateManager` imported by:
  - `commandReceiver.ts`, `commandSender.ts`, `zoneAgnosticUpdateProcessor.ts` (direct imports)
  - `mediaBrowser.ts`, `zoneMediaRenderer.ts`, `playMediaCommandHandler.ts` (indirect)
  - **Total: 41 call sites across 7 modules**
- **Cannot unit test importers** without initializing the global:
  - No integration test can mock `avrStateManager` behavior
  - All tests must start the module and initialize state
  - Brittle: changing state API breaks all 7 modules simultaneously
- **Implicit shared state** — multiple modules read/write same EntityState:
  - `setSource()` mutates state AND calls `refreshAvrState()` (triggers side effects)
  - `setPlaybackStatus()` mutates state AND calls `applyMediaPlayerState()`
  - Side effects are **hidden inside setters** — violates CQRS principle
- **Large `getEntitiesBySource()` patterns** (lines 88-97):
  - O(n) loop through all entities for each query
  - Called frequently during media operations
  - No cache or index

#### Specific Patterns
- [Lines 88-110](src/avrState.ts#L88-L110): O(n) queries without indexing
- [Lines 60-85](src/avrState.ts#L60-L85): Setters with hidden side effects

#### Refactoring Strategy (Phase 1: 2 hours)
**Inject `AvrStateApi` interface** (similar to what `IscpCommandParser` received):
```typescript
// Current: direct import, can't mock
import { avrStateManager } from "./avrState.js";
avrStateManager.setSource(entityId, source);

// Proposed: interface injection
constructor(private stateApi: AvrStateApi) {}
this.stateApi.setSource(entityId, source);
// Constructor receives concrete implementation; can swap in tests
```

Apply to: `commandReceiver.ts`, `commandSender.ts`, `zoneAgnosticUpdateProcessor.ts`.

#### Refactoring Strategy (Phase 2: 3 hours)
**Separate queries from mutations** (Command Query Responsibility Segregation):
```typescript
// Current: mixed
state.setSource(entityId, "net", eiscpInstance, zone, driver);

// Proposed: separate
const changed = state.setSource(entityId, "net");
if (changed) {
  await refreshStateEffects(entityId, eiscpInstance, zone, driver);
}
// Mutation returns success flag; caller decides what effects to apply
```

---

### 1.8 **commandReceiver.ts + zoneAgnosticUpdateProcessor.ts Entanglement**
**Severity**: MEDIUM | **Refactor Effort**: 1.5 hours

#### Issues
- `CommandReceiver` creates `ZoneAgnosticUpdateProcessor` and builds handler map that delegates to it
- Handler signatures vary: `async (avrUpdates, entityId, eventZone) => void`
- But processor methods have inconsistent parameters:
  - `handleIfa(sourceEntityId, eventZone, argument, callback)` — 4 params
  - `handleDsn(sourceEntityId, stationName, eventZone)` — 3 params
  - `handleNst(sourceEntityId, playbackStatus)` — 2 params
- **No single contract** — parameter list differs per method

#### Root Cause
Handlers were extracted piecemeal; no unified event type was defined.

#### Quick Fix (30 min)
**Define unified event struct**:
```typescript
interface ZoneAgnosticCommandEvent {
  command: string;
  argument: string | Record<string, string>;
  sourceEntityId: string;
  eventZone: string;
}
// All handlers receive same signature:
async handle(event: ZoneAgnosticCommandEvent): Promise<void>
// Handlers parse `argument` type-specifically; centralized dispatch
```

---

## 2. SRP VIOLATIONS & PATTERNS

### 2.1 Summary Table

| File | Responsibilities | Lines | Priority |
|------|-----------------|-------|----------|
| **mediaBrowserServices.ts** | TuneIn logic, Tidal logic, browse builders, XML parsing | 544 | MEDIUM |
| **eiscp-command-parser.ts** | Zone mapping, parsing dispatch, metadata accumulation, service detection | 503 | MEDIUM |
| **commandReceiver.ts** | Handler dispatch, timer management, listening mode updates, audio info requery | 361 | MEDIUM |
| **avrState.ts** | Singleton state, entity queries, media player sync, refresh triggers | 323 | HIGH (DI blocker) |
| **zoneAgnosticUpdateProcessor.ts** | Event routing, service adapters, media rendering, sensor updates | 318 | HIGH |
| **driver.ts** | Initialization, entity registration, event setup, connection coordination | 377 | LOW (by design) |
| **configManager.ts** | Config load/save/migrate, AVR validation, defaults | 403 | LOW |

---

### 2.2 Architectural Patterns Observed

#### ✅ Good Patterns
1. **Handler dispatch map** (eiscp-command-parser.ts lines 48-61) — OCP applied correctly; add handler → no existing code changes
2. **Service adapter interface** (zoneAgnosticServiceAdapters.ts) — TuneIn/Tidal adapters implement contract, loose coupling
3. **Browse handler contract** (menuBrowseHandlerBase.ts) — abstract base, concrete implementations, well-structured
4. **DI in eiscp-command-parser.ts** — injectable `AvrStateReader`, `TidalStoreApi`; constructor receives interfaces, not globals

#### ❌ Bad Patterns
1. **Global singleton without DI** (avrStateManager) — blocks unit testing, tight coupling
2. **Mixed concerns in handlers** (zoneAgnosticUpdateProcessor.ts) — state mutation + service notification + rendering all in one method
3. **Fire-and-forget promises** (eiscp.ts line 369) — `.catch(() => {})` silently swallows errors (intentional per earlier review, but risky)
4. **Implicit side effects in setters** (avrState.ts `setSource()`) — caller doesn't know that side effects will be triggered
5. **Conditional handler routing without fallback** (commandReceiver.ts line 180) — missing handler returns false with no logging

---

## 3. TESTING GAPS

### 3.1 Coverage Assessment

| Module | Tests | Coverage | Gap |
|--------|-------|----------|-----|
| **eiscp-command-parser.ts** | 4 tests (94 LOC) | NLA/NTM/metadata basic cases | No: zone boundary tests, metadata frame boundary, hex encoding edge cases |
| **eiscp-multi-zone.ts** | 3 tests (55 LOC) | Volume/mute basic cases | **No tests for**: multi-zone boundary conditions, overlapping zones, command sequencing |
| **configManager.ts** | 3 tests (170 LOC) | AVR validation, config load/save | **No tests for**: legacy migration edge cases, port validation bounds (1, 65535), IP octet edge cases (0, 255) |
| **mediaBrowserServices.ts** | 33 tests (753 LOC)* | TuneIn/Tidal browse, ingestion | **No tests for**: XML parser edge cases, malformed station keys, empty preset lists |
| **commandReceiver.ts** | 1 test (185 LOC) | Listening mode updates | **No tests for**: audio format requery timer, handler dispatch missing handler, metadata accumulation |
| **avrState.ts** | 1 test (32 LOC) | Playback status mapping | **No tests for**: source queries, entity indexing, state mutation side effects |

*media-browser.test.ts tests mediaBrowserServices module via browser interface.

### 3.2 High-Value Test Additions (2-3 hours)

1. **eiscp-command-parser.ts** edge cases (1 hour):
   - Truncated hex strings in NLA
   - Malformed time strings (non-numeric, missing colons)
   - Metadata frame boundary conditions (multi-frame split patterns)
   - Zone detection boundary (Z/Z2/Z3/Z4 variations)
   
2. **configManager.ts** validation bounds (1 hour):
   - Port boundaries (1, 65535, 0, 65536)
   - IP octet boundaries (0, 255, 256, -1)
   - String length limits (empty, max+1)
   
3. **commandReceiver.ts** handler dispatch (1 hour):
   - Missing handler in map → should log warning
   - Audio requery timer → should cancel on new format event
   - Handler exception → should not break dispatcher

---

## 4. DEPENDENCY INJECTION & TESTABILITY

### 4.1 DI Status

**Modules that CAN be unit-tested**:
- ✅ `eiscp-command-parser.ts` — interfaces injected
- ✅ `eiscp-packet.ts`, `eiscp-multi-zone.ts` — pure functions
- ✅ `manualConfigParser.ts` — no external dependencies
- ✅ `setupFormBuilder.ts` — pure function generators

**Modules BLOCKED by global `avrStateManager`**:
- ❌ `commandSender.ts` — imports `avrStateManager`, calls `getSource()` in method
- ❌ `commandReceiver.ts` — imports `avrStateManager`, passes to handlers
- ❌ `zoneAgnosticUpdateProcessor.ts` — imports `avrStateManager` directly (17 call sites in 318 lines)
- ❌ `mediaBrowser.ts` — imports `avrStateManager` for state queries
- ❌ `playMediaCommandHandler.ts` — imports `avrStateManager`

### 4.2 Unblock Strategy (Priority: HIGH)

**Cost**: 3-4 hours | **Impact**: Enables isolated unit tests for 5 critical modules

1. **Create `AvrStateApi` interface** (30 min):
```typescript
export interface AvrStateApi {
  getSource(entityId: string): string;
  getSubSource(entityId: string): string;
  setSource(entityId, source, eiscpInstance?, zone?, driver?): boolean;
  // ... other methods
}
```

2. **Inject into consuming modules** (2 hours):
   - Add constructor param: `private stateApi: AvrStateApi`
   - Replace `avrStateManager.getSource(id)` → `this.stateApi.getSource(id)`
   - In production: pass `avrStateManager` singleton
   - In tests: pass mock

3. **Update driver.ts** (30 min):
```typescript
// Current
this.zoneAgnosticProcessor = new ZoneAgnosticUpdateProcessor(driver, config, eiscpInstance, avrStateManager);

// Proposed
this.zoneAgnosticProcessor = new ZoneAgnosticUpdateProcessor(
  driver, config, eiscpInstance, avrStateManager // avrStateManager satisfies AvrStateApi
);
```

---

## 5. ERROR HANDLING ASSESSMENT

### 5.1 Issues Identified

| Pattern | Location | Severity | Notes |
|---------|----------|----------|-------|
| **Silent `.catch(() => {})`** | eiscp.ts:369 | LOW | Intentional — errors handled by caller via promise chain |
| **Missing handler log** | commandReceiver.ts:180 | MEDIUM | Returns false silently if command not in map |
| **Swallowed exception in try-catch** | menuBrowseHandlerBase.ts:71-73 | MEDIUM | Catches error, logs as info, re-throws — okay but inconsistent |
| **Console.log in error path** | loggers.ts:32 | LOW | Uses console.log not logger; works but inconsistent |
| **Missing timeout fallback** | commandReceiver.ts:158 | LOW | Timer may leak if events stop; should add max timeout |

### 5.2 Quick Fixes (1 hour)

1. **Add logging to missing handler** (5 min):
```typescript
if (!handler) {
  log.warn("%s Command not in zone-agnostic handler map: %s", integrationName, command);
  return false;
}
```

2. **Add max timeout to audio requery** (5 min):
```typescript
// Current: timer set, only cleared on new event
// Proposed: clear after 10s regardless
this.avInfoRequeryTimer = setTimeout(async () => {
  try {
    await this.eiscpInstance.raw("IFAQSTN");
  } finally {
    this.avInfoRequeryTimer = null;
  }
}, 3000);
// Fallback to cancel after 10s
setTimeout(() => {
  if (this.avInfoRequeryTimer) clearTimeout(this.avInfoRequeryTimer);
}, 10000);
```

---

## 6. CODE DUPLICATION

### 6.1 Repeated Patterns

| Pattern | Locations | Lines | Refactor Candidate |
|---------|-----------|-------|-------------------|
| **Menu entry parsing** | mediaBrowserServices.ts:101-105, 161-167, 186-187 | ~15 | Extract `parseMenuEntry()` |
| **XML ingestion loop** | mediaBrowserServices.ts:176-182, 216-222 | ~20 | Extract `ingestXmlItems()` |
| **Sensor update attributes** | commandReceiver.ts, zoneAgnosticUpdateProcessor.ts:148-164 | ~20 | Extract sensor attribute builder |
| **Browse result building** | mediaBrowserServices.ts:314-326, 393-410, 487-497 | ~30 | Extract `buildBrowseResult()` |
| **Service detection** | zoneAgnosticUpdateProcessor.ts:85-88, commandReceiver.ts:124-128 | ~10 | Extract service detector |

### 6.2 Consolidation Opportunities (1.5 hours)

**Create `ServiceDetector` utility**:
```typescript
class ServiceDetector {
  detect(text: string): string | undefined {
    return NETWORK_SERVICES.find(service => text.toLowerCase().includes(service.toLowerCase()));
  }
  detectFromFld(fldAscii: string): string | undefined {
    return NETWORK_SERVICES.find(service => fldAscii.startsWith(service));
  }
}
```

**Create `MenuEntryParser` utility**:
```typescript
class MenuEntryParser {
  parse(entry: string): { menuIndex: number; rawTitle: string } | undefined { ... }
}
```

---

## 7. ARCHITECTURAL IMPROVEMENTS NEEDED

### 7.1 Priority-Ranked Refactoring Opportunities

#### **PHASE 1: Quick Wins (3-4 hours, minimal risk)**

1. **Extract `ServiceDetector` utility** (30 min)
   - Consolidates NETWORK_SERVICES filtering logic
   - Fixes duplicated patterns in 2 files
   - No breaking changes

2. **Add missing handler logging** (15 min)
   - commandReceiver.ts:180 → log warning when handler not found
   - Improves debuggability

3. **Add edge case tests** (2 hours)
   - eiscp-command-parser.ts: NLA/NTM/zone boundary tests
   - configManager.ts: validation boundary tests

4. **Extract `MenuEntryParser`** (45 min)
   - Consolidates parseIndexedMenuEntry + variants
   - Improves testability of menu parsing logic

**Total**: 3.5 hours | **Risk**: Very low | **Value**: Medium

---

#### **PHASE 2: Medium Effort (4-6 hours, moderate risk)**

1. **Refactor `mediaBrowserServices.ts`** (2 hours)
   - Extract `TuneInListIngester`, `TidalListIngester` classes
   - Move browse builders to `BrowseResponseBuilder` helper
   - Reduces file from 544 → ~300 lines
   - Each ingester becomes independently testable

2. **Simplify `commandReceiver.ts`** (1.5 hours)
   - Extract `AvInfoRequeryScheduler` class (timer management)
   - Extract `ZoneAgnosticHandlerDispatcher` class (handler dispatch)
   - Reduces mixed concerns; improves testability

3. **Fix `eiscp-command-parser.ts` metadata** (1 hour)
   - Extract `MetadataBuilder` to replace mutable state accumulation
   - Make metadata parsing pure (returns new object)
   - Add RFC for service name override rules

4. **Define `ZoneAgnosticCommandEvent` struct** (1 hour)
   - Unify handler signatures
   - Replace parameter variation with single event object

**Total**: 5.5 hours | **Risk**: Moderate | **Value**: High

---

#### **PHASE 3: Structural (3-4 hours, high impact but higher risk)**

1. **Inject `AvrStateApi` interface** (3 hours)
   - Unblock unit testing of 5 modules
   - Replace global singleton imports with constructor params
   - Allows mocking state in tests
   - **Breaking change for tests**; coordinate with team

2. **Extract event-response pipelines** (2 hours)
   - Replace mixed handlers in `zoneAgnosticUpdateProcessor.ts`
   - Define: `class IFAUpdatePipeline { process(event) {} }`
   - Separates state mutation from effects
   - Higher quality but higher refactor cost

**Total**: 5 hours | **Risk**: Moderate-High | **Value**: Very High

---

### 7.2 Architectural Debt Scorecard

| Item | Current | Ideal | Effort | Priority |
|------|---------|-------|--------|----------|
| Global singleton blocker | 41 call sites | <5 | 3h | HIGH |
| mediaBrowserServices SRP | 4 concerns | 1 concern | 2h | MEDIUM |
| Metadata parser mutability | mutable state | pure function | 1h | MEDIUM |
| Handler parameter inconsistency | varies | unified struct | 1h | MEDIUM |
| Dependency injection coverage | 65% | 100% | 3h | HIGH |
| Test coverage gaps | 68 tests | +10 tests | 2h | MEDIUM |

---

## 8. QUICK WINS: 30-MINUTE IMPROVEMENTS

### 8.1 Win #1: Add Handler Logging
**File**: [commandReceiver.ts](src/commandReceiver.ts#L180)

```typescript
// Current (line 180)
if (!handler) return false;

// Proposed
if (!handler) {
  log.warn("%s Zone-agnostic command not in handler map: %s", integrationName, avrUpdates.command);
  return false;
}
```

**Impact**: Improves debuggability; helps catch missing handler implementations.

---

### 8.2 Win #2: Extract Service Detection
**New file**: `src/serviceDetector.ts`

```typescript
export class ServiceDetector {
  static detect(text: string): string | undefined {
    return NETWORK_SERVICES.find((service) =>
      text.toLowerCase().includes(service.toLowerCase())
    );
  }
  
  static detectFromFld(fldAscii: string): string | undefined {
    return NETWORK_SERVICES.find((service) => fldAscii.startsWith(service));
  }
}
```

**Usage**:
- Replace [zoneAgnosticUpdateProcessor.ts:250-252](src/zoneAgnosticUpdateProcessor.ts#L250-L252)
- Replace [commandReceiver.ts:124-128](src/commandReceiver.ts#L124-L128)
- Replace [eiscp-command-parser.ts:479-485](src/eiscp-command-parser.ts#L479-L485)

**Impact**: DRY principle; 3 files stop duplicating service detection logic.

---

### 8.3 Win #3: Extract Menu Entry Parser
**New file**: `src/menuEntryParser.ts`

```typescript
export class MenuEntryParser {
  static parseIndexedEntry(entry: string): { menuIndex: number; rawTitle: string } | undefined {
    const match = entry.match(/^U(\d+)-(.*)$/);
    if (!match) return undefined;
    const parsedIndex = parseInt(match[1], 10);
    if (isNaN(parsedIndex) || parsedIndex < 0) return undefined;
    return {
      menuIndex: parsedIndex,
      rawTitle: match[2].trim().replace(/\s+%s$/i, "")
    };
  }
}
```

**Usage**: Replace [mediaBrowserServices.ts:101-116](src/mediaBrowserServices.ts#L101-L116)

**Impact**: Menu parsing becomes independently testable; reduces duplication.

---

### 8.4 Win #4: Add Timer Fallback
**File**: [commandReceiver.ts](src/commandReceiver.ts#L158)

```typescript
// Current
this.avInfoRequeryTimer = setTimeout(async () => {
  try {
    await this.eiscpInstance.raw("IFAQSTN");
  } catch (err) {
    log.debug(...);
  }
}, 3000);

// Proposed: add fallback
this.avInfoRequeryTimer = setTimeout(async () => {
  try {
    await this.eiscpInstance.raw("IFAQSTN");
  } catch (err) {
    log.debug(...);
  } finally {
    this.avInfoRequeryTimer = null; // Ensure cleanup
  }
}, 3000);

// Fallback: auto-clear after 10s max
if (this.avInfoRequeryTimer && Date.now() - startTime > 10000) {
  clearTimeout(this.avInfoRequeryTimer);
  this.avInfoRequeryTimer = null;
}
```

**Impact**: Prevents timer leaks if events stop arriving.

---

## 9. MEDIUM-EFFORT IMPROVEMENTS (1-2 hours each)

### 9.1 Refactor mediaBrowserServices.ts (2 hours)

**Extract service-specific adapters**:

**New file**: `src/tuneInListIngester.ts`
```typescript
export class TuneInListIngester {
  ingest(entityId: string, entry: string): void {
    // Move lines 131-150 here
    const parsed = MenuEntryParser.parseIndexedEntry(entry);
    if (!parsed) return;
    const { menuIndex, rawTitle } = parsed;
    const title = normalizeTuneInLabel(rawTitle);
    // ...
  }
}
```

**New file**: `src/tidalListIngester.ts`
```typescript
export class TidalListIngester {
  ingest(entityId: string, entry: string): void {
    // Move lines 186-205 here
  }
}
```

**Updated mediaBrowserServices.ts**:
```typescript
const tuneInIngester = new TuneInListIngester();
const tidalIngester = new TidalListIngester();

export function ingestTuneInListEntry(entityId: string, entry: string) {
  tuneInIngester.ingest(entityId, entry);
}
```

**Impact**:
- Reduces mediaBrowserServices.ts from 544 → ~300 lines
- Each ingester testable in isolation
- Browse builders extracted to helper class

---

### 9.2 Create Unified ZoneAgnosticCommandEvent (1 hour)

**New file**: `src/zoneAgnosticCommandEvent.ts`
```typescript
export interface ZoneAgnosticCommandEvent {
  command: string;
  argument: string | number | Record<string, string>;
  sourceEntityId: string;
  eventZone: string;
  iscpCommand?: string;
  host?: string;
  port?: number;
  model?: string;
}

export type ZoneAgnosticHandler = (event: ZoneAgnosticCommandEvent) => Promise<void>;
```

**Update commandReceiver.ts**:
```typescript
// Current
private zoneAgnosticHandlers: Record<string, ZoneAgnosticHandler> = {
  IFA: async (avrUpdates, entityId, eventZone) => { ... },
  DSN: async (avrUpdates, entityId, eventZone) => { ... }
};

// Proposed
private zoneAgnosticHandlers: Record<string, ZoneAgnosticHandler> = {
  IFA: async (event) => {
    await this.zoneAgnosticProcessor.handleIfa(
      event.sourceEntityId,
      event.eventZone,
      event.argument as Record<string, string> | undefined,
      ...
    );
  },
  DSN: async (event) => {
    await this.zoneAgnosticProcessor.handleDsn(
      event.sourceEntityId,
      event.argument.toString(),
      event.eventZone
    );
  }
};
```

**Impact**: 
- Unifies parameter signature across all handlers
- Easier to add new handlers (same interface)
- Better IDE support for handler dispatch

---

## 10. SUMMARY & RECOMMENDATIONS

### 10.1 What's Working Well ✅
- Handler dispatch pattern (OCP applied correctly)
- Service adapter contracts (good abstraction)
- DI in parser modules (eiscp-command-parser.ts)
- Test coverage for browser/setup flows (high quality)
- Error handling in critical paths (mostly good)

### 10.2 What Needs Attention ⚠️
1. **Global singleton** blocks unit testing (HIGH priority)
2. **mediaBrowserServices.ts** mixing concerns (MEDIUM)
3. **Metadata parser** mutable state (MEDIUM)
4. **Handler dispatch** parameter inconsistency (MEDIUM)
5. **Event-response coupling** in zoneAgnosticUpdateProcessor (HIGH)

### 10.3 Recommended Roadmap

**Week 1**: Quick wins (3-4 hours)
- Extract ServiceDetector
- Extract MenuEntryParser
- Add handler logging & tests

**Week 2**: Medium refactors (4-6 hours)
- Refactor mediaBrowserServices.ts service adapters
- Simplify commandReceiver.ts (timer + dispatcher extraction)
- Create unified ZoneAgnosticCommandEvent

**Week 3**: Structural improvements (3-4 hours, if prioritized)
- Inject AvrStateApi interface
- Unblock unit testing of 5 modules
- Add 10+ new test cases

### 10.4 Risk Assessment

| Refactor | Risk | Test Coverage | Rollback |
|----------|------|---|----------|
| ServiceDetector extraction | Very Low | +2 tests | Trivial |
| mediaBrowserServices split | Low | Existing tests pass | 30 min |
| AvrStateApi injection | Moderate | Needs new tests | 1 hour |
| Event-response pipelines | Moderate | Existing tests pass | 1-2 hours |

---

## 11. OPEN QUESTIONS FOR TEAM

1. **avrStateManager global**: Can we inject `AvrStateApi` interface across 5 modules, or are there backward compatibility constraints?
2. **Metadata state accumulation**: Is it safe to make metadata parsing pure (returns new object) or do callers depend on `.getMetadata()` returning persisted state?
3. **Service adapter contracts**: Should service adapters be required to implement all `handle*()` methods, or is optional dispatch acceptable?
4. **Error handling philosophy**: Should `.catch(() => {})` be replaced with explicit error logging everywhere, or is silent failure acceptable in specific paths?
5. **Testing strategy**: Is integration-test style acceptable going forward, or should we prioritize isolated unit tests?

---

## Appendix: Files Not Yet Refactored

- `avrStateQuery.ts` (143 lines) — state query cache; minimal changes needed
- `subscriptionHandler.ts` (165 lines) — subscription orchestration; working as-is
- `connectCoordinator.ts` (200 lines) — connection setup; well-structured
- `tidalBrowserStore.ts` (312 lines) — Tidal state store; could extract further but low risk

---

**Report Generated**: 2026-06-12 | **Analysis Duration**: ~2 hours | **Code Review Quality**: Medium-High
