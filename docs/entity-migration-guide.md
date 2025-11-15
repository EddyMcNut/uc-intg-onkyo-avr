# Entity Migration Guide

## Automatic Activity Migration for Multi-Zone Upgrade

When upgrading from single-zone (e.g., `TX-RZ50 192.168.2.103`) to multi-zone support (e.g., `TX-RZ50 192.168.2.103 main`), the integration can **automatically update all your activities** to use the new entity names.

### How It Works

The entity migration feature connects to your Remote's API during setup and updates all activities that reference the old entity names. This is based on the [UC Remote Two Toolkit](https://github.com/albaintor/UC-Remote-Two-Toolkit)'s replace-entity functionality.

### Setup

To enable automatic migration, provide these fields during integration setup:

1. **Remote IP Address**: The IP address of your Unfolded Circle Remote (e.g., `192.168.1.50`)
2. **Remote 4-digit PIN code**: Your Remote's PIN code (found in Settings → Security)

**Example:**
```
Remote IP Address: 192.168.1.50
Remote PIN Code: 1234
```

### What Gets Migrated

The migration updates entity references in:
- ✅ **Included Entities** - entities assigned to the activity
- ✅ **Button Mappings** - all button commands (short/long/double press)
- ✅ **UI Pages** - all interface commands and media players
- ✅ **Sequences** - on/off sequences

### Step-by-Step Process

#### 1. During Setup

When you configure the integration:

1. Fill in your AVR details (Model, IP Address, etc.)
2. Scroll down to **"Entity migration (multi-zone upgrade)"**
3. Enter your **Remote's IP Address**
4. Enter your Remote's **4-digit PIN code**
5. Click **Next**

#### 2. What Happens

The integration will:

1. **Register with Remote** - Uses your PIN to get API access
2. **Fetch Activities** - Downloads all activities from your Remote
3. **Find References** - Identifies activities using old entity names
4. **Replace Entities** - Updates all references to new zone-specific names
5. **Update Activities** - Saves changes back to your Remote

### Logging

Watch the logs during setup to see the migration progress:

```
=== Entity Migration Mappings ===
Total mappings: 1
Entity name changes:
  "TX-RZ50 192.168.2.103" -> "TX-RZ50 192.168.2.103 main"

=== Starting Entity Migration ===
Migration: Registering with Remote at 192.168.1.50...
Migration: Successfully registered with Remote, API key valid until 2025-12-31T23:59:59Z
Fetching activities from Remote at http://192.168.1.50...
Successfully fetched 5 activities
Activity "Watch Movies" (activity_001) uses onkyo-avr
  Replaced 3 entity reference(s), updating activity...
  ✓ Activity updated successfully
Activity "Listen to Music" (activity_002) uses onkyo-avr
  Replaced 2 entity reference(s), updating activity...
  ✓ Activity updated successfully
=== Entity Migration Complete ===
  Activities updated: 2
  Errors: 0

✓ Migration successful! Your activities now use the new entity names.
```

### Skipping Migration

If you **don't** provide the Remote IP and PIN:
- Migration is skipped
- Old entity names won't work with multi-zone entities
- You'll need to **manually update your activities**

### Manual Migration (Alternative)

If you prefer not to provide API access during setup:

1. Open each affected activity in the Remote's web configurator
2. Remove the old entity (e.g., `TX-RZ50 192.168.2.103`)
3. Add the new entity (e.g., `TX-RZ50 192.168.2.103 main`)
4. Reconfigure buttons and UI pages

### Troubleshooting

#### "Failed to register with Remote"

**Cause**: Wrong PIN, network issue, or Remote unreachable

**Solutions**:
- Verify PIN code in Remote Settings → Security
- Ensure integration can reach Remote IP (check network)
- Check Remote is powered on and connected to network

#### "Migration: No Remote IP/PIN provided"

**Cause**: Fields left empty during setup

**Solution**: Re-run setup and provide both Remote IP and PIN

#### "401 Unauthorized"

**Cause**: Invalid PIN code

**Solution**: Double-check your Remote's PIN code in Settings → Security

#### "Activities updated: 0"

**Causes**:
1. No activities use this integration's entities (expected)
2. Entity names already migrated (expected)
3. Different integration ID used

**Solution**: Check logs to see which activities were checked

### Security Notes

- **PIN Code**: Only used during setup to register an API key
- **API Key**: Temporary key valid for a limited time (typically 30 days)
- **Scope**: API key has "admin" scope (required to modify activities)
- **Storage**: API key is not stored permanently, only used during setup

### Technical Details

#### Authentication Flow

1. **Basic Auth**: Integration uses PIN as password
   ```
   Authorization: Basic base64(web-configurator:1234)
   ```

2. **Register API Key**: POST to `/api/auth/api_keys`
   ```json
   {
     "name": "onkyo-avr-migration",
     "scopes": ["admin"]
   }
   ```

3. **Bearer Auth**: Uses API key for subsequent requests
   ```
   Authorization: Bearer <api_key>
   ```

#### API Endpoints Used

- `POST /api/auth/api_keys` - Register API key
- `GET /api/activities` - Fetch all activities
- `PATCH /api/activities/{id}` - Update activity
- `PATCH /api/activities/{id}/button_mapping` - Update buttons
- `PATCH /api/activities/{id}/ui` - Update UI pages

#### Entity Name Format

- **Old**: `{model} {ip}` (e.g., `TX-RZ50 192.168.2.103`)
- **New**: `{model} {ip} {zone}` (e.g., `TX-RZ50 192.168.2.103 main`)

Only main zone entities are migrated from the old format.

### Related Documentation

- [UC Remote Two Toolkit - Replace Entity](https://github.com/albaintor/UC-Remote-Two-Toolkit#replace-an-entity-by-another)
- [Multiple AVRs Documentation](./multiple-avrs.md)
- [Installation Guide](./installation.md)

[back to main README](../README.md)
