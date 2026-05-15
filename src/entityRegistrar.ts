/*jslint node:true nomen:true*/
"use strict";
import * as uc from "@unfoldedcircle/integration-api";
import { Select, SelectStates } from "@unfoldedcircle/integration-api";
import { eiscpMappings } from "./eiscp-mappings.js";
import { getCompatibleListeningModes } from "./listeningModeFilters.js";
import { ConfigManager, AVR_DEFAULTS, buildEntityId } from "./configManager.js";
import { browseMedia, isTidalMainMenuRequest, resolveTidalMenuOption, TIDAL_ROOT_ID, TIDAL_ROOT_TYPE } from "./mediaBrowser.js";
import {
  listTidalMenuOptions,
  markTidalListModeActive,
  markTraceNextTidalSelectionAfterMainMenu,
  resetTidalBrowseState,
  setTidalMainMenuShortcut,
  getTidalTotalListItemCount,
  getTidalHarvestMode,
  getTidalNlsLayerNumber,
  setTidalHarvestMode,
  setTidalNlsCursorOffset
} from "./tidalBrowserStore.js";
import log from "./loggers.js";
import { delay } from "./utils.js";

const integrationName = "entityRegistrar:";

export default class EntityRegistrar {
  private tidalListSequence = 0;

  private nextTidalListSequence(): string {
    const seq = this.tidalListSequence & 0xffff;
    this.tidalListSequence = (this.tidalListSequence + 1) & 0xffff;
    return seq.toString(16).toUpperCase().padStart(4, "0");
  }

  private buildTidalMenuSignature(entityId: string): string {
    const options = listTidalMenuOptions(entityId);
    return options.map((item) => `${item.menuIndex}:${item.title}`).join("|");
  }

  /**
   * Wait until the Tidal menu cache changes from beforeSignature AND then stabilizes
   * (no further changes for a full tick). This ensures the full NLS stream from the
   * AVR has been ingested before returning browse results.
   */
  private async waitForTidalMenuStable(entityId: string, beforeSignature: string, menuDelay: number): Promise<void> {
    const tick = Math.max(120, Math.floor(menuDelay / 2));
    const deadline = Date.now() + Math.max(menuDelay * 3, 1800);
    let lastSignature = beforeSignature;
    let changed = false;

    do {
      await delay(tick);
      const current = this.buildTidalMenuSignature(entityId);
      if (!changed) {
        if (current && current !== lastSignature) {
          changed = true;
          lastSignature = current;
        }
      } else {
        // Signature already changed once — wait for it to stop changing
        if (current === lastSignature) {
          break; // stable
        }
        lastSignature = current;
      }
    } while (Date.now() < deadline);
  }

  /**
   * Send NLAL requests for Tidal to retrieve list items as XML — same mechanism TuneIn uses.
   * This runs in the background after the browse callback already returned the first 10 items.
   */
  private async harvestTidalListItems(
    entityId: string,
    menuDelay: number,
    rawSend: (cmd: string) => Promise<void>
  ): Promise<void> {
    // Guard: don't start a second harvest if one is already running.
    if (getTidalHarvestMode(entityId)) return;

    const total = getTidalTotalListItemCount(entityId);
    if (total <= 0) return;

    const currentCount = listTidalMenuOptions(entityId).length;
    if (currentCount >= total) return;

    const countHex = Math.min(total, 0x03e7).toString(16).toUpperCase().padStart(4, "0"); // up to 999
    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));

    // Use the layer number from the NLT ll field — it's the exact layer NLAL needs.
    // Try that layer first, then neighbours as fallback.
    const knownLayer = getTidalNlsLayerNumber(entityId);
    const layersToTry = knownLayer > 0
      ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((l) => l > 0).map((l) => l.toString(16).toUpperCase().padStart(2, "0"))
      : ["02", "01", "03"];

    log.info("%s [%s] Tidal NLAL harvest: need %d items, have %d, trying layers %s", integrationName, entityId, total, currentCount, layersToTry.join(","));

    setTidalHarvestMode(entityId, true);
    try {
      for (const layer of layersToTry) {
        await rawSend(`NLAL${this.nextTidalListSequence()}${layer}0000${countHex}`);
        await delay(scanDelay);
        if (listTidalMenuOptions(entityId).length >= total) break;
      }
      // Extra wait for the AVR to respond with all NLA XML packets.
      await delay(scanDelay * 2);
    } finally {
      setTidalHarvestMode(entityId, false);
    }

    log.info("%s [%s] Tidal NLAL harvest complete: %d/%d items", integrationName, entityId, listTidalMenuOptions(entityId).length, total);
  }

  /**
   * Build a user-facing base name from an AVR entry id.
   * Input format is typically: "MODEL HOST ZONE".
   * Long style keeps the full entry, short style omits HOST (IP/hostname).
   */
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

  /**
   * Return listening mode options. If an AVR-specific `listeningModeOptions`
   * is configured, return it exactly. Otherwise fall back to dynamic filtering
   * by audio format (or return all available modes).
   */
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

  createMediaPlayerEntity(
    avrEntry: string,
    volumeScale: number,
    cmdHandler?: (entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>,
    rawSend?: (cmd: string) => Promise<void>
  ): uc.MediaPlayer {
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
          [uc.MediaPlayerAttributes.MediaType]: uc.MediaPlayerStates.Unknown
        },
        deviceClass: uc.MediaPlayerDeviceClasses.Receiver,
        options: {
          volume_steps: volumeScale
        }
      }
    );
    if (cmdHandler) mediaPlayerEntity.setCmdHandler(cmdHandler);
    mediaPlayerEntity.browse = async (options: uc.BrowseOptions) => {
      const tidalMainMenu = isTidalMainMenuRequest(options.media_id, options.media_type);
      const tidalSelection = resolveTidalMenuOption(options.media_id, options.media_type);
      
      if (tidalMainMenu && cmdHandler) {
        // Main Tidal Menu selection
        resetTidalBrowseState(avrEntry);
        markTraceNextTidalSelectionAfterMainMenu(avrEntry);
        log.info("%s [%s] Main Tidal Menu selected; next Tidal selection will be traced", integrationName, avrEntry);
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: String(options.media_id),
          media_type: TIDAL_ROOT_TYPE
        });

        const beforeSignature = this.buildTidalMenuSignature(avrEntry);

        const cfg = ConfigManager.get();
        const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
        const menuDelay = avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;

        await this.waitForTidalMenuStable(avrEntry, beforeSignature, menuDelay);
        markTidalListModeActive(avrEntry);
        if (rawSend) {
          // Fire harvest in the background so the remote gets the first 10 items immediately.
          void this.harvestTidalListItems(avrEntry, menuDelay, rawSend);
        }

        return browseMedia(avrEntry, {
          ...options,
          media_id: TIDAL_ROOT_ID,
          media_type: TIDAL_ROOT_TYPE
        });
      }

      if (tidalSelection && cmdHandler) {
        setTidalMainMenuShortcut(avrEntry, true);
        
        // Handle both menu folders and songs through PlayMedia
        await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
          media_id: tidalSelection.mediaId,
          media_type: TIDAL_ROOT_TYPE
        });

        // Only wait for signature stability if this is a menu folder, not a song
        if (tidalSelection.isBrowsable) {
          const beforeSignature = this.buildTidalMenuSignature(avrEntry);

          const cfg = ConfigManager.get();
          const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
          const menuDelay = avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;

          await this.waitForTidalMenuStable(avrEntry, beforeSignature, menuDelay);
          markTidalListModeActive(avrEntry);
          if (rawSend) {
            // Fire harvest in the background so the remote gets the first 10 items immediately.
            void this.harvestTidalListItems(avrEntry, menuDelay, rawSend);
          }
        }

        return browseMedia(avrEntry, {
          ...options,
          media_id: TIDAL_ROOT_ID,
          media_type: TIDAL_ROOT_TYPE
        });
      }

      return browseMedia(avrEntry, options);
    };
    return mediaPlayerEntity;
  }

  createSensorEntities(avrEntry: string): uc.Sensor[] {
    const sensors: uc.Sensor[] = [];
    const displayBaseName = this.getDisplayBaseName(avrEntry);

    const volumeSensor = new uc.Sensor(
      `${avrEntry}_volume_sensor`,
      { en: `${displayBaseName} Volume` },
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
      { en: `${displayBaseName} Audio Input` },
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
      { en: `${displayBaseName} Audio Output` },
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
      { en: `${displayBaseName} Source` },
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
      { en: `${displayBaseName} Video Input` },
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
      { en: `${displayBaseName} Video Output` },
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
      { en: `${displayBaseName} Output Display` },
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
      { en: `${displayBaseName} Front Panel Display` },
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
      { en: `${displayBaseName} Mute` },
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
    const options = this.getListeningModeOptions(undefined, avrEntry);
    const displayBaseName = this.getDisplayBaseName(avrEntry);
    const selectEntity = new Select(
      `${avrEntry}_listening_mode`,
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

  /**
   * Return input selector options for the given AVR entry. If a user-configured
   * `inputSelectorOptions` list is present it is returned exactly; otherwise all
   * SLI keys (excluding navigation/query keys) are returned sorted.
   */
  getInputSelectorOptions(avrEntry?: string): string[] {
    if (avrEntry) {
      try {
        const cfg = ConfigManager.get();
        if (cfg && Array.isArray(cfg.avrs)) {
          const match = cfg.avrs.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
          if (match && Array.isArray(match.inputSelectorOptions) && match.inputSelectorOptions.length > 0) {
            return match.inputSelectorOptions.map((s) => s.trim());
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
      `${avrEntry}_input_selector`,
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
