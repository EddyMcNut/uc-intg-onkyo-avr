// Entity availability while the connection to an AVR is down. UC renders entities with the UNAVAILABLE state as
// inactive (core-api entities README, "States"). Entities that are not configured are skipped by the library
// (updateEntityAttributes returns false), so this can address every possible entity of a zone.
import * as uc from "@unfoldedcircle/integration-api";
import { SENSOR_SUFFIXES, SELECT_SUFFIXES, REMOTE_SUFFIX } from "./sensorSuffixes.js";
import type { AvrStateApi } from "./types.js";
import log from "./loggers.js";

const logSource = "entityAvailability:";

// Mark every entity of the given zones as UNAVAILABLE (available = false), or restore their state (available = true).
// On restore, the media player and remote get their state from the last known AVR state, and sensors and selects
// are set to ON: their values are refreshed by the queries that follow a reconnect, but a sensor that receives no new
// value (e.g. video information without a video source) must not stay greyed out.
export function setZoneEntitiesAvailability(driver: uc.IntegrationAPI, zoneEntityIds: readonly string[], available: boolean, avrStateApi: AvrStateApi): void {
  for (const zoneEntityId of zoneEntityIds) {
    log.info("%s [%s] entities %s", logSource, zoneEntityId, available ? "available again" : "unavailable (AVR connection lost)");
    if (available) {
      avrStateApi.applyMediaPlayerState(zoneEntityId, driver);
      avrStateApi.applyRemoteState(zoneEntityId, driver);
    } else {
      driver.updateEntityAttributes(zoneEntityId, { [uc.MediaPlayerAttributes.State]: uc.MediaPlayerStates.Unavailable });
      driver.updateEntityAttributes(`${zoneEntityId}${REMOTE_SUFFIX}`, { [uc.RemoteAttributes.State]: uc.RemoteStates.Unavailable });
    }
    for (const suffix of SENSOR_SUFFIXES) {
      driver.updateEntityAttributes(`${zoneEntityId}${suffix}`, { [uc.SensorAttributes.State]: available ? uc.SensorStates.On : uc.SensorStates.Unavailable });
    }
    for (const suffix of Object.values(SELECT_SUFFIXES)) {
      driver.updateEntityAttributes(`${zoneEntityId}${suffix}`, { [uc.SelectAttributes.State]: available ? uc.SelectStates.On : uc.SelectStates.Unavailable });
    }
  }
}
