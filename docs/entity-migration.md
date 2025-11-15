# Entity Migration

## Overview

Starting from version 0.7.0, this integration supports multiple zones (main, zone2, zone3) on the same physical AVR. To support this, entity names now include the zone suffix:

- **Old format**: `TX-RZ50 192.168.2.103`
- **New format**: `TX-RZ50 192.168.2.103 main`

## Automatic Migration

When you upgrade to version 0.7.0+ and run the integration setup, the migration process will **automatically** update all your activities to use the new entity names.

### How It Works

1. **During Setup**: After you configure your AVRs, the integration:
   - Creates new entities with zone suffixes (e.g., "TX-RZ50 192.168.2.103 main")
   - Builds a mapping of old entity names → new entity names
   - Fetches all activities from your Remote
   - Replaces old entity names with new ones in:
     - Included entities
     - Button mappings (short press, long press, double press)
     - UI pages and commands
     - Startup/shutdown sequences
   - Updates each activity on your Remote via the API

2. **What Gets Updated**: The migration updates entity references in:
   - **Activity included entities**: The entities your activity uses
   - **Button mapping**: Physical button assignments
   - **User interface pages**: On-screen button commands
   - **Sequences**: Power on/off command sequences

### Example

**Before Migration** (in an activity):
```json
{
  "entity_id": "TX-RZ50 192.168.2.103",
  "button_mapping": [{
    "button": "VOLUME_UP",
    "short_press": {
      "entity_id": "TX-RZ50 192.168.2.103",
      "cmd_id": "volume_up"
    }
  }]
}
```

**After Migration**:
```json
{
  "entity_id": "TX-RZ50 192.168.2.103 main",
  "button_mapping": [{
    "button": "VOLUME_UP",
    "short_press": {
      "entity_id": "TX-RZ50 192.168.2.103 main",
      "cmd_id": "volume_up"
    }
  }]
}
```

## Configuration

The migration automatically discovers the Remote's API connection details from the environment. No manual configuration is needed!

**How it works:**
- The integration automatically detects the Remote's URL and API token from environment variables
- UC Remote sets these variables when starting the integration
- The migration uses the native Node.js `fetch` API (no external dependencies)

## Migration Logs

During setup, you'll see migration logs in the integration logs:

```
Onkyo-Integration: Checking for entity migrations...
=== Entity Migration Mappings ===
Total mappings: 1

Entity name changes:
  "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"

Note: These old entity names may exist in your activities.
Running migrate() will update all activities to use the new names.
=== End Migration Mappings ===
Onkyo-Integration: Migration needed, performing entity replacement in activities...
=== Starting Entity Migration ===
Fetching activities from Remote at http://192.168.2.90...
Found 5 activities, checking for entity replacements...
Activity "Watch TV" (activity_01) uses onkyo-avr
  Replaced 3 entity reference(s), updating activity...
  ✓ Activity updated successfully
Activity "Listen to Music" (activity_02) uses onkyo-avr
  Replaced 5 entity reference(s), updating activity...
  ✓ Activity updated successfully
=== Entity Migration Complete ===
  Activities updated: 2
  Errors: 0

✓ Migration successful! Your activities now use the new entity names.
```

## Troubleshooting

### Migration Doesn't Run

**Problem**: You don't see migration logs during setup.

**Solution**: 
- Check that you have activities using this integration
- Verify the old entity format (without zone suffix) exists in your activities
- Make sure `UC_API_URL` and `UC_API_TOKEN` environment variables are set

### "No API token configured"

**Problem**: Migration logs show "No API token configured, cannot access Remote API"

**Solution**:
- The integration couldn't auto-detect the Remote's API connection details
- This typically means the integration is running in development mode
- In production on UC Remote, this should never happen
- If you see this when running on the Remote, report it as a bug with full logs

### Activities Not Updated

**Problem**: Migration runs but activities still use old entity names.

**Solution**:
1. Check the integration logs for error messages
2. Verify your activities actually used the old entity names
3. Try running setup again
4. Check that the Remote API is accessible

### Manual Migration

If automatic migration fails, you can manually update your activities:

1. Open each activity in the UC Remote interface
2. Remove the old entity (e.g., "TX-RZ50 192.168.2.103")
3. Add the new entity (e.g., "TX-RZ50 192.168.2.103 main")
4. Reassign buttons and UI commands to the new entity

## Multi-Zone Support

With the new entity naming, you can now add multiple zones from the same physical AVR:

1. Run setup
2. Add first zone:
   - Model: `TX-RZ50`
   - IP: `192.168.2.103`
   - Zone: `main`
3. Run setup again and add second zone:
   - Model: `TX-RZ50`
   - IP: `192.168.2.103`
   - Zone: `zone2`

This creates two separate entities:
- `TX-RZ50 192.168.2.103 main`
- `TX-RZ50 192.168.2.103 zone2`

You can control them independently in different activities.

## Technical Details

The migration is implemented in `src/entityMigration.ts` and follows the approach used by the [UC Remote Two Toolkit](https://github.com/albaintor/UC-Remote-Two-Toolkit/tree/main/src/app/replace-entity).

Key implementation details:
- Fetches activities via `GET /api/activities`
- Updates activities via `PATCH /api/activities/{id}`
- Updates buttons via `PATCH /api/activities/{id}/buttons/{button}`
- Updates UI pages via `PATCH /api/activities/{id}/ui/pages/{page_id}`
- Only updates activities that use entities from this integration
- Performs atomic updates for each activity component

## Support

If you encounter issues with migration:

1. Check the integration logs for detailed error messages
2. Verify your Remote firmware is up to date (min version 0.20.0)
3. Report issues at: https://github.com/EddyMcNut/uc-intg-onkyo-avr/issues
