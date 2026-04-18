import { buildPhysicalAvrId } from "./configManager.js";

export interface NowPlayingState {
  station?: string;
  artist?: string;
  album?: string;
  title?: string;
}

export interface SharedAvrMediaState {
  nowPlayingBySource: Map<string, NowPlayingState>;
  lastImageHash: string;
  currentImageUrl: string;
}

export class ZoneAgnosticMediaStateStore {
  private readonly sharedMediaState = new Map<string, SharedAvrMediaState>();
  private readonly currentTrackId = new Map<string, string>();

  getPhysicalAvrId(entityId: string): string {
    const parts = entityId.trim().split(/\s+/);
    if (parts.length < 3) {
      return entityId.trim();
    }

    const host = parts[parts.length - 2];
    const model = parts.slice(0, -2).join(" ");
    return buildPhysicalAvrId(model, host);
  }

  getSharedAvrMediaState(entityId: string): SharedAvrMediaState {
    const physicalAvrId = this.getPhysicalAvrId(entityId);
    const existing = this.sharedMediaState.get(physicalAvrId);
    if (existing) {
      return existing;
    }

    const created: SharedAvrMediaState = {
      nowPlayingBySource: new Map(),
      lastImageHash: "",
      currentImageUrl: ""
    };
    this.sharedMediaState.set(physicalAvrId, created);
    return created;
  }

  getNowPlaying(entityId: string, source: string): NowPlayingState {
    const sharedState = this.getSharedAvrMediaState(entityId);
    const existing = sharedState.nowPlayingBySource.get(source);
    if (existing) {
      return existing;
    }

    const created: NowPlayingState = {};
    sharedState.nowPlayingBySource.set(source, created);
    return created;
  }

  updateNowPlaying(entityId: string, source: string, updates: NowPlayingState): void {
    Object.assign(this.getNowPlaying(entityId, source), updates);
  }

  resetZone(entityId: string): void {
    this.currentTrackId.delete(entityId);
  }

  getCurrentTrackId(entityId: string): string {
    return this.currentTrackId.get(entityId) || "";
  }

  setCurrentTrackId(entityId: string, trackId: string): void {
    this.currentTrackId.set(entityId, trackId);
  }
}
