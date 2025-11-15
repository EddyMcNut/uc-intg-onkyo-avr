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
import * as fs from "fs";

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
  private integrationId: string = "onkyo-avr";
  private remoteBaseUrl: string;
  private apiToken: string;

  constructor(driver: uc.IntegrationAPI, config: OnkyoConfig, integrationId?: string) {
    this.driver = driver;
    this.config = config;
    if (integrationId) this.integrationId = integrationId;
    
    // Auto-determine Remote API connection info from environment
    // UC Remote sets these when starting the integration
    this.remoteBaseUrl = this.determineRemoteUrl();
    this.apiToken = this.determineApiToken();
    
    this.buildMappings();
  }

  /**
   * Determine the Remote's API base URL from environment
   * UC Remote runs integrations in a container and the Remote's API is accessible at localhost
   */
  private determineRemoteUrl(): string {
    // UC Remote Core API runs on port 80 (default) or can be accessed via localhost
    // When the integration runs, the Remote's API is at http://localhost (within the container network)
    // or via the host's IP on port 80/443
    
    // Try to get from environment first
    const apiUrl = process.env.UC_API_URL || process.env.CORE_API_URL;
    if (apiUrl) {
      console.log(`Using API URL from environment: ${apiUrl}`);
      return apiUrl;
    }
    
    // Default: Remote's Core API is at localhost:80 (from integration's perspective)
    // The integration runs in a container on the Remote, and the Core API is accessible at localhost
    return 'http://localhost';
  }

  /**
   * Determine the API token from environment or API key file
   * UC Remote stores the integration's API key in /app/api.key
   */
  private determineApiToken(): string {
    // Check for explicitly set tokens in environment
    const token = process.env.UC_API_TOKEN 
        || process.env.UC_TOKEN 
        || process.env.UC_INTEGRATION_TOKEN
        || process.env.CORE_API_TOKEN;
    
    if (token) {
      console.log('Using API token from environment');
      return token;
    }
    
    // Try to read API key from file (standard location for UC integrations)
    try {
      const apiKeyPath = '/app/api.key';
      
      if (fs.existsSync(apiKeyPath)) {
        const apiKey = fs.readFileSync(apiKeyPath, 'utf-8').trim();
        if (apiKey) {
          console.log('Using API key from /app/api.key');
          return apiKey;
        }
      } else {
        console.log('API key file not found at /app/api.key');
      }
    } catch (error) {
      console.log('Could not read API key file:', error);
    }
    
    console.log('⚠ No API token found - migration will fail without authentication');
    return '';
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

    // Note: We'll try to access the API even without a token
    // When running on the Remote, localhost access typically doesn't require auth
    if (!this.apiToken) {
      console.log("ℹ No API token found - attempting local access to Remote API");
      console.log("  (Integrations running on Remote have localhost access)");
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

        console.log(`Activity "${this.getActivityName(activity)}" (${activity.entity_id}) uses ${this.integrationId}`);
        
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
   */
  private async fetchActivitiesFromRemote(): Promise<Activity[]> {
    try {
      const headers: Record<string, string> = {};
      
      // Only add Authorization header if we have a token
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }
      
      const response = await fetch(`${this.remoteBaseUrl}/api/activities`, {
        headers,
      });

      if (!response.ok) {
        console.error(`Failed to fetch activities: ${response.status} ${response.statusText}`);
        console.error(`  URL: ${this.remoteBaseUrl}/api/activities`);
        console.error(`  Using auth token: ${this.apiToken ? 'Yes' : 'No'}`);
        return [];
      }

      const activities = (await response.json()) as Activity[];
      console.log(`Successfully fetched ${activities.length} activities`);
      return activities;
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
    
    // Check if any entity belongs to this integration
    for (const entity of includedEntities) {
      // Check against old entity IDs (the ones we're migrating from)
      for (const mapping of this.mappings) {
        if (entity.entity_id === mapping.oldEntityId) {
          return true;
        }
      }
    }
    
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
        const mapping = this.mappings.find(m => m.oldEntityId === entity.entity_id);
        if (mapping) {
          console.log(`    Replacing included entity: ${entity.entity_id} -> ${mapping.newEntityId}`);
          entity.entity_id = mapping.newEntityId;
          replacedCount++;
        }
      }
    }

    // Replace in button_mapping
    if (activity.options.button_mapping) {
      for (const button of activity.options.button_mapping) {
        if (button.short_press?.entity_id) {
          const mapping = this.mappings.find(m => m.oldEntityId === button.short_press!.entity_id);
          if (mapping) {
            console.log(`    Replacing button ${button.button} short_press: ${button.short_press.entity_id} -> ${mapping.newEntityId}`);
            button.short_press.entity_id = mapping.newEntityId;
            replacedCount++;
          }
        }
        
        if (button.long_press?.entity_id) {
          const mapping = this.mappings.find(m => m.oldEntityId === button.long_press!.entity_id);
          if (mapping) {
            console.log(`    Replacing button ${button.button} long_press: ${button.long_press.entity_id} -> ${mapping.newEntityId}`);
            button.long_press.entity_id = mapping.newEntityId;
            replacedCount++;
          }
        }
        
        if (button.double_press?.entity_id) {
          const mapping = this.mappings.find(m => m.oldEntityId === button.double_press!.entity_id);
          if (mapping) {
            console.log(`    Replacing button ${button.button} double_press: ${button.double_press.entity_id} -> ${mapping.newEntityId}`);
            button.double_press.entity_id = mapping.newEntityId;
            replacedCount++;
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
            const mapping = this.mappings.find(m => m.oldEntityId === item.command);
            if (mapping) {
              console.log(`    Replacing page \"${page.name}\" command: ${item.command} -> ${mapping.newEntityId}`);
              item.command = mapping.newEntityId;
              replacedCount++;
            }
          }
          // Handle command as object with entity_id
          else if (item.command && typeof item.command === 'object' && 'entity_id' in item.command) {
            const cmdObj = item.command as { entity_id: string; [key: string]: any };
            const mapping = this.mappings.find(m => m.oldEntityId === cmdObj.entity_id);
            if (mapping) {
              console.log(`    Replacing page \"${page.name}\" command.entity_id: ${cmdObj.entity_id} -> ${mapping.newEntityId}`);
              cmdObj.entity_id = mapping.newEntityId;
              replacedCount++;
            }
          }
          
          // Handle media_player_id
          if (item.media_player_id) {
            const mapping = this.mappings.find(m => m.oldEntityId === item.media_player_id);
            if (mapping) {
              console.log(`    Replacing page \"${page.name}\" media_player_id: ${item.media_player_id} -> ${mapping.newEntityId}`);
              item.media_player_id = mapping.newEntityId;
              replacedCount++;
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
            const mapping = this.mappings.find(m => m.oldEntityId === sequence.command!.entity_id);
            if (mapping) {
              console.log(`    Replacing ${seqType} sequence: ${sequence.command.entity_id} -> ${mapping.newEntityId}`);
              sequence.command.entity_id = mapping.newEntityId;
              replacedCount++;
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
