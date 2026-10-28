import * as uc from "@unfoldedcircle/integration-api";
import { SelectAttributes } from "@unfoldedcircle/integration-api";
import { AvrConfig, buildEntityId, resolveVolumeScale } from "./configManager.js";
import EntityRegistrar from "./entityRegistrar.js";
import { SelectEntityHandler } from "./selectEntityHandler.js";
import { remoteEntityCommandHandler } from "./remoteEntityCommandHandler.js";

export interface EntityRegistration {
  enabled: (config: AvrConfig) => boolean;
  create: () => uc.Entity | uc.Entity[];
  afterRegister?: (entities: uc.Entity[]) => void;
  disabledMessage?: string;
}

export interface EntityRegistrationCoordinatorDependencies {
  entityRegistrar: EntityRegistrar;
  listeningModeHandler: SelectEntityHandler;
  inputSelectorHandler: SelectEntityHandler;
  tunerPresetsHandler: SelectEntityHandler;
  diracHandler: SelectEntityHandler;
  remoteEntityCommandHandler: remoteEntityCommandHandler;
  sharedCommandHandler: (entity: uc.Entity, command: string, params?: { [key: string]: string | number | boolean }) => Promise<uc.StatusCodes>;
  registerEntity: (entity: uc.Entity, entityId: string) => void;
  logDisabled: (message: string) => void;
  updateEntityAttributes: (entityId: string, attributes: Record<string, unknown>) => void;
}

/** Executes entity registration policy without coupling it to the driver lifecycle. */
export class EntityRegistrationCoordinator {
  constructor(private readonly dependencies: EntityRegistrationCoordinatorDependencies) {}

  register(configs: readonly AvrConfig[], buildEntityId: (config: AvrConfig) => string, createRawSend: (config: AvrConfig) => (command: string) => Promise<void>): void {
    for (const config of configs) {
      const entityId = buildEntityId(config);
      for (const registration of this.buildRegistrations(entityId, config, createRawSend(config))) {
        if (!registration.enabled(config)) {
          if (registration.disabledMessage) this.dependencies.logDisabled(registration.disabledMessage);
          continue;
        }
        const entities = [registration.create()].flat() as uc.Entity[];
        for (const entity of entities) this.dependencies.registerEntity(entity, entityId);
        registration.afterRegister?.(entities);
      }
    }
  }

  registerMediaPlayer(config: AvrConfig, createRawSend: (config: AvrConfig) => (command: string) => Promise<void>): void {
    const entityId = buildEntityId(config.model, config.ip, config.zone);
    const registration = this.buildMediaPlayerRegistration(entityId, config, createRawSend(config));
    const entities = [registration.create()].flat() as uc.Entity[];
    for (const entity of entities) this.dependencies.registerEntity(entity, entityId);
    registration.afterRegister?.(entities);
  }

  private buildRegistrations(entityId: string, config: AvrConfig, rawSend: (command: string) => Promise<void>): EntityRegistration[] {
    const d = this.dependencies;
    return [
      this.buildMediaPlayerRegistration(entityId, config, rawSend),
      {
        enabled: (c) => c.createSensors !== false,
        create: () => d.entityRegistrar.createSensorEntities(entityId),
        disabledMessage: `[${entityId}] Sensor entities disabled by user preference`
      },
      {
        enabled: (c) => c.createRemoteEntity === true,
        create: () => d.entityRegistrar.createRemoteEntity(entityId, d.remoteEntityCommandHandler?.handle.bind(d.remoteEntityCommandHandler) ?? (async () => uc.StatusCodes.Ok)),
        disabledMessage: `[${entityId}] Remote entity disabled by user preference`
      },
      {
        enabled: () => true,
        create: () => d.entityRegistrar.createListeningModeSelectEntity(entityId, d.listeningModeHandler?.handle.bind(d.listeningModeHandler) ?? (async () => uc.StatusCodes.Ok)),
        afterRegister: () => d.updateEntityAttributes(`${entityId}_listening_mode`, { [SelectAttributes.Options]: d.entityRegistrar.getListeningModeOptions(undefined, entityId) })
      },
      {
        enabled: () => true,
        create: () => d.entityRegistrar.createInputSelectorSelectEntity(entityId, d.inputSelectorHandler?.handle.bind(d.inputSelectorHandler) ?? (async () => uc.StatusCodes.Ok)),
        afterRegister: () => d.updateEntityAttributes(`${entityId}_input_selector`, { [SelectAttributes.Options]: d.entityRegistrar.getInputSelectorOptions(entityId) })
      },
      {
        enabled: (c) => c.createTunerPresets !== false,
        create: () => d.entityRegistrar.createTunerPresetsSelectEntity(entityId, d.tunerPresetsHandler?.handle.bind(d.tunerPresetsHandler) ?? (async () => uc.StatusCodes.Ok)),
        disabledMessage: `[${entityId}] Tuner presets select entity disabled by user preference`,
        afterRegister: () => d.updateEntityAttributes(`${entityId}_tuner_presets`, { [SelectAttributes.Options]: d.entityRegistrar.getTunerPresetOptions(entityId) })
      },
      {
        enabled: (c) => c.createDiracSelectEntity !== false,
        create: () => d.entityRegistrar.createDiracSelectEntity(entityId, d.diracHandler?.handle.bind(d.diracHandler) ?? (async () => uc.StatusCodes.Ok)),
        disabledMessage: `[${entityId}] Dirac select entity disabled by user preference`
      }
    ];
  }

  private buildMediaPlayerRegistration(entityId: string, config: AvrConfig, rawSend: (command: string) => Promise<void>): EntityRegistration {
    const d = this.dependencies;
    return {
      enabled: () => true,
      create: () => d.entityRegistrar.createMediaPlayerEntity(entityId, resolveVolumeScale(config.volumeScale), d.sharedCommandHandler, rawSend),
      afterRegister: () => d.updateEntityAttributes(entityId, { [uc.MediaPlayerAttributes.SourceList]: d.entityRegistrar.getInputSelectorOptions(entityId) })
    };
  }
}
