import test from "ava";
import path from "path";
import { pathToFileURL } from "url";

type DistModule = Record<string, unknown>;

async function importDist(modulePath: string): Promise<DistModule> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

test.serial("MenuBrowseHandlerBase harvest contract populates contiguous items and clears harvestMode", async (t) => {
  const baseModule = await importDist("dist/src/menuBrowseHandlerBase.js");
  const { MenuBrowseHandlerBase } = baseModule as { MenuBrowseHandlerBase: new () => any };

  class TestHandler extends MenuBrowseHandlerBase {
    protected readonly integrationName = "test:handler";
    protected phase2HarvestEnabled = false;
    private sequence = 0;
    private readonly entityId = "TX-CONTRACT 10.0.0.81 main";
    private readonly state = {
      harvestMode: false,
      totalListItemCount: 3,
      nlsLayerNumber: 2
    };
    private readonly items: { menuIndex: number; title: string }[] = [{ menuIndex: 1, title: "One" }];

    protected getServiceLabel(): string {
      return "Test";
    }

    protected nextListSequence(): string {
      this.sequence += 1;
      return this.sequence.toString(16).padStart(4, "0").toUpperCase();
    }

    protected getMenuState(entityId: string) {
      return entityId === this.entityId ? this.state : null;
    }

    protected listMenuItems(entityId: string) {
      return entityId === this.entityId ? this.items : [];
    }

    protected getContiguousItemCount(entityId: string): number {
      return entityId === this.entityId ? this.items.length : 0;
    }

    protected getMenuDelay(): number {
      return 120;
    }

    public async run(rawSend: (cmd: string) => Promise<void>): Promise<void> {
      await this.harvestListItems(this.entityId, rawSend);
    }

    public getHarvestMode(): boolean {
      return this.state.harvestMode;
    }

    public getItems(): { menuIndex: number; title: string }[] {
      return this.items;
    }

    public pushNextItem(): void {
      const nextIndex = this.items.length + 1;
      this.items.push({ menuIndex: nextIndex, title: `Item ${nextIndex}` });
    }
  }

  const handler = new TestHandler();
  const nlalCommands: string[] = [];

  await handler.run(async (cmd: string) => {
    nlalCommands.push(cmd);
    if (cmd.startsWith("NLAL") && handler.getItems().length < 3) {
      handler.pushNextItem();
    }
  });

  t.true(nlalCommands.length >= 1);
  t.is(handler.getItems().length, 3);
  t.false(handler.getHarvestMode());
});

test.serial("TuneIn adapter contract ingests NLS only for active TuneIn zones", async (t) => {
  const adaptersModule = await importDist("dist/src/zoneAgnosticServiceAdapters.js");
  const tuneInStoreModule = await importDist("dist/src/tuneInMenuStore.js");

  const { TuneInZoneAgnosticAdapter } = adaptersModule as { TuneInZoneAgnosticAdapter: new (deps: any) => any };
  const { listTuneInMenuOptions } = tuneInStoreModule as { listTuneInMenuOptions: (entityId: string) => unknown[] };

  const activeZone = "TX-CONTRACT 10.0.0.82 main";
  const controlZone = "TX-CONTRACT 10.0.0.92 main";

  const state = {
    getSubSource: (_entityId: string) => "tunein",
    getEntitiesByPhysicalAvrAndSource: (physicalAvrId: string, source: string) => {
      if (source !== "net") {
        return [];
      }
      if (physicalAvrId === "TX-CONTRACT 10.0.0.82") {
        return [activeZone];
      }
      if (physicalAvrId === "TX-CONTRACT 10.0.0.92") {
        return [controlZone];
      }
      return [];
    }
  };

  const adapter = new TuneInZoneAgnosticAdapter({
    state,
    getPhysicalAvrId: (entityId: string) => (entityId === controlZone ? "TX-CONTRACT 10.0.0.92" : "TX-CONTRACT 10.0.0.82"),
    isTuneInFullMenu: async () => true,
    preloadTuneInPresets: async () => undefined
  });

  adapter.handleNls(activeZone, "U0-Browse");

  t.is(listTuneInMenuOptions(activeZone).length, 1);
  t.is(listTuneInMenuOptions(controlZone).length, 0);
});

test.serial("Tidal adapter contract ingests NLA and metadata for active zones", async (t) => {
  const adaptersModule = await importDist("dist/src/zoneAgnosticServiceAdapters.js");
  const tidalStoreModule = await importDist("dist/src/tidalBrowserStore.js");

  const { TidalZoneAgnosticAdapter } = adaptersModule as { TidalZoneAgnosticAdapter: new (deps: any) => any };
  const { listTidalMenuOptions, getTidalBrowseState } = tidalStoreModule as {
    listTidalMenuOptions: (entityId: string) => unknown[];
    getTidalBrowseState: (entityId: string) => { nowPlayingTitle: string } | null;
  };

  const activeZone = "TX-CONTRACT 10.0.0.83 main";
  const controlZone = "TX-CONTRACT 10.0.0.93 main";

  const state = {
    getSubSource: (_entityId: string) => "tidal",
    getEntitiesByPhysicalAvrAndSource: (physicalAvrId: string, source: string) => {
      if (source !== "net") {
        return [];
      }
      if (physicalAvrId === "TX-CONTRACT 10.0.0.83") {
        return [activeZone];
      }
      if (physicalAvrId === "TX-CONTRACT 10.0.0.93") {
        return [controlZone];
      }
      return [];
    }
  };

  const adapter = new TidalZoneAgnosticAdapter({
    state,
    getPhysicalAvrId: (entityId: string) => (entityId === controlZone ? "TX-CONTRACT 10.0.0.93" : "TX-CONTRACT 10.0.0.83")
  });

  adapter.handleNla(activeZone, '<?xml version="1.0" encoding="UTF-8"?><response status="ok"><items offset="0000"><item iconid="2F" title="Track A" url="0"/></items></response>');
  adapter.handleMetadata(activeZone, "Artist A");

  t.is(listTidalMenuOptions(activeZone).length, 1);
  t.is(listTidalMenuOptions(controlZone).length, 0);
  t.is(getTidalBrowseState(activeZone)?.nowPlayingTitle, "Artist A");
});

test.serial("Browse service contract maps service ids to activation rules and selector commands", async (t) => {
  const contractModule = await importDist("dist/src/browseServiceContract.js");
  const {
    TUNEIN_SERVICE_ID,
    TIDAL_SERVICE_ID,
    isBrowseServiceId,
    isBrowseServiceActive,
    getBrowseServiceSelectSourceCommand
  } = contractModule as {
    TUNEIN_SERVICE_ID: string;
    TIDAL_SERVICE_ID: string;
    isBrowseServiceId: (serviceId: string) => boolean;
    isBrowseServiceActive: (source: string, subSource: string, serviceId: string) => boolean;
    getBrowseServiceSelectSourceCommand: (serviceId: string) => string;
  };

  t.true(isBrowseServiceId(TUNEIN_SERVICE_ID));
  t.true(isBrowseServiceId(TIDAL_SERVICE_ID));
  t.false(isBrowseServiceId("spotify"));

  t.true(isBrowseServiceActive("net", "tunein", TUNEIN_SERVICE_ID));
  t.false(isBrowseServiceActive("net", "tidal", TUNEIN_SERVICE_ID));
  t.false(isBrowseServiceActive("dab", "tunein", TUNEIN_SERVICE_ID));

  t.is(getBrowseServiceSelectSourceCommand(TUNEIN_SERVICE_ID), "input-selector tunein");
  t.is(getBrowseServiceSelectSourceCommand(TIDAL_SERVICE_ID), "input-selector tidal");
});
