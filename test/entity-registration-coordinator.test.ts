import { describe, expect, it, vi } from "vitest";
import { EntityRegistrationCoordinator } from "../src/entityRegistrationCoordinator.js";

function createDependencies() {
  const registered: Array<{ entity: { id: string }; entityId: string }> = [];
  const registrar = {
    createMediaPlayerEntity: vi.fn((id: string) => ({ id })),
    createSensorEntities: vi.fn((id: string) => [{ id: `${id}_sensor` }]),
    createRemoteEntity: vi.fn((id: string) => ({ id: `${id}_remote` })),
    createListeningModeSelectEntity: vi.fn((id: string) => ({ id: `${id}_listening_mode` })),
    createInputSelectorSelectEntity: vi.fn((id: string) => ({ id: `${id}_input_selector` })),
    createTunerPresetsSelectEntity: vi.fn((id: string) => ({ id: `${id}_tuner_presets` })),
    createDiracSelectEntity: vi.fn((id: string) => ({ id: `${id}_dirac` })),
    getInputSelectorOptions: vi.fn(() => ["CD"]),
    getListeningModeOptions: vi.fn(() => ["Stereo"]),
    getTunerPresetOptions: vi.fn(() => ["Station"])
  };
  return {
    registered,
    dependencies: {
      entityRegistrar: registrar,
      listeningModeHandler: { handle: vi.fn() } as never,
      inputSelectorHandler: { handle: vi.fn() } as never,
      tunerPresetsHandler: { handle: vi.fn() } as never,
      diracHandler: { handle: vi.fn() } as never,
      remoteEntityCommandHandler: { handle: vi.fn() } as never,
      sharedCommandHandler: vi.fn(),
      registerEntity: (entity: { id: string }, entityId: string) => registered.push({ entity, entityId }),
      logDisabled: vi.fn(),
      updateEntityAttributes: vi.fn()
    },
    registrar
  };
}

const config = {
  model: "TX-RZ50",
  ip: "192.168.1.20",
  port: 60128,
  zone: "main",
  volumeScale: "auto",
  createSensors: false,
  createRemoteEntity: false,
  createTunerPresets: false,
  createDiracSelectEntity: false
} as never;

describe("EntityRegistrationCoordinator", () => {
  it("registers only enabled entity groups", () => {
    const { dependencies, registered } = createDependencies();
    const coordinator = new EntityRegistrationCoordinator(dependencies);

    coordinator.register(
      [config],
      () => "avr_main",
      () => vi.fn()
    );

    expect(registered.map(({ entity }) => entity.id)).toEqual(["avr_main", "avr_main_listening_mode", "avr_main_input_selector"]);
    expect(dependencies.logDisabled).toHaveBeenCalledTimes(4);
  });

  it("registers a media player independently", () => {
    const { dependencies, registered, registrar } = createDependencies();
    const coordinator = new EntityRegistrationCoordinator(dependencies);

    coordinator.registerMediaPlayer(config, () => vi.fn());

    expect(registrar.createMediaPlayerEntity).toHaveBeenCalledOnce();
    expect(registered).toHaveLength(1);
    expect(registered[0].entity.id).toContain("TX-RZ50");
  });
});
