import { describe, it, expect } from "vitest";
import * as uc from "@unfoldedcircle/integration-api";
import path from "path";

it("AvrStateManager maps NET playbackStatus paused to MediaPlayerStates.Paused", async () => {
  const avrStateModule = await import("../src/avrState.js");
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

  expect(statesByEntity.get(entityId)).toBe(uc.MediaPlayerStates.Paused);

  avrStateManager.setPlaybackStatus(entityId, "playing", mockDriver);
  expect(statesByEntity.get(entityId)).toBe(uc.MediaPlayerStates.Playing);
});
