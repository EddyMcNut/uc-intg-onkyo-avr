/**
 * Entity Migration Utility
 * 
 * This class handles migration of entity names when the integration is upgraded
 * to include zone information in entity names (main, zone2, zone3) and to correct the incorrect original integration ID.
 * 
 * Previous format v0.6.5-: "TX-RZ50 192.168.2.103"
 * New format v0.7.0+: "TX-RZ50 192.168.2.103 main"
 * 
 * Based on the UC Remote Two Toolkit replace-entity implementation:
 * https://github.com/albaintor/UC-Remote-Two-Toolkit/tree/main/src/app/replace-entity
 */

import * as uc from "@unfoldedcircle/integration-api";
import { OnkyoConfig, AvrConfig } from "./configManager.js";
import { Buffer } from "buffer";

interface EntityMapping {
  oldEntityId: string;
  newEntityId: string;
  model: string;
  ip: string;
  zone: string;
}

interface Activity {
  entity_id: string;
  entity_type: string;
  name: { [lang: string]: string };
  icon?: string;
  options?: {
    included_entities?: Array<{ entity_id: string; [key: string]: any }>;
    button_mapping?: Array<{
      button: string;
      short_press?: { entity_id: string; [key: string]: any };
      long_press?: { entity_id: string; [key: string]: any };
      double_press?: { entity_id: string; [key: string]: any };
    }>;
    user_interface?: {
      pages?: Array<{
        page_id?: string;
        name: string;
        items: Array<{
          command?: string | { entity_id: string; [key: string]: any };
          media_player_id?: string;
          [key: string]: any;
        }>;
      }>;
    };
    sequences?: {
      [key: string]: Array<{
        command?: { entity_id: string; [key: string]: any };
        [key: string]: any;
      }>;
    };
  };
}

export class EntityMigration {
  private driver: uc.IntegrationAPI;
  private config: OnkyoConfig;
  private mappings: EntityMapping[] = [];
  private remoteBaseUrl: string;
  private apiToken: string = '';
  private remoteIp?: string;
  private remotePinCode?: string;

  private oldIntegrationId: string = "uc_onkyo-avr_driver_custom.main";
  private newIntegrationId: string = "onkyo_avr_custom_driver.main";

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, remoteIp?: string, remotePinCode?: string, integrationId?: string) {
    this.driver = driver;
    this.config = config;
    this.remoteIp = remoteIp;
    this.remotePinCode = remotePinCode;
    this.remoteBaseUrl = `http://${this.remoteIp}`;
    
    this.buildMappings();
  }

  private async registerWithRemote(): Promise<boolean> {
    if (!this.remoteIp || !this.remotePinCode) {
      console.log('Migration: No Remote IP or PIN provided, skipping Remote API registration');
      return false;
    }

    try {
      const username = 'web-configurator';
      const apiKeyName = 'onkyo-avr-migration';
      
      // Create Basic auth header with username and PIN
      const auth = Buffer.from(`${username}:${this.remotePinCode}`).toString('base64');
      const headers = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      console.log(`Migration: Registering with Remote at ${this.remoteIp}...`);
      
      // Step 1: Get list of existing API keys to check if our key exists
      const listUrl = `http://${this.remoteIp}/api/auth/api_keys?page=1&limit=100`;
      const listResponse = await fetch(listUrl, {
        method: 'GET',
        headers
      });

      if (listResponse.ok) {
        const keys = await listResponse.json() as Array<{ key_id: string; name: string }>;
        
        // Step 2: Delete any existing key with the same name
        for (const key of keys) {
          if (key.name === apiKeyName) {
            console.log(`Migration: Deleting existing API key "${apiKeyName}"...`);
            const deleteUrl = `http://${this.remoteIp}/api/auth/api_keys/${key.key_id}`;
            await fetch(deleteUrl, {
              method: 'DELETE',
              headers
            });
          }
        }
      }
      
      // Step 3: Register new API key
      const registerUrl = `http://${this.remoteIp}/api/auth/api_keys`;
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: apiKeyName,
          scopes: ['admin']
        })
      });

      if (!response.ok) {
        console.error(`Migration: Failed to register with Remote: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.error(`Migration: Response body: ${text}`);
        return false;
      }

      const data = await response.json() as { api_key: string; valid_to: string };
      this.apiToken = data.api_key;
      this.remoteBaseUrl = `http://${this.remoteIp}`;
      
      console.log(`Migration: Successfully registered with Remote, API key valid until ${data.valid_to}`);
      return true;
      
    } catch (error) {
      console.error('Migration: Failed to register with Remote:', error);
      return false;
    }
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
   * Returns true if there are entity mappings (meaning old entities may exist in activities)
   */
  public needsMigration(): boolean {
    return this.mappings.length > 0;
  }

  /**
   * Perform the entity migration
   * Fetches activities from Remote and replaces old entity IDs with new ones
   */
  public async migrate(): Promise<void> {
    console.log("=== Starting Entity Migration ===");
    console.log(`Remote API URL: ${this.remoteBaseUrl}`);
    console.log(`API Token configured: ${this.apiToken ? 'Yes' : 'No'}`);

    if (this.mappings.length === 0) {
      console.log("No entity mappings found, skipping migration");
      return;
    }

    // Register with Remote to get API access if IP and PIN provided
    if (this.remoteIp && this.remotePinCode) {
      const registered = await this.registerWithRemote();
      if (!registered) {
        console.log("Migration: Failed to register with Remote - migration cannot proceed");
        return;
      }
    } else {
      console.log("Migration: No Remote IP/PIN provided - skipping migration");
      console.log("Migration: To migrate activities, provide Remote IP and PIN in setup");
      return;
    }

    console.log(`Fetching activities from Remote at ${this.remoteBaseUrl}...`);
    const activities = await this.fetchActivitiesFromRemote();
    
    if (!activities || activities.length === 0) {
      console.log("No activities found on Remote");
      return;
    }

    console.log(`Found ${activities.length} activities, checking for entity replacements...`);
    let updatedCount = 0;
    let errorCount = 0;

    for (const activity of activities) {
      try {
        // Check if this activity uses this integration's entities
        if (!this.activityUsesIntegration(activity)) {
          continue;
        }

        console.log(`Activity "${this.getActivityName(activity)}" (${activity.entity_id}) uses ${this.oldIntegrationId}`);
        
        // Replace entities in the activity
        const replacedCount = this.replaceEntitiesInActivity(activity);
        
        if (replacedCount > 0) {
          console.log(`  Replaced ${replacedCount} entity reference(s), updating activity...`);
          const success = await this.updateActivityOnRemote(activity);
          
          if (success) {
            updatedCount++;
            console.log(`  ✓ Activity updated successfully`);
          } else {
            errorCount++;
            console.log(`  ✗ Failed to update activity`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`Error migrating activity ${activity.entity_id}:`, error);
      }
    }

    console.log("=== Entity Migration Complete ===");
    console.log(`  Activities updated: ${updatedCount}`);
    console.log(`  Errors: ${errorCount}`);
    
    if (updatedCount > 0) {
      console.log("\n✓ Migration successful! Your activities now use the new entity names.");
    } else if (errorCount === 0) {
      console.log("\n✓ No activities needed migration.");
    } else {
      console.log("\n✗ Migration completed with errors. Please check logs.");
    }
  }

  /**
   * Fetch all activities from the Remote via API
   * First gets the list of activities, then fetches full details for each
   */
  private async fetchActivitiesFromRemote(): Promise<Activity[]> {
    try {
      const headers: Record<string, string> = {};
      
      // Only add Authorization header if we have a token
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }
      
      // First, get the list of activities
      const response = await fetch(`${this.remoteBaseUrl}/api/activities`, {
        headers,
      });

      if (!response.ok) {
        console.error(`Failed to fetch activities: ${response.status} ${response.statusText}`);
        console.error(`  URL: ${this.remoteBaseUrl}/api/activities`);
        console.error(`  Using auth token: ${this.apiToken ? 'Yes' : 'No'}`);
        return [];
      }

      const activityList = (await response.json()) as Activity[];
      console.log(`Found ${activityList.length} activities, fetching full details for each...`);
      
      // Now fetch full details for each activity (includes all entities, buttons, UI pages, etc.)
      const detailedActivities: Activity[] = [];
      for (const activity of activityList) {
        if (!activity.entity_id) {
          console.log(`  Skipping activity without entity_id`);
          continue;
        }
        
        const detailResponse = await fetch(`${this.remoteBaseUrl}/api/activities/${activity.entity_id}`, {
          headers,
        });
        
        if (detailResponse.ok) {
          const detailedActivity = (await detailResponse.json()) as Activity;
          detailedActivities.push(detailedActivity);
        } else {
          console.log(`  Warning: Failed to fetch details for activity ${activity.entity_id}: ${detailResponse.status}`);
          // Use the basic activity info as fallback
          detailedActivities.push(activity);
        }
      }
      
      console.log(`Successfully fetched detailed information for ${detailedActivities.length} activities`);
      return detailedActivities;
    } catch (error) {
      console.error('Error fetching activities from Remote:', error);
      return [];
    }
  }

  /**
   * Check if an activity uses entities from this integration
   */
  private activityUsesIntegration(activity: Activity): boolean {
    const includedEntities = activity.options?.included_entities || [];
    
    // Log all entities in this activity
    console.log(`  Activity has ${includedEntities.length} included entities:`);
    for (const entity of includedEntities) {
      // Extract integration ID from entity_id (format: integration_id.entity_name)
      const parts = entity.entity_id.split('.');
      const integrationId = parts.length > 1 ? parts[0] : 'unknown';
      console.log(`    - ${entity.entity_id} (integration: ${integrationId})`);
    }
    
    // Check if any entity belongs to this integration
    console.log(`  Checking for old entity IDs that need migration:`);
    for (const mapping of this.mappings) {
      // Build the full old entity ID with old integration prefix
      const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
      console.log(`    Looking for: "${fullOldEntityId}"`);
      
      for (const entity of includedEntities) {
        if (entity.entity_id === fullOldEntityId) {
          console.log(`    ✓ MATCH FOUND: "${entity.entity_id}" needs migration!`);
          return true;
        }
      }
    }
    
    console.log(`  ✗ No matching entities found for this integration`);
    return false;
  }

  /**
   * Replace old entity IDs with new ones in an activity
   * Returns the number of replacements made
   */
  private replaceEntitiesInActivity(activity: Activity): number {
    let replacedCount = 0;

    if (!activity.options) {
      return replacedCount;
    }

    // Replace in included_entities
    if (activity.options.included_entities) {
      for (const entity of activity.options.included_entities) {
        // Check if this entity matches any of our old entity patterns
        for (const mapping of this.mappings) {
          const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
          if (entity.entity_id === fullOldEntityId) {
            const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
            console.log(`    Replacing included entity: ${entity.entity_id} -> ${fullNewEntityId}`);
            entity.entity_id = fullNewEntityId;
            replacedCount++;
            break;
          }
        }
      }
    }

    // Replace in button_mapping
    if (activity.options.button_mapping) {
      for (const button of activity.options.button_mapping) {
        if (button.short_press?.entity_id) {
          for (const mapping of this.mappings) {
            const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
            if (button.short_press.entity_id === fullOldEntityId) {
              const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
              console.log(`    Replacing button ${button.button} short_press: ${button.short_press.entity_id} -> ${fullNewEntityId}`);
              button.short_press.entity_id = fullNewEntityId;
              replacedCount++;
              break;
            }
          }
        }
        
        if (button.long_press?.entity_id) {
          for (const mapping of this.mappings) {
            const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
            if (button.long_press.entity_id === fullOldEntityId) {
              const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
              console.log(`    Replacing button ${button.button} long_press: ${button.long_press.entity_id} -> ${fullNewEntityId}`);
              button.long_press.entity_id = fullNewEntityId;
              replacedCount++;
              break;
            }
          }
        }
        
        if (button.double_press?.entity_id) {
          for (const mapping of this.mappings) {
            const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
            if (button.double_press.entity_id === fullOldEntityId) {
              const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
              console.log(`    Replacing button ${button.button} double_press: ${button.double_press.entity_id} -> ${fullNewEntityId}`);
              button.double_press.entity_id = fullNewEntityId;
              replacedCount++;
              break;
            }
          }
        }
      }
    }

    // Replace in user_interface pages
    if (activity.options.user_interface?.pages) {
      for (const page of activity.options.user_interface.pages) {
        for (const item of page.items) {
          // Handle command as string
          if (typeof item.command === 'string') {
            for (const mapping of this.mappings) {
              const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
              if (item.command === fullOldEntityId) {
                const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
                console.log(`    Replacing page \"${page.name}\" command: ${item.command} -> ${fullNewEntityId}`);
                item.command = fullNewEntityId;
                replacedCount++;
                break;
              }
            }
          }
          // Handle command as object with entity_id
          else if (item.command && typeof item.command === 'object' && 'entity_id' in item.command) {
            const cmdObj = item.command as { entity_id: string; [key: string]: any };
            for (const mapping of this.mappings) {
              const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
              if (cmdObj.entity_id === fullOldEntityId) {
                const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
                console.log(`    Replacing page \"${page.name}\" command.entity_id: ${cmdObj.entity_id} -> ${fullNewEntityId}`);
                cmdObj.entity_id = fullNewEntityId;
                replacedCount++;
                break;
              }
            }
          }
          
          // Handle media_player_id
          if (item.media_player_id) {
            for (const mapping of this.mappings) {
              const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
              if (item.media_player_id === fullOldEntityId) {
                const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
                console.log(`    Replacing page \"${page.name}\" media_player_id: ${item.media_player_id} -> ${fullNewEntityId}`);
                item.media_player_id = fullNewEntityId;
                replacedCount++;
                break;
              }
            }
          }
        }
      }
    }

    // Replace in sequences (on/off)
    if (activity.options.sequences) {
      for (const [seqType, sequences] of Object.entries(activity.options.sequences)) {
        for (const sequence of sequences) {
          if (sequence.command?.entity_id) {
            for (const mapping of this.mappings) {
              const fullOldEntityId = `${this.oldIntegrationId}.${mapping.oldEntityId}`;
              if (sequence.command.entity_id === fullOldEntityId) {
                const fullNewEntityId = `${this.newIntegrationId}.${mapping.newEntityId}`;
                console.log(`    Replacing ${seqType} sequence: ${sequence.command.entity_id} -> ${fullNewEntityId}`);
                sequence.command.entity_id = fullNewEntityId;
                replacedCount++;
                break;
              }
            }
          }
        }
      }
    }

    return replacedCount;
  }

  /**
   * Update an activity on the Remote via PATCH API
   */
  private async updateActivityOnRemote(activity: Activity): Promise<boolean> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Only add Authorization header if we have a token
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }
      
      const body: any = {
        name: activity.name,
        options: {}
      };

      if (activity.icon) {
        body.icon = activity.icon;
      }

      if (activity.options?.included_entities) {
        body.options.entity_ids = activity.options.included_entities.map(e => e.entity_id);
      }

      if (activity.options?.sequences) {
        body.options.sequences = activity.options.sequences;
      }

      const response = await fetch(`${this.remoteBaseUrl}/api/activities/${activity.entity_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(`Failed to update activity: ${response.status} ${response.statusText}`);
        return false;
      }

      // Update button_mapping (separate API calls)
      if (activity.options?.button_mapping) {
        for (const button of activity.options.button_mapping) {
          if (!button.short_press && !button.long_press && !button.double_press) {
            continue;
          }

          const buttonResponse = await fetch(
            `${this.remoteBaseUrl}/api/activities/${activity.entity_id}/buttons/${button.button}`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify(button),
            }
          );

          if (!buttonResponse.ok) {
            console.error(`Failed to update button ${button.button}: ${buttonResponse.status}`);
          }
        }
      }

      // Update UI pages (separate API calls)
      if (activity.options?.user_interface?.pages) {
        for (const page of activity.options.user_interface.pages) {
          if (!page.page_id) {
            continue;
          }

          const pageResponse = await fetch(
            `${this.remoteBaseUrl}/api/activities/${activity.entity_id}/ui/pages/${page.page_id}`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify(page),
            }
          );

          if (!pageResponse.ok) {
            console.error(`Failed to update page ${page.name}: ${pageResponse.status}`);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating activity on Remote:', error);
      return false;
    }
  }

  /**
   * Get the activity name (handles multi-language names)
   */
  private getActivityName(activity: Activity): string {
    if (typeof activity.name === 'string') {
      return activity.name;
    }
    return activity.name?.en || activity.name?.[Object.keys(activity.name)[0]] || activity.entity_id;
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
    console.log("=== Entity Migration Mappings ===");
    console.log(`Total mappings: ${this.mappings.length}`);
    
    if (this.mappings.length === 0) {
      console.log("No migrations needed");
      return;
    }

    console.log("\\nEntity name changes:");
    for (const mapping of this.mappings) {
      console.log(`  "${mapping.oldEntityId}" -> "${mapping.newEntityId}"`);
    }
    
    console.log("\\nNote: These old entity names may exist in your activities.");
    console.log("Running migrate() will update all activities to use the new names.");
    console.log("=== End Migration Mappings ===");
  }
}
