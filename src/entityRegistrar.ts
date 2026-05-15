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
  getContiguousItemCount,
  markTidalListModeActive,
  markTraceNextTidalSelectionAfterMainMenu,
  resetTidalBrowseState,
  setTidalMainMenuShortcut,
  getTidalTotalListItemCount,
  getTidalHarvestMode,
  getTidalNlsLayerNumber,
  setTidalHarvestMode,
  setTidalNlsCursorOffset,
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
   * Send NLAL requests for Tidal to retrieve list items as XML.
   *
   * Phase 1 (awaited by caller): collects all items up to the count the AVR initially
   * reported in its first NLT — typically 50.  The browse callback awaits this so that
   * the remote sees those items immediately in the first browse response.
   *
   * Phase 2 (background): Tidal uses two-phase NLT loading — the AVR emits a second NLT
   * with the real total once the service finishes buffering.  Phase 2 fires in the
   * background after the browse has already returned, fetching any additional items.
   */
  private async harvestTidalListItems(
    entityId: string,
    menuDelay: number,
    rawSend: (cmd: string) => Promise<void>
  ): Promise<void> {
    // Guard: don't start a second harvest if one is already running.
    if (getTidalHarvestMode(entityId)) return;

    const initialTotal = getTidalTotalListItemCount(entityId);
    if (initialTotal <= 0) return;

    const currentCount = listTidalMenuOptions(entityId).length;
    if (currentCount >= initialTotal) return;

    const scanDelay = Math.max(150, Math.min(Math.floor(menuDelay / 3), 400));

    // Use the layer number from the NLT ll field — it's the exact layer NLAL needs.
    // Try that layer first, then neighbours as fallback.
    const knownLayer = getTidalNlsLayerNumber(entityId);
    const layersToTry = knownLayer > 0
      ? [knownLayer, knownLayer - 1, knownLayer + 1].filter((l) => l > 0).map((l) => l.toString(16).toUpperCase().padStart(2, "0"))
      : ["02", "01", "03"];

    log.info("%s [%s] Tidal NLAL harvest: need %d items, have %d, trying layers %s", integrationName, entityId, initialTotal, currentCount, layersToTry.join(","));

    setTidalHarvestMode(entityId, true);
    try {
      // Phase 1 (awaited): fetch items up to the initially reported total.
      await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
    } catch (e) {
      setTidalHarvestMode(entityId, false);
      throw e;
    }

    // Phase 1 done — caller proceeds to return the browse response with these items.
    // Phase 2 runs in the background: wait for a potential second NLT that raises the
    // total (e.g. 50 → 639), then fetch the remaining items chunk by chunk.
    void (async () => {
      try {
        await delay(scanDelay * 2);
        const updatedTotal = getTidalTotalListItemCount(entityId);
        const collectedAfterPhase1 = listTidalMenuOptions(entityId).length;
        if (updatedTotal > collectedAfterPhase1) {
          log.info("%s [%s] Tidal NLAL harvest phase 2: total updated to %d, have %d", integrationName, entityId, updatedTotal, collectedAfterPhase1);
          await this.harvestNlalChunks(entityId, layersToTry, scanDelay, rawSend);
        }
      } finally {
        setTidalHarvestMode(entityId, false);
        const finalTotal = getTidalTotalListItemCount(entityId);
        log.info("%s [%s] Tidal NLAL harvest complete: %d/%d items", integrationName, entityId, listTidalMenuOptions(entityId).length, finalTotal);
      }
    })();
  }

  /**
   * Send NLAL requests in a loop until all items up to the current total are collected,
   * or until a pass produces no new items (genuine stuck / wrong layer for every attempt).
   * Uses the first layer from `layersToTry` primarily; falls back to the others only when
   * the primary makes no progress, cycling through them until one produces items or all fail.
   */
  private async harvestNlalChunks(
    entityId: string,
    layersToTry: string[],
    scanDelay: number,
    rawSend: (cmd: string) => Promise<void>
  ): Promise<void> {
    // Use the count of CONTIGUOUS items from menuIndex=1, not the total items in the store.
    // NLS entries may have been collected at high absolute positions (e.g. cursor at 66 →
    // NLS at 58–67), which inflates listTidalMenuOptions().length without filling positions
    // 1–57. getContiguousItemCount() correctly returns 0 in that case so we request from 0.
    let lastContiguous = -1;
    while (true) {
      const total = getTidalTotalListItemCount(entityId);
      const contiguous = getContiguousItemCount(entityId);
      if (contiguous >= total) break;
      if (contiguous === lastContiguous) break; // no progress on any layer — give up
      lastContiguous = contiguous;

      for (const layer of layersToTry) {
        const offset = getContiguousItemCount(entityId);
        const offsetHex = offset.toString(16).toUpperCase().padStart(4, "0");
        await rawSend(`NLAL${this.nextTidalListSequence()}${layer}${offsetHex}03E7`);
        await delay(scanDelay);
        if (getContiguousItemCount(entityId) >= getTidalTotalListItemCount(entityId)) return;
      }
      // Small extra wait so the last NLA XML from this pass can arrive before we re-check.
      await delay(scanDelay);
    }
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
          await this.harvestTidalListItems(avrEntry, menuDelay, rawSend);
        }

        return browseMedia(avrEntry, {
          ...options,
          media_id: TIDAL_ROOT_ID,
          media_type: TIDAL_ROOT_TYPE
        });
      }

      if (tidalSelection && cmdHandler) {
        setTidalMainMenuShortcut(avrEntry, true);

        // Only navigate on fresh selections (offset=0); skip re-navigation on paging scrolls.
        if ((options.paging?.offset ?? 0) === 0) {
          await cmdHandler(mediaPlayerEntity, uc.MediaPlayerCommands.PlayMedia, {
            media_id: tidalSelection.mediaId,
            media_type: TIDAL_ROOT_TYPE
          });

          if (tidalSelection.isBrowsable) {
            const beforeSignature = this.buildTidalMenuSignature(avrEntry);

            const cfg = ConfigManager.get();
            const avr = cfg?.avrs?.find((a) => buildEntityId(a.model, a.ip, a.zone) === avrEntry);
            const menuDelay = avr?.netMenuDelay ?? AVR_DEFAULTS.netMenuDelay;

            await this.waitForTidalMenuStable(avrEntry, beforeSignature, menuDelay);
            markTidalListModeActive(avrEntry);
            if (rawSend) {
              await this.harvestTidalListItems(avrEntry, menuDelay, rawSend);
            }
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
