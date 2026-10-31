import { VOLUME_SCALE_AUTO, VOLUME_SCALE_FALLBACK, type AvrConfig, type VolumeScale } from "./configManager.js";
import { getAvrVolumeScale } from "./avrInfoStore.js";

export type VolumeScaleResolution = {
  // The concrete scale to store in the config.
  scale: VolumeScale;
  // How this scale was arrived at, for the debug log.
  reason: string;
  discovered: boolean;
};

// Resolve the volume scale of one AVR zone when it is set to "auto". Returns undefined when there is nothing to do: the zone already has a concrete scale, so a value that was set manually (or resolved earlier) is never overwritten.
export function resolveAutoVolumeScale(avrConfig: AvrConfig, entityId: string): VolumeScaleResolution | undefined {
  if (avrConfig.volumeScale !== VOLUME_SCALE_AUTO) {
    return undefined;
  }

  const reported = getAvrVolumeScale(entityId, avrConfig.zone);
  if (reported === 80 || reported === 100) {
    return { scale: reported, reason: `AVR reports a maximum display volume of ${reported}`, discovered: true };
  }

  return {
    scale: VOLUME_SCALE_FALLBACK,
    reason:
      reported === undefined ? "AVR does not report a maximum display volume, so the default is used" : `AVR reports an unsupported maximum display volume of ${reported}, so the default is used`,
    discovered: false
  };
}
