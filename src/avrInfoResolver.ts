// Work out what an AVR info (NRI) reply means for the configured zones of that AVR. NRI describes the AVR as a whole and
// is answered on the main zone, so one reply resolves every configured zone of that AVR: each zone reads the volume
// scale the AVR reported for it, while the inputs and tuner presets it reports are shared by all zones of that AVR.
//
// This module only decides. It updates the in-memory AVR stores (inputs, tuner presets) because whether they changed
// decides which entities to rebuild, but it does no I/O: it neither writes the config nor touches entities nor logs.
// The caller persists the config values, logs the outcome and re-registers entities.
import { buildEntityId, buildPhysicalAvrId, physicalAvrIdFromEntityId, type AvrConfig } from "./configManager.js";
import { isTunerPresetModeEnabled, parseTunerPresetMode } from "./configConstants.js";
import { resolveAutoVolumeScale, type VolumeScaleResolution } from "./volumeScaleResolver.js";
import { resolveInputSourceList } from "./inputSourceResolver.js";
import type { AvrContextRegistry } from "./avrContext.js";

export type AvrInfoZoneResolution = {
  avrConfig: AvrConfig;
  // The zone entity id ("MODEL HOST ZONE"), for logging.
  zoneEntry: string;
  // An "auto" volume scale resolved to a concrete value, to be stored in the config.
  volumeScale?: VolumeScaleResolution;
  // Set (to the reason) when the AVR has no usable input names, so AVR-reported inputs are to be switched off in the
  // config: there is nothing left to resolve, and older AVRs are then not asked for names on every NRI reply.
  disableReportedInputs?: string;
  // The input list was resolved for this zone, so its entities need the current source options.
  inputsResolved: boolean;
  // The tuner presets entity is enabled for this zone, so it needs the current stations.
  tunerPresets: boolean;
  // AVR-wide data (inputs, tuner presets) changed by the time this zone was processed, so the entities of this zone
  // that list them have to be rebuilt.
  avrDataChanged: boolean;
};

export type AvrInfoResolution = {
  zones: AvrInfoZoneResolution[];
  // Set when the AVR-wide input list was replaced, with the zone it was resolved on and why.
  inputsUpdate?: { zoneEntry: string; reason: string };
  // Set when the AVR-wide tuner presets changed, with the zone they were collected on and the station names.
  presetsUpdate?: { zoneEntry: string; names: string[] };
  presetsChanged: boolean;
};

// The config values to store for one zone; undefined when there is nothing to store.
export function configPatchFor(zone: AvrInfoZoneResolution): Partial<AvrConfig> | undefined {
  const patch: Partial<AvrConfig> = {};
  if (zone.volumeScale) {
    patch.volumeScale = zone.volumeScale.scale;
    patch.volumeScaleDiscovered = zone.volumeScale.discovered;
  }
  if (zone.disableReportedInputs !== undefined) {
    patch.useAvrReportedInputs = false;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

// Resolve an NRI reply received for `entityId` against the configured zones. Returns undefined when the entity does
// not belong to a configured AVR.
export function resolveAvrInfo(avrs: AvrConfig[], entityId: string, contexts: AvrContextRegistry): AvrInfoResolution | undefined {
  const physicalAVR = physicalAvrIdFromEntityId(entityId);
  if (!physicalAVR) {
    return undefined;
  }

  const zones = avrs.filter((avrConfig) => buildPhysicalAvrId(avrConfig.model, avrConfig.ip) === physicalAVR);
  if (zones.length === 0) {
    return undefined;
  }

  const context = contexts.get(physicalAVR);
  const resolution: AvrInfoResolution = { zones: [], presetsChanged: false };

  // The input list and the tuner presets belong to the AVR, not to a single zone: they are stored once, on the first
  // zone that asks for them.
  let inputsChanged = false;
  let inputsDecided = false;
  let presetsCollected = false;

  for (const avrConfig of zones) {
    const zoneEntry = buildEntityId(avrConfig.model, avrConfig.ip, avrConfig.zone);
    const zone: AvrInfoZoneResolution = { avrConfig, zoneEntry, inputsResolved: false, tunerPresets: false, avrDataChanged: false };

    zone.volumeScale = resolveAutoVolumeScale(avrConfig, entityId, contexts);

    const inputResolution = resolveInputSourceList(avrConfig, entityId, contexts);
    if (inputResolution) {
      zone.inputsResolved = true;
      if (!inputResolution.inputs) {
        zone.disableReportedInputs = inputResolution.reason;
        if (!inputsDecided) {
          inputsDecided = true;
          inputsChanged = context.inputs.has();
          context.inputs.clear();
        }
      } else if (!inputsDecided) {
        inputsDecided = true;
        inputsChanged = context.inputs.set(inputResolution.inputs);
        if (inputsChanged) {
          resolution.inputsUpdate = { zoneEntry, reason: inputResolution.reason };
        }
      }
    }

    if (isTunerPresetModeEnabled(avrConfig.createTunerPresets)) {
      zone.tunerPresets = true;
      if (!presetsCollected) {
        presetsCollected = true;
        resolution.presetsChanged = context.tunerPresets.set(context.avrInfo.namedPresets());
        if (resolution.presetsChanged) {
          const order = parseTunerPresetMode(avrConfig.createTunerPresets) === "preset-order" ? "preset-order" : "alphabetical";
          resolution.presetsUpdate = { zoneEntry, names: context.tunerPresets.names(order) };
        }
      }
    }

    zone.avrDataChanged = inputsChanged || resolution.presetsChanged;
    resolution.zones.push(zone);
  }

  return resolution;
}
