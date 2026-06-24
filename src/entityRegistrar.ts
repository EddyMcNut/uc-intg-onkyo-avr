/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { Select, SelectStates } from "@unfoldedcircle/integration-api";
import { eiscpMappings } from "./eiscp-mappings.js";
import { ALL_SIMPLE_COMMANDS } from "./simpleCommands.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";
import { ConfigManager, buildEntityId } from "./configManager.js";
import { browseMedia } from "./mediaBrowser.js";
import { DeezerBrowseHandler } from "./deezerBrowseHandler.js";
import { TidalBrowseHandler } from "./tidalBrowseHandler.js";
import { TuneInBrowseHandler } from "./tuneInBrowseHandler.js";
import { SELECT_SUFFIXES } from "./sensorSuffixes.js";
import type { AvrStateApi } from "./types.js";

type CmdHandlerFn = (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
type RawSendFn = (cmd: string) => Promise<void>;

type EntityBrowseHandler = {
  browse(
    entityId: string,
    options: uc.BrowseOptions,
    mediaPlayerEntity: uc.MediaPlayer,
    cmdHandler: CmdHandlerFn | undefined,
    rawSend: RawSendFn | undefined
  ): Promise<uc.StatusCodes | uc.BrowseResult | undefined>;
};

export default class EntityRegistrar {
  private readonly browseHandlers: EntityBrowseHandler[];

  constructor(avrStateApi: AvrStateApi) {
    this.browseHandlers = [new TuneInBrowseHandler(avrStateApi), new TidalBrowseHandler(), new DeezerBrowseHandler()];
  }

  // Build a user-facing base name from an AVR entry id. Input format is typically: "MODEL HOST ZONE". Long style keeps the full entry, short style omits HOST (IP/hostname).
  private getDisplayBaseName(avrEntry: string): string {
    const cfg = ConfigManager.get();
    const match = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
    const entityNameStyle = match?.entityNameStyle ?? "long";
    if (entityNameStyle !== "short") {
      return avrEntry;
    }

    const parts = avrEntry.trim().split(/\s+/);
    if (parts.length < 3) {
      return avrEntry;
    }

    const zoneToken = parts[parts.length - 1]?.toLowerCase();
    const zoneLabel = zoneToken === "main" ? "Main" : zoneToken === "zone2" ? "Zone 2" : zoneToken === "zone3" ? "Zone 3" : undefined;
    if (!zoneLabel) {
      return avrEntry;
    }

    const model = parts.slice(0, -2).join(" ").trim();
    if (!model) {
      return avrEntry;
    }

    return `${model} ${zoneLabel}`;
  }

  // Return listening mode options. If an AVR-specific `listeningModeOptions` is configured, return it exactly. Otherwise fall back to dynamic filtering by audio format (or return all available modes).
  getListeningModeOptions(audioFormat?: string, avrEntry?: string): string[] {
    // If avrEntry provided and config contains user-specified options, return them
    if (avrEntry) {
      try {
        const cfg = ConfigManager.get();
        if (cfg && Array.isArray(cfg.avrs)) {
          const match = cfg.avrs.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
          if (match && Array.isArray(match.listeningModeOptions) && match.listeningModeOptions.length > 0) {
            return match.listeningModeOptions.map((s) => s.trim());
          }
        }
      } catch {
        // ignore and fall back to defaults
      }
    }

    const lmdMappings = eiscpMappings.value_mappings.LMD;
    const excludeKeys = ["up", "down", "movie", "music", "game", "query"];
    const allModes = Object.keys(lmdMappings).filter((key) => !excludeKeys.includes(key));
    const compatibleModes = getCompatibleListeningModes(audioFormat);
    if (compatibleModes) {
      return allModes.filter((mode) => compatibleModes.includes(mode)).sort();
    }
    return allModes.sort();
  }

  createMediaPlayerEntity(avrEntry: string, volumeScale: number, cmdHandler?: CmdHandlerFn, rawSend?: RawSendFn): uc.MediaPlayer {
    const displayBaseName = this.getDisplayBaseName(avrEntry);
    const mediaPlayerEntity = new uc.MediaPlayer(
      avrEntry,
      { en: displayBaseName },
      {
        features: [
          uc.MediaPlayerFeatures.OnOff,
          uc.MediaPlayerFeatures.Toggle,
          uc.MediaPlayerFeatures.PlayPause,
          uc.MediaPlayerFeatures.PlayMedia,
          uc.MediaPlayerFeatures.MuteToggle,
          uc.MediaPlayerFeatures.Volume,
          uc.MediaPlayerFeatures.VolumeUpDown,
          uc.MediaPlayerFeatures.ChannelSwitcher,
          uc.MediaPlayerFeatures.SelectSource,
          uc.MediaPlayerFeatures.BrowseMedia,
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
          [uc.MediaPlayerAttributes.SourceList]: this.getInputSelectorOptions(avrEntry),
          [uc.MediaPlayerAttributes.MediaType]: uc.MediaPlayerStates.Unknown
        },
        deviceClass: uc.MediaPlayerDeviceClasses.Receiver,
        options: {
          volume_steps: volumeScale,
          simple_commands: ALL_SIMPLE_COMMANDS
        }
      }
    );
    if (cmdHandler) mediaPlayerEntity.setCmdHandler(cmdHandler);
    mediaPlayerEntity.browse = async (options: uc.BrowseOptions) => {
      for (const handler of this.browseHandlers) {
        const result = await handler.browse(avrEntry, options, mediaPlayerEntity, cmdHandler, rawSend);
        if (result !== undefined) {
          return result;
        }
      }

      return browseMedia(avrEntry, options);
    };
    return mediaPlayerEntity;
  }

  createSensorEntities(avrEntry: string): uc.Sensor[] {
    const sensors: uc.Sensor[] = [];
    const displayBaseName = this.getDisplayBaseName(avrEntry);

    const SENSOR_DEFS = [
      { suffix: "_volume_sensor", label: "Volume", initialValue: 0, options: { [uc.SensorOptions.Decimals]: 1, [uc.SensorOptions.MinValue]: 0, [uc.SensorOptions.MaxValue]: 200 } },
      { suffix: "_audio_input_sensor", label: "Audio Input", initialValue: "", options: {} },
      { suffix: "_audio_output_sensor", label: "Audio Output", initialValue: "", options: {} },
      { suffix: "_source_sensor", label: "Source", initialValue: "", options: {} },
      { suffix: "_video_input_sensor", label: "Video Input", initialValue: "", options: {} },
      { suffix: "_video_output_sensor", label: "Video Output", initialValue: "", options: {} },
      { suffix: "_output_display_sensor", label: "Output Display", initialValue: "", options: {} },
      { suffix: "_front_panel_display_sensor", label: "Front Panel Display", initialValue: "", options: {} },
      { suffix: "_mute_sensor", label: "Mute", initialValue: "", options: {} }
    ];

    for (const def of SENSOR_DEFS) {
      sensors.push(
        new uc.Sensor(
          `${avrEntry}${def.suffix}`,
          { en: `${displayBaseName} ${def.label}` },
          {
            attributes: {
              [uc.SensorAttributes.State]: uc.SensorStates.Unknown,
              [uc.SensorAttributes.Value]: def.initialValue
            },
            deviceClass: uc.SensorDeviceClasses.Custom,
            options: def.options
          }
        )
      );
    }

    return sensors;
  }

  createListeningModeSelectEntity(avrEntry: string, cmdHandler?: (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>): Select {
    const options = this.getListeningModeOptions(undefined, avrEntry);
    const displayBaseName = this.getDisplayBaseName(avrEntry);
    const selectEntity = new Select(
      `${avrEntry}${SELECT_SUFFIXES[0]}`,
      { en: `${displayBaseName} Listening Mode` },
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

  // Return input selector options for the given AVR entry. If a user-configured `inputSelectorOptions` list is present it is returned exactly; if `null` (disabled) returns empty; otherwise all SLI keys (excluding navigation/query keys) are returned sorted.
  getInputSelectorOptions(avrEntry?: string): string[] {
    if (avrEntry) {
      try {
        const cfg = ConfigManager.get();
        if (cfg && Array.isArray(cfg.avrs)) {
          const match = cfg.avrs.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
          if (match && Object.prototype.hasOwnProperty.call(match, "inputSelectorOptions")) {
            const opts = match.inputSelectorOptions;
            if (opts === null) return [];
            if (Array.isArray(opts) && opts.length > 0) return opts.map((s) => s.trim());
          }
        }
      } catch {
        // ignore and fall back to defaults
      }
    }
    const sliMappings = eiscpMappings.value_mappings.SLI;
    const excludeKeys = ["up", "down", "query"];
    return Object.keys(sliMappings)
      .filter((key) => !excludeKeys.includes(key))
      .sort();
  }

  createInputSelectorSelectEntity(avrEntry: string, cmdHandler?: (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>): Select {
    const options = this.getInputSelectorOptions(avrEntry);
    const displayBaseName = this.getDisplayBaseName(avrEntry);
    const selectEntity = new Select(
      `${avrEntry}${SELECT_SUFFIXES[1]}`,
      { en: `${displayBaseName} Input Selector` },
      {
        attributes: {
          state: SelectStates.On,
          current_option: "",
          options: options
        }
      }
    );
    if (cmdHandler) selectEntity.setCmdHandler(cmdHandler);
    return selectEntity;
  }
}
