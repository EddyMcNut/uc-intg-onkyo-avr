/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { Select, SelectStates } from "@unfoldedcircle/integration-api";
import { eiscpMappings } from "./eiscp-mappings.js";
import { ALL_SIMPLE_COMMANDS } from "./simpleCommands.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";
import { ConfigManager, buildEntityId } from "./configManager.js";
import {
  browseMedia,
  isTidalMainMenuRequest,
  isTidalBackRequest,
  resolveTidalMenuOption,
  TIDAL_BACK_ID,
  TIDAL_ROOT_ID,
  TIDAL_ROOT_TYPE,
  isDeezerMainMenuRequest,
  isDeezerBackRequest,
  resolveDeezerMenuOption,
  DEEZER_BACK_ID,
  DEEZER_ROOT_ID,
  DEEZER_ROOT_TYPE,
  isMusicServerMainMenuRequest,
  isMusicServerBackRequest,
  resolveMusicServerMenuOption,
  MUSIC_SERVER_BACK_ID,
  MUSIC_SERVER_ROOT_ID,
  MUSIC_SERVER_ROOT_TYPE
} from "./mediaBrowser.js";
import { createMenuBrowseHandler } from "./menuBrowseHandler.js";
import { listTidalMenuOptions, resetTidalBrowseState, getTidalBrowseState } from "./tidalBrowserStore.js";
import { listDeezerMenuOptions, resetDeezerBrowseState, getDeezerBrowseState } from "./deezerBrowserStore.js";
import { listMusicServerMenuOptions, resetMusicServerBrowseState, getMusicServerBrowseState, waitForNlaIngestion } from "./musicServerBrowserStore.js";
import { TuneInBrowseHandler } from "./tuneInBrowseHandler.js";
import { SELECT_SUFFIXES, REMOTE_SUFFIX } from "./sensorSuffixes.js";
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
    this.browseHandlers = [
      new TuneInBrowseHandler(avrStateApi),
      createMenuBrowseHandler({
        providerLabel: "Tidal",
        integrationName: "tidalBrowseHandler:",
        rootId: TIDAL_ROOT_ID,
        rootType: TIDAL_ROOT_TYPE,
        backId: TIDAL_BACK_ID,
        browseMedia,
        isMainMenuRequest: isTidalMainMenuRequest,
        isBackRequest: isTidalBackRequest,
        resolveMenuOption: (mediaId, mediaType) => resolveTidalMenuOption(mediaId, mediaType),
        resetState: resetTidalBrowseState,
        getBrowseState: getTidalBrowseState,
        listMenuItems: listTidalMenuOptions
      }),
      createMenuBrowseHandler({
        providerLabel: "Deezer",
        integrationName: "deezerBrowseHandler:",
        rootId: DEEZER_ROOT_ID,
        rootType: DEEZER_ROOT_TYPE,
        backId: DEEZER_BACK_ID,
        browseMedia,
        isMainMenuRequest: isDeezerMainMenuRequest,
        isBackRequest: isDeezerBackRequest,
        resolveMenuOption: (mediaId, mediaType) => resolveDeezerMenuOption(mediaId, mediaType),
        resetState: resetDeezerBrowseState,
        getBrowseState: getDeezerBrowseState,
        listMenuItems: listDeezerMenuOptions
      }),
      createMenuBrowseHandler({
        providerLabel: "Music Server",
        integrationName: "musicServerBrowseHandler:",
        rootId: MUSIC_SERVER_ROOT_ID,
        rootType: MUSIC_SERVER_ROOT_TYPE,
        backId: MUSIC_SERVER_BACK_ID,
        browseMedia,
        isMainMenuRequest: isMusicServerMainMenuRequest,
        isBackRequest: isMusicServerBackRequest,
        resolveMenuOption: (mediaId, mediaType) => resolveMusicServerMenuOption(mediaId, mediaType),
        resetState: resetMusicServerBrowseState,
        getBrowseState: getMusicServerBrowseState,
        listMenuItems: listMusicServerMenuOptions,
        afterHarvest: async (entityId, rawSend) => {
          void rawSend;
          await waitForNlaIngestion(entityId);
        }
      })
    ];
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

  // Remote entity — optional (createRemoteEntity config). Exposes the same media-player style commands as the media player
  // entity plus the generated simple commands, mapped to physical buttons and UI pages.
  createRemoteEntity(avrEntry: string, cmdHandler?: CmdHandlerFn): uc.Remote {
    const displayBaseName = this.getDisplayBaseName(avrEntry);
    const remoteEntity = new uc.Remote(
      `${avrEntry}${REMOTE_SUFFIX}`,
      { en: `${displayBaseName} Remote` },
      {
        features: [uc.RemoteFeatures.OnOff, uc.RemoteFeatures.Toggle],
        attributes: {
          [uc.RemoteAttributes.State]: uc.RemoteStates.Unknown
        },
        simpleCommands: ALL_SIMPLE_COMMANDS,
        buttonMapping: buildRemoteButtonMapping(),
        uiPages: buildRemoteUiPages(),
        cmdHandler
      }
    );
    return remoteEntity;
  }
}

// Physical button mapping for the remote entity — all commands are handled by RemoteCommandHandler.
function buildRemoteButtonMapping(): uc.DeviceButtonMapping[] {
  return [
    uc.createBtnMapping(uc.Buttons.Back, uc.MediaPlayerCommands.Back),
    uc.createBtnMapping(uc.Buttons.Home, uc.MediaPlayerCommands.Home),
    uc.createBtnMapping(uc.Buttons.ChannelDown, uc.MediaPlayerCommands.ChannelDown),
    uc.createBtnMapping(uc.Buttons.DpadUp, uc.MediaPlayerCommands.CursorUp),
    uc.createBtnMapping(uc.Buttons.DpadDown, uc.MediaPlayerCommands.CursorDown),
    uc.createBtnMapping(uc.Buttons.DpadLeft, uc.MediaPlayerCommands.CursorLeft),
    uc.createBtnMapping(uc.Buttons.DpadRight, uc.MediaPlayerCommands.CursorRight),
    uc.createBtnMapping(uc.Buttons.DpadMiddle, uc.MediaPlayerCommands.CursorEnter),
    uc.createBtnMapping(uc.Buttons.VolumeUp, uc.MediaPlayerCommands.VolumeUp),
    uc.createBtnMapping(uc.Buttons.VolumeDown, uc.MediaPlayerCommands.VolumeDown),
    uc.createBtnMapping(uc.Buttons.Mute, uc.MediaPlayerCommands.MuteToggle),
    uc.createBtnMapping(uc.Buttons.Power, uc.MediaPlayerCommands.Toggle)
  ];
}

// Remote UI command pages — modeled after the Yamaha AVR integration.
function buildRemoteUiPages(): uc.UiPage[] {
  const pages: uc.UiPage[] = [];

  const avrPage = new uc.UiPage("onkyo_avr_commands", "AVR commands", new uc.Size(4, 7));
  avrPage.add(uc.createUiIcon("uc:power-on", 0, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Toggle)));
  avrPage.add(uc.createUiIcon("uc:info", 1, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Info)));
  avrPage.add(uc.createUiText("Settings", 2, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Settings), new uc.Size(2, 1)));
  avrPage.add(uc.createUiIcon("uc:mute", 0, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.MuteToggle), new uc.Size(2, 1)));
  avrPage.add(uc.createUiIcon("uc:plus", 2, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.VolumeUp)));
  avrPage.add(uc.createUiIcon("uc:minus", 3, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.VolumeDown)));
  avrPage.add(uc.createUiText("Dimmer", 0, 2, undefined, new uc.Size(4, 1)));
  avrPage.add(uc.createUiText("Bright", 0, 3, uc.createRemoteSendCmd("DIMMER_BRIGHT")));
  avrPage.add(uc.createUiText("Dim", 1, 3, uc.createRemoteSendCmd("DIMMER_DIM")));
  avrPage.add(uc.createUiText("Dark", 2, 3, uc.createRemoteSendCmd("DIMMER_DARK")));
  avrPage.add(uc.createUiText("Shut-Off", 3, 3, uc.createRemoteSendCmd("DIMMER_SHUT_OFF")));
  avrPage.add(uc.createUiText("Listening Mode", 0, 4, undefined, new uc.Size(4, 1)));
  avrPage.add(uc.createUiText("Stereo", 0, 5, uc.createRemoteSendCmd("LISTENING_MODE_STEREO"), new uc.Size(2, 1)));
  avrPage.add(uc.createUiText("Direct", 2, 5, uc.createRemoteSendCmd("LISTENING_MODE_DIRECT"), new uc.Size(2, 1)));
  avrPage.add(uc.createUiText("All Ch Stereo", 0, 6, uc.createRemoteSendCmd("LISTENING_MODE_ALL_CH_STEREO"), new uc.Size(2, 1)));
  avrPage.add(uc.createUiText("Surround", 2, 6, uc.createRemoteSendCmd("LISTENING_MODE_SURROUND"), new uc.Size(2, 1)));
  pages.push(avrPage);

  const dPadPage = new uc.UiPage("TV direction pad", "TV direction pad", new uc.Size(3, 3));
  dPadPage.add(uc.createUiIcon("uc:back", 0, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Back)));
  dPadPage.add(uc.createUiIcon("uc:up-arrow", 1, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.CursorUp)));
  dPadPage.add(uc.createUiIcon("uc:home", 2, 0, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Home)));
  dPadPage.add(uc.createUiIcon("uc:left-arrow", 0, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.CursorLeft)));
  dPadPage.add(uc.createUiText("OK", 1, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.CursorEnter)));
  dPadPage.add(uc.createUiIcon("uc:right-arrow", 2, 1, uc.createRemoteSendCmd(uc.MediaPlayerCommands.CursorRight)));
  dPadPage.add(uc.createUiIcon("uc:down-arrow", 1, 2, uc.createRemoteSendCmd(uc.MediaPlayerCommands.CursorDown)));
  dPadPage.add(uc.createUiText("Exit", 2, 2, uc.createRemoteSendCmd(uc.MediaPlayerCommands.Back)));
  pages.push(dPadPage);

  const inputsPage = new uc.UiPage("Inputs & More", "Inputs & More", new uc.Size(4, 4));
  inputsPage.add(uc.createUiText("Inputs", 0, 0, undefined, new uc.Size(4, 1)));
  inputsPage.add(uc.createUiText("BD/DVD", 0, 1, uc.createRemoteSendCmd("INPUT_BD")));
  inputsPage.add(uc.createUiText("TV", 1, 1, uc.createRemoteSendCmd("INPUT_TV")));
  inputsPage.add(uc.createUiText("CD", 2, 1, uc.createRemoteSendCmd("INPUT_CD")));
  inputsPage.add(uc.createUiText("NET", 3, 1, uc.createRemoteSendCmd("INPUT_NET")));
  inputsPage.add(uc.createUiText("Bluetooth", 0, 2, uc.createRemoteSendCmd("INPUT_BLUETOOTH"), new uc.Size(2, 1)));
  inputsPage.add(uc.createUiText("TuneIn", 2, 2, uc.createRemoteSendCmd("INPUT_TUNEIN"), new uc.Size(2, 1)));
  inputsPage.add(uc.createUiText("Preset Up", 0, 3, uc.createRemoteSendCmd("PRESET_UP")));
  inputsPage.add(uc.createUiText("Preset Down", 1, 3, uc.createRemoteSendCmd("PRESET_DOWN")));
  inputsPage.add(uc.createUiText("Speaker A", 2, 3, uc.createRemoteSendCmd("SPEAKER_A_ON")));
  inputsPage.add(uc.createUiText("Speaker B", 3, 3, uc.createRemoteSendCmd("SPEAKER_B_ON")));
  pages.push(inputsPage);

  return pages;
}
