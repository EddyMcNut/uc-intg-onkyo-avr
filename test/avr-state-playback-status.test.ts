import test from "ava";
import * as uc from "@unfoldedcircle/integration-api";
import { pathToFileURL } from "url";
import path from "path";

test.serial("AvrStateManager maps NET playbackStatus paused to MediaPlayerStates.Paused", async (t) => {
  const avrStateModule = await import(pathToFileURL(path.resolve(process.cwd(), "dist/src/avrState.js")).href);
  const { avrStateManager } = avrStateModule as any;

  const statesByEntity = new Map<string, uc.MediaPlayerStates>();
  const mockDriver = {
    updateEntityAttributes: (id: string, attrs: { [key: string]: string | number | boolean }) => {
      const state = attrs[uc.MediaPlayerAttributes.State] as uc.MediaPlayerStates | undefined;
      if (state) {
        statesByEntity.set(id, state);
      }
      return true;
    }
  } as any;

  const entityId = "M 1.2.3.4 main";

  avrStateManager.setPowerState(entityId, "on", mockDriver);
  avrStateManager.setSource(entityId, "net", undefined, undefined, mockDriver);
  avrStateManager.setSubSource(entityId, "spotify", undefined, undefined, mockDriver);
  avrStateManager.setPlaybackStatus(entityId, "paused", mockDriver);

  t.is(statesByEntity.get(entityId), uc.MediaPlayerStates.Paused);

  avrStateManager.setPlaybackStatus(entityId, "playing", mockDriver);
  t.is(statesByEntity.get(entityId), uc.MediaPlayerStates.Playing);
});
