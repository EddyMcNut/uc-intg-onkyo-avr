import { type ZoneAgnosticServiceAdapter } from "./zoneAgnosticServiceAdapters.js";

export class ZoneAgnosticServiceCommandRouter {
  constructor(private readonly serviceAdapters: ZoneAgnosticServiceAdapter[]) {}

  dispatchNltContext(sourceEntityId: string, title: string): void {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNltContext?.(sourceEntityId, title);
    }
  }

  dispatchNls(sourceEntityId: string, entry: string): void {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNls(sourceEntityId, entry);
    }
  }

  dispatchNla(sourceEntityId: string, xmlPayload: string): void {
    for (const adapter of this.serviceAdapters) {
      adapter.handleNla(sourceEntityId, xmlPayload);
    }
  }

  dispatchMetadata(zoneEntityId: string, artist: string): void {
    for (const adapter of this.serviceAdapters) {
      adapter.handleMetadata(zoneEntityId, artist);
    }
  }
}
