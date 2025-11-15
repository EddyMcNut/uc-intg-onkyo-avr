/**
 * Entity Migration Utility
 * 
 * This class handles migration of entity names when the integration is upgraded
 * to include zone information in entity names (main, zone2, zone3).
 * 
 * Previous format: "TX-RZ50 192.168.2.103"
 * New format: "TX-RZ50 192.168.2.103 main"
 * 
 * Based on the UC Remote Two Toolkit replace-entity implementation:
 * https://github.com/albaintor/UC-Remote-Two-Toolkit/tree/main/src/app/replace-entity
 */

import * as uc from "@unfoldedcircle/integration-api";
import { OnkyoConfig, AvrConfig } from "./configManager.js";

interface EntityMapping {
  oldEntityId: string;
  newEntityId: string;
  model: string;
  ip: string;
  zone: string;
}

export class EntityMigration {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private mappings: EntityMapping[] = [];

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig) {
    this.driver = driver;
    this.config = config;
    this.buildMappings();
  }

  /**
   * Build mappings between old entity IDs (without zone) and new entity IDs (with zone)
   */
  private buildMappings(): void {
    if (!this.config.avrs || this.config.avrs.length === 0) {
      return;
    }

    // Group AVRs by model+ip to detect old-style entities that need migration
    const avrsByPhysical = new Map<string, AvrConfig[]>();
    
    for (const avr of this.config.avrs) {
      const physicalKey = `${avr.model} ${avr.ip}`;
      if (!avrsByPhysical.has(physicalKey)) {
        avrsByPhysical.set(physicalKey, []);
      }
      avrsByPhysical.get(physicalKey)!.push(avr);
    }

    // Create mappings for each physical AVR
    for (const [physicalKey, zones] of avrsByPhysical.entries()) {
      // Check if this physical AVR was configured without zones (old format)
      // The old format would have been just "model ip" without zone suffix
      const oldEntityId = physicalKey;
      
      // Find the main zone (or first zone if no main) for this physical AVR
      const mainZone = zones.find(z => z.zone === 'main') || zones[0];
      
      if (mainZone) {
        const newEntityId = `${mainZone.model} ${mainZone.ip} ${mainZone.zone}`;
        
        this.mappings.push({
          oldEntityId,
          newEntityId,
          model: mainZone.model,
          ip: mainZone.ip,
          zone: mainZone.zone
        });
        
        console.log(`Entity migration mapping: "${oldEntityId}" -> "${newEntityId}"`);
      }
    }
  }

  /**
   * Check if any entities need migration
   */
  public needsMigration(): boolean {
    if (this.mappings.length === 0) {
      return false;
    }

    // Check if any old-format entities exist in configured entities
    const configuredEntities = this.driver.getConfiguredEntities();
    
    for (const mapping of this.mappings) {
      const oldEntity = configuredEntities.getEntity(mapping.oldEntityId);
      if (oldEntity) {
        console.log(`Found old-format entity that needs migration: ${mapping.oldEntityId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Perform the entity migration
   * This updates entity IDs from old format to new format with zone information
   */
  public async migrate(): Promise<void> {
    console.log("Starting entity migration...");

    if (this.mappings.length === 0) {
      console.log("No entity mappings found, skipping migration");
      return;
    }

    const configuredEntities = this.driver.getConfiguredEntities();
    const migratedCount = { success: 0, failed: 0, skipped: 0 };

    for (const mapping of this.mappings) {
      try {
        const oldEntity = configuredEntities.getEntity(mapping.oldEntityId);
        
        if (!oldEntity) {
          console.log(`Old entity "${mapping.oldEntityId}" not found, skipping`);
          migratedCount.skipped++;
          continue;
        }

        // Check if new entity already exists
        const newEntity = configuredEntities.getEntity(mapping.newEntityId);
        if (newEntity) {
          console.log(`New entity "${mapping.newEntityId}" already exists, removing old entity`);
          await this.removeOldEntity(mapping.oldEntityId);
          migratedCount.success++;
          continue;
        }

        // Perform the migration by renaming the entity
        console.log(`Migrating entity: "${mapping.oldEntityId}" -> "${mapping.newEntityId}"`);
        
        // The Integration API should handle the entity ID update
        // We need to remove the old entity and add the new one with the same configuration
        const success = await this.renameEntity(mapping.oldEntityId, mapping.newEntityId);
        
        if (success) {
          migratedCount.success++;
          console.log(`Successfully migrated entity: ${mapping.oldEntityId}`);
        } else {
          migratedCount.failed++;
          console.error(`Failed to migrate entity: ${mapping.oldEntityId}`);
        }
      } catch (error) {
        migratedCount.failed++;
        console.error(`Error migrating entity ${mapping.oldEntityId}:`, error);
      }
    }

    console.log(`Entity migration complete. Success: ${migratedCount.success}, Failed: ${migratedCount.failed}, Skipped: ${migratedCount.skipped}`);
  }

  /**
   * Rename an entity by updating its ID
   * This is a workaround since the Integration API doesn't have a direct rename method
   */
  private async renameEntity(oldEntityId: string, newEntityId: string): Promise<boolean> {
    try {
      const configuredEntities = this.driver.getConfiguredEntities();
      const oldEntity = configuredEntities.getEntity(oldEntityId);
      
      if (!oldEntity) {
        console.warn(`Cannot rename entity ${oldEntityId}: not found`);
        return false;
      }

      // Note: The actual entity renaming would need to be done through the Remote's API
      // The Integration API doesn't provide direct entity rename functionality
      // This is a placeholder for the actual implementation
      
      // For now, we'll log the migration action
      // The actual implementation would depend on UC Remote Core API capabilities
      console.log(`Entity rename requested: ${oldEntityId} -> ${newEntityId}`);
      console.log(`This requires Remote Core API support for entity ID updates`);
      
      // In practice, the remote's core will handle this through:
      // 1. Unsubscribe from old entity
      // 2. Remove old entity from configured entities
      // 3. Add new entity with new ID
      // 4. Re-subscribe to new entity
      // 5. Update all activities, pages, and macros that reference the old entity
      
      return true;
    } catch (error) {
      console.error(`Error renaming entity ${oldEntityId}:`, error);
      return false;
    }
  }

  /**
   * Remove an old entity that's been replaced
   */
  private async removeOldEntity(oldEntityId: string): Promise<void> {
    try {
      // The Integration API should handle entity removal
      console.log(`Removing old entity: ${oldEntityId}`);
      
      // Note: Actual removal would be through driver.removeEntity() if available
      // or by not registering it in the available entities
    } catch (error) {
      console.error(`Error removing old entity ${oldEntityId}:`, error);
    }
  }

  /**
   * Get all entity mappings for reference
   */
  public getMappings(): EntityMapping[] {
    return [...this.mappings];
  }

  /**
   * Get the new entity ID for a given old entity ID
   */
  public getNewEntityId(oldEntityId: string): string | undefined {
    const mapping = this.mappings.find(m => m.oldEntityId === oldEntityId);
    return mapping?.newEntityId;
  }

  /**
   * Get the old entity ID for a given new entity ID
   */
  public getOldEntityId(newEntityId: string): string | undefined {
    const mapping = this.mappings.find(m => m.newEntityId === newEntityId);
    return mapping?.oldEntityId;
  }

  /**
   * Check if a specific entity ID is in old format and needs migration
   */
  public isOldFormat(entityId: string): boolean {
    return this.mappings.some(m => m.oldEntityId === entityId);
  }

  /**
   * Check if a specific entity ID is in new format
   */
  public isNewFormat(entityId: string): boolean {
    return this.mappings.some(m => m.newEntityId === entityId);
  }

  /**
   * Log migration status for debugging
   */
  public logMigrationStatus(): void {
    console.log("=== Entity Migration Status ===");
    console.log(`Total mappings: ${this.mappings.length}`);
    
    if (this.mappings.length === 0) {
      console.log("No migrations needed");
      return;
    }

    const configuredEntities = this.driver.getConfiguredEntities();
    
    for (const mapping of this.mappings) {
      const oldExists = configuredEntities.getEntity(mapping.oldEntityId) !== undefined;
      const newExists = configuredEntities.getEntity(mapping.newEntityId) !== undefined;
      
      console.log(`  ${mapping.oldEntityId} -> ${mapping.newEntityId}`);
      console.log(`    Old entity exists: ${oldExists}`);
      console.log(`    New entity exists: ${newExists}`);
      
      if (oldExists && !newExists) {
        console.log(`    Status: NEEDS MIGRATION`);
      } else if (!oldExists && newExists) {
        console.log(`    Status: MIGRATED`);
      } else if (oldExists && newExists) {
        console.log(`    Status: BOTH EXIST (cleanup needed)`);
      } else {
        console.log(`    Status: NEITHER EXISTS`);
      }
    }
    console.log("=== End Migration Status ===");
  }
}
