/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { Select, SelectStates } from "./selectEntity.js";
import { eiscpMappings } from "./eiscp-mappings.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";

export default class EntityRegistrar {
  constructor() {}

  getListeningModeOptions(audioFormat?: string): string[] {
    const lmdMappings = eiscpMappings.value_mappings.LMD;
    const excludeKeys = ["up", "down", "movie", "music", "game", "query"];
    const allModes = Object.keys(lmdMappings).filter((key) => !excludeKeys.includes(key));
    const compatibleModes = getCompatibleListeningModes(audioFormat);
    if (compatibleModes) {
      return allModes.filter((mode) => compatibleModes.includes(mode)).sort();
    }
    return allModes.sort();
  }

  createMediaPlayerEntity(
    avrEntry: string,
    volumeScale: number,
    cmdHandler?: (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>
  ): uc.MediaPlayer {
    const mediaPlayerEntity = new uc.MediaPlayer(
      avrEntry,
      { en: avrEntry },
      {
        features: [
          uc.MediaPlayerFeatures.OnOff,
          uc.MediaPlayerFeatures.Toggle,
          uc.MediaPlayerFeatures.PlayPause,
          uc.MediaPlayerFeatures.MuteToggle,
          uc.MediaPlayerFeatures.Volume,
          uc.MediaPlayerFeatures.VolumeUpDown,
          uc.MediaPlayerFeatures.ChannelSwitcher,
          uc.MediaPlayerFeatures.SelectSource,
          uc.MediaPlayerFeatures.MediaTitle,
          uc.MediaPlayerFeatures.MediaArtist,
          uc.MediaPlayerFeatures.MediaAlbum,
          uc.MediaPlayerFeatures.MediaPosition,
          uc.MediaPlayerFeatures.MediaDuration,
          uc.MediaPlayerFeatures.MediaImageUrl,
          uc.MediaPlayerFeatures.Dpad,
          uc.MediaPlayerFeatures.Settings,
          uc.MediaPlayerFeatures.Home,
          uc.MediaPlayerFeatures.Next,
          uc.MediaPlayerFeatures.Previous,
          uc.MediaPlayerFeatures.Info
        ],
        attributes: {
          [uc.MediaPlayerAttributes.State]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.Muted]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.Volume]: 0,
          [uc.MediaPlayerAttributes.Source]: uc.MediaPlayerStates.Unknown,
          [uc.MediaPlayerAttributes.MediaType]: uc.MediaPlayerStates.Unknown
        },
        deviceClass: uc.MediaPlayerDeviceClasses.Receiver,
        options: {
          volume_steps: volumeScale
        }
      }
    );
    if (cmdHandler) mediaPlayerEntity.setCmdHandler(cmdHandler);
    return mediaPlayerEntity;
  }

  createSensorEntities(avrEntry: string): uc.Sensor[] {
    const sensors: uc.Sensor[] = [];

    const volumeSensor = new uc.Sensor(
      `${avrEntry}_volume_sensor`,
      { en: `${avrEntry} Volume` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: 0
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {
          [uc.SensorOptions.Decimals]: 1,
          [uc.SensorOptions.MinValue]: 0,
          [uc.SensorOptions.MaxValue]: 200
        }
      }
    );
    sensors.push(volumeSensor);

    const audioInputSensor = new uc.Sensor(
      `${avrEntry}_audio_input_sensor`,
      { en: `${avrEntry} Audio Input` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(audioInputSensor);

    const audioOutputSensor = new uc.Sensor(
      `${avrEntry}_audio_output_sensor`,
      { en: `${avrEntry} Audio Output` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(audioOutputSensor);

    const sourceSensor = new uc.Sensor(
      `${avrEntry}_source_sensor`,
      { en: `${avrEntry} Source` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(sourceSensor);

    const videoInputSensor = new uc.Sensor(
      `${avrEntry}_video_input_sensor`,
      { en: `${avrEntry} Video Input` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(videoInputSensor);

    const videoOutputSensor = new uc.Sensor(
      `${avrEntry}_video_output_sensor`,
      { en: `${avrEntry} Video Output` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(videoOutputSensor);

    const outputDisplaySensor = new uc.Sensor(
      `${avrEntry}_output_display_sensor`,
      { en: `${avrEntry} Output Display` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(outputDisplaySensor);

    const frontPanelDisplaySensor = new uc.Sensor(
      `${avrEntry}_front_panel_display_sensor`,
      { en: `${avrEntry} Front Panel Display` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(frontPanelDisplaySensor);

    const muteSensor = new uc.Sensor(
      `${avrEntry}_mute_sensor`,
      { en: `${avrEntry} Mute` },
      {
        attributes: {
          [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
          [uc.SensorAttributes.Value]: ""
        },
        deviceClass: uc.SensorDeviceClasses.Custom,
        options: {}
      }
    );
    sensors.push(muteSensor);

    return sensors;
  }

  createListeningModeSelectEntity(avrEntry: string, cmdHandler?: (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>): Select {
    const options = this.getListeningModeOptions();
    const selectEntity = new Select(
      `${avrEntry}_listening_mode`,
      { en: `${avrEntry} Listening Mode` },
      {
        attributes: {
          state: SelectStates.On,
          current_option: "nee",
          options: options
        }
      }
    );
    if (cmdHandler) selectEntity.setCmdHandler(cmdHandler);
    return selectEntity;
  }
}
