// Per-AVR runtime state. Each physical AVR ("MODEL HOST") gets one AvrContext holding the stores for that AVR, so no
// module keeps AVR state in a hidden global. The driver owns the AvrContextRegistry and passes it to the components
// that need AVR state.
import { TunerPresetStore } from "./tunerPresetStore.js";
import { InputSourceStore } from "./inputSourceStore.js";
import { AvrInfoStore } from "./avrInfoStore.js";
import { physicalAvrIdFromEntityId } from "./configManager.js";

export class AvrContext {
  readonly tunerPresets = new TunerPresetStore();
  readonly inputs = new InputSourceStore();
  readonly avrInfo = new AvrInfoStore();

  constructor(readonly physicalAvrId: string) {}
}

export class AvrContextRegistry {
  private readonly contexts = new Map<string, AvrContext>();

  // The context of a physical AVR, created on first use.
  get(physicalAvrId: string): AvrContext {
    let context = this.contexts.get(physicalAvrId);
    if (!context) {
      context = new AvrContext(physicalAvrId);
      this.contexts.set(physicalAvrId, context);
    }
    return context;
  }

  // The context of the AVR a zone entity id ("MODEL HOST ZONE") belongs to; undefined when the id has no AVR part.
  forEntity(entityId: string): AvrContext | undefined {
    const physicalAvrId = physicalAvrIdFromEntityId(entityId);
    return physicalAvrId ? this.get(physicalAvrId) : undefined;
  }

  // Forget one AVR, e.g. when it is removed from the configuration.
  delete(physicalAvrId: string): void {
    this.contexts.delete(physicalAvrId);
  }

  // Forget every AVR, e.g. when the configuration is cleared.
  clear(): void {
    this.contexts.clear();
  }
}

// TRANSITIONAL (item 10 migration): the registry used by components that are constructed without one, and by the
// driver itself until every component receives the registry explicitly. Removed in the last migration step, after
// which the registry parameters become required.
export const sharedAvrContexts = new AvrContextRegistry();
