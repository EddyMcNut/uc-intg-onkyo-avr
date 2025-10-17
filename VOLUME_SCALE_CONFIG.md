# Volume Scale Configuration

## Overview

Added configurable volume scale setting (0-80 or 0-100) per AVR to accommodate different Onkyo/Pioneer/Integra models.

## Changes Made

### 1. driver.json

Added a new dropdown field in the setup schema:

- **Field ID**: `volumeScale`
- **Options**:
  - `100` - "0-100 (most modern models)" - Default
  - `80` - "0-80 (older models)"
- **Position**: After queueThreshold setting

### 2. configManager.ts

#### Updated AvrConfig interface:

```typescript
export interface AvrConfig {
  model: string;
  ip: string;
  port: number;
  queueThreshold?: number;
  albumArtURL?: string;
  volumeScale?: number; // 80 or 100 - NEW
}
```

#### Migration logic:

- Legacy configs default to `volumeScale: 100`
- Existing AVRs without volumeScale get `100` as default
- Migration ensures all AVRs have the setting

### 3. onkyo.ts

#### Setup handler:

- Reads `volumeScale` from setup data
- Validates value is 80 or 100, defaults to 100
- Stores in AVR config

#### Entity creation (2 locations):

- Uses `avrConfig.volumeScale ?? 100` or `instance.config.volumeScale ?? 100`
- Sets `options.volume_steps` to the configured scale
- This tells the Remote 3 UI the valid volume range

#### Auto-discovery:

- Auto-discovered AVRs default to `volumeScale: 100`

## How It Works

### Setup Flow:

1. User configures AVR during integration setup
2. Selects volume scale: 0-80 or 0-100
3. Setting is saved to `config.json` per AVR
4. Remote 3 UI displays slider with correct range

### Runtime:

- Volume slider range matches AVR capability (0-80 or 0-100)
- Volume commands respect the configured scale
- Different AVRs can have different scales in multi-AVR setups

## Example config.json:

```json
{
  "avrs": [
    {
      "model": "TX-RZ50",
      "ip": "192.168.1.100",
      "port": 60128,
      "queueThreshold": 100,
      "albumArtURL": "album_art.cgi",
      "volumeScale": 100
    },
    {
      "model": "TX-NR656",
      "ip": "192.168.1.101",
      "port": 60128,
      "queueThreshold": 100,
      "albumArtURL": "album_art.cgi",
      "volumeScale": 80
    }
  ]
}
```

## Testing

1. **New setup**: Select volume scale during setup, verify slider range
2. **Existing config**: Verify migration adds volumeScale: 100 to existing AVRs
3. **Multiple AVRs**: Configure different scales, verify each works correctly
4. **Auto-discovery**: Verify discovered AVRs get default scale of 100

## Notes

- Most modern Onkyo models (2015+) use 0-100 scale
- Older models (pre-2015) typically use 0-80 scale
- The eISCP protocol supports both via hexadecimal: 0x00-0x64 (100) or 0x00-0x50 (80)
- User can change the setting by re-running the integration setup
