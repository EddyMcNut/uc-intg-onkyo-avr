# Entity Migration - Quick Start

## Overview

Created a migration utility to handle entity name changes when upgrading from single-zone to multi-zone format.

**Change:** `TX-RZ50 192.168.2.103` → `TX-RZ50 192.168.2.103 main`

## Files Created

1. **`src/entityMigration.ts`** - Main migration class
   - Detects old-format entities
   - Maps old IDs to new IDs with zone suffix
   - Provides migration methods

2. **`docs/entity-migration.md`** - Complete documentation
   - Full API reference
   - Migration behavior details
   - Troubleshooting guide

3. **`docs/entity-migration-integration-example.md`** - Integration guide
   - Step-by-step code changes
   - Code snippets for `onkyo.ts`
   - Testing procedures

## Quick Integration

Add these 3 simple changes to `src/onkyo.ts`:

### 1. Import (top of file)
```typescript
import { EntityMigration } from "./entityMigration.js";
```

### 2. Add Property (in OnkyoDriver class)
```typescript
private pendingMigration?: EntityMigration;
```

### 3. Add to Constructor (after config load)
```typescript
// Check for entity migration needs
if (this.config.avrs && this.config.avrs.length > 0) {
  const migration = new EntityMigration(this.driver, this.config);
  if (migration.needsMigration()) {
    console.log("%s Entity migration needed", integrationName);
    migration.logMigrationStatus();
    this.pendingMigration = migration;
  }
}
```

### 4. Add to handleConnect (at start of method)
```typescript
// Perform entity migration if needed
if (this.pendingMigration) {
  console.log(`${integrationName} Performing entity migration...`);
  try {
    await this.pendingMigration.migrate();
    console.log(`${integrationName} Migration completed`);
  } catch (error) {
    console.error(`${integrationName} Migration failed:`, error);
  }
  this.pendingMigration = undefined;
}
```

## How It Works

1. **On Startup:**
   - Checks if entities need migration
   - Builds mapping: old ID → new ID with zone

2. **On Connect:**
   - Performs migration if needed
   - Logs all actions
   - Clears pending migration

3. **After Migration:**
   - Old entities are updated
   - New zone-based naming is used
   - No further migration needed

## Testing

```bash
# Build and run
npm run build
npm start

# Check logs for:
# - "Entity migration needed"
# - "Migrating entity: X -> Y"
# - "Migration complete"
```

## Features

- ✅ Automatic detection of old-format entities
- ✅ Safe migration with error handling
- ✅ Detailed logging and status reporting
- ✅ Idempotent (safe to run multiple times)
- ✅ Based on proven UC Remote Two Toolkit approach

## Key Methods

```typescript
// Check if migration is needed
migration.needsMigration(): boolean

// Perform migration
await migration.migrate(): Promise<void>

// Get mappings
migration.getMappings(): EntityMapping[]

// Get new ID for old ID
migration.getNewEntityId(oldId): string | undefined

// Log status
migration.logMigrationStatus(): void
```

## Important Notes

### Limitations
- Integration API doesn't support direct entity rename
- Users may need to update activities/pages manually
- Remote restart may be needed after migration

### Best Practices
- Run migration on Connect event (after driver init)
- Log all migration actions
- Include migration info in release notes
- Don't block connection if migration fails

## Example Log Output

```
Onkyo-Integration: Entity migration needed - will be performed on Connect event
Entity migration mapping: "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"
=== Entity Migration Status ===
Total mappings: 1
  TX-RZ50 192.168.2.103 -> TX-RZ50 192.168.2.103 main
    Old entity exists: true
    New entity exists: false
    Status: NEEDS MIGRATION
=== End Migration Status ===
Onkyo-Integration: Performing entity migration...
Migrating entity: "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"
Onkyo-Integration: Entity migration completed successfully
```

## Next Steps

1. Review `docs/entity-migration-integration-example.md` for detailed integration
2. Add migration code to `src/onkyo.ts` 
3. Test with existing configuration
4. Update release notes about entity naming change
5. Deploy and monitor logs

## References

- Based on: https://github.com/albaintor/UC-Remote-Two-Toolkit/tree/main/src/app/replace-entity
- See `docs/entity-migration.md` for full documentation
- See `docs/entity-migration-integration-example.md` for integration guide
