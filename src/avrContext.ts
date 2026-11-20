// Per-AVR runtime state. Each physical AVR ("MODEL HOST") gets one AvrContext holding the stores for that AVR, so no
// module keeps AVR state in a hidden global. The driver owns the AvrContextRegistry and passes it to the components
// that need AVR state.
import { TunerPresetStore } from "./tunerPresetStore.js";
import { InputSourceStore } from "./inputSourceStore.js";
import { AvrInfoStore } from "./avrInfoStore.js";
import { TuneInPresetStore } from "./tuneInBrowserStore.js";
import { createMenuBrowseState, type MenuBrowseOption, type MenuBrowseState } from "./menuBrowseState.js";
import { physicalAvrIdFromEntityId } from "./configManager.js";

export class AvrContext {
  readonly tunerPresets = new TunerPresetStore();
  readonly inputs = new InputSourceStore();
  readonly avrInfo = new AvrInfoStore();
  readonly tuneInPresets = new TuneInPresetStore();
  // TuneIn Full Menu browse state (see tuneInMenuStore.ts).
  readonly tuneInMenu: MenuBrowseState<MenuBrowseOption> = createMenuBrowseState<MenuBrowseOption>();
  private readonly menuBrowseStates = new Map<string, MenuBrowseState<MenuBrowseOption>>();

  constructor(readonly physicalAvrId: string) {}

  // Browse state of a menu-browse service (Tidal, Deezer, Music Server; see menuBrowseStore.ts), created on first use.
  menuBrowseState(serviceId: string): MenuBrowseState<MenuBrowseOption> {
    let state = this.menuBrowseStates.get(serviceId);
    if (!state) {
      state = createMenuBrowseState<MenuBrowseOption>();
      this.menuBrowseStates.set(serviceId, state);
    }
    return state;
  }
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
