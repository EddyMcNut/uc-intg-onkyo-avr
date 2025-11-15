# Entity Migration Guide

## Overview

The `EntityMigration` class handles the automatic migration of entity names when upgrading from the single-zone format to the multi-zone format.

**Old format:** `TX-RZ50 192.168.2.103`  
**New format:** `TX-RZ50 192.168.2.103 main`

## How It Works

The migration utility:
1. Analyzes the current configuration to identify which entities need migration
2. Builds mappings between old entity IDs (without zone) and new entity IDs (with zone)
3. Detects existing old-format entities in the Remote's configured entities
4. Provides methods to migrate entities to the new naming format

## Integration into Your Driver

### Step 1: Import the Migration Class

Add the import to your `onkyo.ts` file:

```typescript
import { EntityMigration } from "./entityMigration.js";
```

### Step 2: Add Migration to Constructor

In the `OnkyoDriver` constructor, after loading the config:

```typescript
constructor() {
  this.driver = new uc.IntegrationAPI();
  this.config = ConfigManager.load();
  this.driver.init("driver.json", this.handleDriverSetup.bind(this));
  this.setupDriverEvents();
  this.setupEventHandlers();
  console.log("Loaded config at startup:", this.config);

  // Check for entity migration needs
  const migration = new EntityMigration(this.driver, this.config);
  if (migration.needsMigration()) {
    console.log("Entity migration needed - will be performed on Connect event");
    this.pendingMigration = migration;
  }

  // Register entities from config at startup
  if (this.config.avrs && this.config.avrs.length > 0) {
    this.registerAvailableEntities();
  }
}
```

### Step 3: Add Migration Property

Add a property to store the pending migration:

```typescript
export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private physicalConnections: Map<string, PhysicalAvrConnection> = new Map();
  private avrInstances: Map<string, AvrInstance> = new Map();
  private pendingMigration?: EntityMigration; // Add this line
  // ... rest of properties
}
```

### Step 4: Perform Migration on Connect

Modify the `handleConnect` method to perform migration before connecting:

```typescript
private async handleConnect() {
  console.log(`${integrationName} ===== HANDLING CONNECT =====`);

  // Perform entity migration if needed
  if (this.pendingMigration) {
    console.log(`${integrationName} Performing entity migration...`);
    this.pendingMigration.logMigrationStatus();
    await this.pendingMigration.migrate();
    this.pendingMigration = undefined; // Clear after migration
  }

  // Continue with normal connection handling
  if (!this.config.avrs || this.config.avrs.length === 0) {
    console.error(`${integrationName} No AVRs configured`);
    await this.driver.setDeviceState(uc.DeviceStates.Error);
    return;
  }

  // ... rest of handleConnect implementation
}
```

## Migration Behavior

### When Migration is Needed

Migration is needed when:
- An AVR was previously configured without zone information
- The old entity ID exists in the Remote's configured entities
- The new entity ID (with zone suffix) doesn't exist yet

### What Happens During Migration

1. **Detection Phase:**
   - Scans configuration for AVRs
   - Identifies entities using old naming format
   - Builds mapping between old and new entity IDs

2. **Migration Phase:**
   - Checks if old entity exists
   - Checks if new entity already exists
   - Logs migration actions

3. **Cleanup Phase:**
   - Removes old entities that have been replaced
   - Ensures no duplicate entities remain

## API Methods

### `needsMigration(): boolean`
Returns `true` if any entities need migration from old to new format.

### `migrate(): Promise<void>`
Performs the actual migration of entities.

### `getMappings(): EntityMapping[]`
Returns all entity mappings for inspection.

### `getNewEntityId(oldEntityId: string): string | undefined`
Gets the new entity ID for a given old entity ID.

### `getOldEntityId(newEntityId: string): string | undefined`
Gets the old entity ID for a given new entity ID.

### `isOldFormat(entityId: string): boolean`
Checks if an entity ID uses the old format.

### `isNewFormat(entityId: string): boolean`
Checks if an entity ID uses the new format.

### `logMigrationStatus(): void`
Logs detailed migration status for debugging.

## Important Notes

### Remote Core API Limitations

The current implementation is limited by the Unfolded Circle Integration API capabilities:

1. **No Direct Rename:** The Integration API doesn't provide a direct method to rename entity IDs
2. **Manual Update Required:** Users may need to manually update activities, pages, and macros that reference old entity IDs
3. **Remote Restart:** A restart of the Remote may be needed to complete the migration

### Recommended Approach

For production use, consider one of these approaches:

1. **Automatic Migration (Recommended for Seamless Upgrade):**
   - Implement during the Connect event
   - Log all migration actions
   - Provide clear user notifications

2. **User-Prompted Migration:**
   - Detect migration needs
   - Show a setup prompt asking user to confirm migration
   - Perform migration only after confirmation

3. **Documentation-Based Migration:**
   - Document the naming change in release notes
   - Provide instructions for users to manually update their configurations
   - The migration class can help identify which entities need updates

## Example Usage

### Basic Migration Check

```typescript
const migration = new EntityMigration(this.driver, this.config);

if (migration.needsMigration()) {
  console.log("Migration needed!");
  migration.logMigrationStatus();
  
  const mappings = migration.getMappings();
  for (const mapping of mappings) {
    console.log(`Will migrate: ${mapping.oldEntityId} -> ${mapping.newEntityId}`);
  }
}
```

### Performing Migration

```typescript
const migration = new EntityMigration(this.driver, this.config);

if (migration.needsMigration()) {
  await migration.migrate();
  console.log("Migration complete!");
}
```

### Checking Individual Entities

```typescript
const migration = new EntityMigration(this.driver, this.config);

const oldId = "TX-RZ50 192.168.2.103";
if (migration.isOldFormat(oldId)) {
  const newId = migration.getNewEntityId(oldId);
  console.log(`Entity ${oldId} should be migrated to ${newId}`);
}
```

## Testing

### Test Scenarios

1. **Fresh Install (No Migration Needed):**
   - New configuration with zones
   - No old entities exist
   - Migration should be skipped

2. **Upgrade from Single Zone:**
   - Old entity: `TX-RZ50 192.168.2.103`
   - New entity: `TX-RZ50 192.168.2.103 main`
   - Migration should rename entity

3. **Multiple Zones Added:**
   - Old entity: `TX-RZ50 192.168.2.103`
   - New entities: 
     - `TX-RZ50 192.168.2.103 main`
     - `TX-RZ50 192.168.2.103 zone2`
     - `TX-RZ50 192.168.2.103 zone3`
   - Old entity should migrate to main zone

4. **Already Migrated:**
   - Only new-format entities exist
   - Migration should be skipped

### Test Commands

```bash
# Build and run with migration
npm run build
npm start

# Check logs for migration messages
# Look for: "Entity migration needed"
# Look for: "Migrating entity: X -> Y"
# Look for: "Migration complete"
```

## Troubleshooting

### Migration Not Detected

**Symptoms:** Migration doesn't run even though old entities exist

**Solutions:**
- Check that `needsMigration()` is called after driver initialization
- Verify config has AVRs defined
- Check that `getConfiguredEntities()` is available

### Entities Not Updated

**Symptoms:** Old entities still appear after migration

**Solutions:**
- Restart the Remote to refresh entity list
- Check Remote Core logs for API errors
- Manually remove old entities from Remote configuration

### Duplicate Entities

**Symptoms:** Both old and new format entities exist

**Solutions:**
- Run cleanup to remove old entities
- Check that migration completed successfully
- Manually delete old entities from Remote

## Related Files

- `src/entityMigration.ts` - Migration class implementation
- `src/onkyo.ts` - Main driver file (integrate migration here)
- `src/configManager.ts` - Configuration management
- `docs/entity-migration.md` - This document

## Future Enhancements

Potential improvements for the migration system:

1. **Remote API Integration:** Direct API calls to Remote Core for entity renaming
2. **Activity Updates:** Automatically update activities that reference old entities
3. **Rollback Support:** Ability to rollback migration if issues occur
4. **Migration History:** Track migration history in config file
5. **Batch Operations:** Migrate multiple entities in a single API call
