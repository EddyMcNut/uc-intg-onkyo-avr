# Entity Migration Integration Example

This document shows the exact code changes needed to integrate the `EntityMigration` class into your `onkyo.ts` file.

## Step 1: Add Import

At the top of `src/onkyo.ts`, add the import:

```typescript
import { EntityMigration } from "./entityMigration.js";
```

## Step 2: Add Property to OnkyoDriver Class

Add this property to the `OnkyoDriver` class:

```typescript
export default class OnkyoDriver {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private physicalConnections: Map<string, PhysicalAvrConnection> = new Map();
  private avrInstances: Map<string, AvrInstance> = new Map();
  private pendingMigration?: EntityMigration; // <-- ADD THIS LINE
  // ... rest of properties
}
```

## Step 3: Add Migration Check to Constructor

Modify the `constructor()` to check for migration needs:

```typescript
constructor() {
  this.driver = new uc.IntegrationAPI();
  this.config = ConfigManager.load();
  this.driver.init("driver.json", this.handleDriverSetup.bind(this));
  this.setupDriverEvents();
  this.setupEventHandlers();
  console.log("Loaded config at startup:", this.config);

  // ADD THIS SECTION: Check for entity migration needs
  if (this.config.avrs && this.config.avrs.length > 0) {
    const migration = new EntityMigration(this.driver, this.config);
    if (migration.needsMigration()) {
      console.log("%s Entity migration needed - will be performed on Connect event", integrationName);
      migration.logMigrationStatus();
      this.pendingMigration = migration;
    } else {
      console.log("%s No entity migration needed", integrationName);
    }
  }
  // END OF NEW SECTION

  // Register entities from config at startup (existing code)
  if (this.config.avrs && this.config.avrs.length > 0) {
    this.registerAvailableEntities();
  }
}
```

## Step 4: Perform Migration in handleConnect

Modify the `handleConnect()` method to perform migration:

```typescript
private async handleConnect() {
  console.log(`${integrationName} ===== HANDLING CONNECT =====`);

  // ADD THIS SECTION: Perform entity migration if needed
  if (this.pendingMigration) {
    console.log(`${integrationName} Performing entity migration...`);
    this.pendingMigration.logMigrationStatus();
    
    try {
      await this.pendingMigration.migrate();
      console.log(`${integrationName} Entity migration completed successfully`);
    } catch (error) {
      console.error(`${integrationName} Entity migration failed:`, error);
      // Continue anyway - don't block connection due to migration failure
    }
    
    this.pendingMigration = undefined; // Clear after migration attempt
  }
  // END OF NEW SECTION

  // Continue with normal connection handling (existing code)
  if (!this.config.avrs || this.config.avrs.length === 0) {
    console.error(`${integrationName} No AVRs configured`);
    await this.driver.setDeviceState(uc.DeviceStates.Error);
    return;
  }

  // ... rest of handleConnect implementation
}
```

## Testing the Migration

### Prerequisites

Start with an existing Remote configuration that has an old-format entity:
- Old entity ID: `TX-RZ50 192.168.2.103`
- Config with zone: `{ "model": "TX-RZ50", "ip": "192.168.2.103", "zone": "main" }`

### Expected Log Output

When you run the integration, you should see:

```
Onkyo-Integration: Loaded config at startup: {...}
Onkyo-Integration: Entity migration needed - will be performed on Connect event
Entity migration mapping: "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"
=== Entity Migration Status ===
Total mappings: 1
  TX-RZ50 192.168.2.103 -> TX-RZ50 192.168.2.103 main
    Old entity exists: true
    New entity exists: false
    Status: NEEDS MIGRATION
=== End Migration Status ===
Onkyo-Integration: ===== CONNECT EVENT RECEIVED =====
Onkyo-Integration: Performing entity migration...
Migrating entity: "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"
Onkyo-Integration: Entity migration completed successfully
```

### After Migration

On subsequent restarts, you should see:

```
Onkyo-Integration: Loaded config at startup: {...}
Onkyo-Integration: No entity migration needed
```

## Alternative: Migration During Setup

If you prefer to migrate during the setup phase instead of the connect phase, you can add migration logic to `handleDriverSetup()`:

```typescript
private async handleDriverSetup(msg: uc.SetupDriver): Promise<uc.SetupAction> {
  console.log("%s ===== SETUP HANDLER CALLED =====", integrationName);
  
  // Check for migration needs at setup time
  if (msg.reconfigure === false && this.config.avrs && this.config.avrs.length > 0) {
    const migration = new EntityMigration(this.driver, this.config);
    if (migration.needsMigration()) {
      console.log("%s Entity migration detected during setup", integrationName);
      migration.logMigrationStatus();
      
      // Perform automatic migration
      try {
        await migration.migrate();
        console.log("%s Entity migration completed during setup", integrationName);
      } catch (error) {
        console.error("%s Entity migration failed during setup:", integrationName, error);
      }
    }
  }

  // ... rest of setup handler
}
```

## Optional Helper Methods

### Check Migration Status Anytime

```typescript
private checkMigrationStatus(): void {
  if (!this.config.avrs || this.config.avrs.length === 0) {
    return;
  }

  const migration = new EntityMigration(this.driver, this.config);
  if (migration.needsMigration()) {
    console.log("%s Entity migration is needed!", integrationName);
    migration.logMigrationStatus();
  } else {
    console.log("%s No entity migration needed", integrationName);
  }
}
```

### Manual Migration Trigger

```typescript
private async performManualMigration(): Promise<void> {
  console.log("%s Manual migration triggered", integrationName);
  
  const migration = new EntityMigration(this.driver, this.config);
  
  if (!migration.needsMigration()) {
    console.log("%s No migration needed", integrationName);
    return;
  }

  console.log("%s Starting migration...", integrationName);
  migration.logMigrationStatus();

  try {
    await migration.migrate();
    console.log("%s Migration completed successfully", integrationName);
    
    // Optionally, re-register entities after migration
    this.registerAvailableEntities();
  } catch (error) {
    console.error("%s Migration failed:", integrationName, error);
    throw error;
  }
}
```

## Important Notes

### Remote Core API Limitations

The current Integration API has limitations:
1. No direct entity rename function
2. Entity updates require Remote restart in some cases
3. Activities and pages may need manual updates

### Recommended Approach

For the best user experience:
1. Perform migration automatically on first Connect after upgrade
2. Log all migration actions for debugging
3. Include migration information in release notes
4. Consider a "force migration" command for troubleshooting

### User Communication

In your release notes, include:
```
## Breaking Change: Entity Naming

This version changes entity naming to include zone information:
- Old: "TX-RZ50 192.168.2.103"
- New: "TX-RZ50 192.168.2.103 main"

The integration will attempt automatic migration on first run.
If you encounter issues, please:
1. Check the integration logs for migration status
2. Restart your Remote
3. Manually update any activities that reference old entity names
```

## Troubleshooting

### Migration Not Running

**Check:**
- `needsMigration()` returns true
- Config has AVRs defined
- Old entity exists in Remote

**Solution:**
- Add log statements to track migration flow
- Call `migration.logMigrationStatus()` to see details

### Entities Not Updated

**Check:**
- Remote has been restarted
- New entity is registered
- Old entity is removed

**Solution:**
- Manually remove old entity from Remote
- Re-add entity with new name
- Update activities/pages that use the entity

### Duplicate Entities

**Check:**
- Both old and new entity exist
- Migration completed but old entity wasn't removed

**Solution:**
- Manually delete old entity from Remote UI
- Or call migration again with cleanup logic

## Related Files

- `src/entityMigration.ts` - Migration class
- `src/onkyo.ts` - Main driver (where you integrate)
- `docs/entity-migration.md` - Full migration documentation
- `docs/entity-migration-integration-example.md` - This file
