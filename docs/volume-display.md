## Volume Display on Remote 3

[back to main README](../README.md)

### Overview

The integration now properly displays the current volume level on the Unfolded Circle Remote 3. This allows you to see the exact volume level (0-100) on the remote's display.

### Features

- **Volume Display**: Shows the current volume level (0-100) on the Remote 3 interface
- **Volume Slider**: You can now use the volume slider on the Remote 3 to directly set the volume to any level
- **Volume Up/Down**: Traditional volume up/down buttons still work as before
- **Real-time Updates**: Volume changes made on the AVR itself or via other remotes are reflected on the Remote 3

### How It Works

1. **Volume Reporting**: The Onkyo AVR sends volume updates via the eISCP protocol as hexadecimal values representing the decimal volume level (e.g., hex "23" = volume 35, hex "50" = volume 80)
2. **Conversion**: The integration automatically converts the hexadecimal value to decimal for display (0x23 → 35, 0x50 → 80)
3. **Display**: The Remote 3 displays the volume level (0-100) in its media player interface
4. **Control**: You can:
   - Use the volume slider to set a specific volume level
   - Use volume up/down buttons for incremental changes
   - The AVR responds to all volume commands in real-time

### Technical Details

The volume feature is implemented through:

- **Volume Feature**: Added `MediaPlayerFeatures.Volume` to enable the slider control (in addition to `VolumeUpDown`)
- **Volume Steps**: Configured with `volume_steps: 100` to match Onkyo AVR's volume range
- **Volume Attribute**: Set to numeric value (0-100) instead of "Unknown" for proper initialization
- **Volume Command**: Handles `MediaPlayerCommands.Volume` to set specific volume levels via slider
- **Volume Query**: Automatically queries current volume and mute state when entity is subscribed
- **Hexadecimal Conversion**: Converts between decimal (0-100 for UI) and hexadecimal (for eISCP protocol)

### Example

When you adjust the volume on your Remote 3:

1. The slider sends a `volume` command with the desired level (e.g., 35)
2. The integration converts it to hexadecimal (0x23)
3. Sends the command to the AVR as `MVL23`
4. The AVR confirms the change and sends back `MVL23`
5. The integration converts 0x23 back to 35
6. The Remote 3 updates the display to show volume level 35

[back to main README](../README.md)
