# Sensor Entities

## Overview

The integration now exposes technical data from the AVR as sensor entities. Sensors are read-only entities that display values to the user.

## Current Sensors

### Volume Level Sensor

- **Entity ID**: `{model} {ip} {zone}_volume_sensor`
- **Device Class**: Custom
- **Unit**: % (percentage)
- **Range**: 0-100
- **Updates**: Automatically updates when AVR volume changes

The volume sensor displays the same percentage value as the media player's volume slider, providing a dedicated sensor entity for volume monitoring.

## Adding More Sensors

To add additional sensors (e.g., audio bitrate, video resolution, audio format, video format):

### 1. Create the Sensor Entity

In `src/onkyo.ts`, add a new sensor to the `createSensorEntities()` method:

```typescript
// Example: Audio Bitrate Sensor
const bitrateSensor = new uc.Sensor(
  `${avrEntry}_audio_bitrate_sensor`,
  { en: `${avrEntry} Audio Bitrate` },
  {
    attributes: {
      [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
      [uc.SensorAttributes.Value]: 0,
      [uc.SensorAttributes.Unit]: "kbps"
    },
    deviceClass: uc.SensorDeviceClasses.Custom,
    options: {
      [uc.SensorOptions.CustomUnit]: "kbps",
      [uc.SensorOptions.Decimals]: 0,
      [uc.SensorOptions.MinValue]: 0,
      [uc.SensorOptions.MaxValue]: 10000
    }
  }
);
sensors.push(bitrateSensor);
```

### 2. Update Sensor Value

In `src/onkyoCommandReceiver.ts`, find the appropriate EISCP command case and update the sensor:

```typescript
case "audio-information": {
  // Parse the EISCP data
  const bitrate = parseAudioBitrate(avrUpdates.argument);
  
  // Update sensor
  const bitrateSensorId = `${entityId}_audio_bitrate_sensor`;
  this.driver.updateEntityAttributes(bitrateSensorId, {
    [uc.SensorAttributes.State]: uc.SensorStates.On,
    [uc.SensorAttributes.Value]: bitrate
  });
  break;
}
```

## Sensor Device Classes

Available device classes:
- `Custom` - For custom units (bitrate, resolution, etc.)
- `Battery` - Battery level (%)
- `Current` - Electrical current (A)
- `Energy` - Energy consumption (kWh)
- `Humidity` - Humidity (%)
- `Power` - Power consumption (W)
- `Temperature` - Temperature (°C or °F)
- `Voltage` - Voltage (V)

## Sensor Attributes

- `State` - ON when sensor has valid data, UNKNOWN when not available
- `Value` - The numeric sensor value
- `Unit` - The unit of measurement (displayed to user)

## Sensor Options

- `CustomUnit` - Custom unit text (for Custom device class)
- `Decimals` - Number of decimal places to display
- `MinValue` - Minimum expected value
- `MaxValue` - Maximum expected value
- `NativeUnit` - Alternative to CustomUnit

## EISCP Commands for Future Sensors

To find EISCP commands for technical data:

1. Check `src/eiscp-commands.ts` for available commands
2. Use the AVR's network protocol documentation
3. Test commands using the integration's raw command feature (if enabled)
4. Monitor EISCP events in the logs to see what the AVR sends

Common technical data commands:
- Audio information (codec, bitrate, sample rate)
- Video information (resolution, format, color space)
- Input signal status
- Network stream information
