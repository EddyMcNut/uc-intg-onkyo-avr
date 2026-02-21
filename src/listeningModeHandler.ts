/*
 * Encapsulate listening-mode command handling so the main driver class stays
 * smaller and focused on orchestration.  The logic was previously embedded in
 * `OnkyoDriver.handleListeningModeCmd` and consumed roughly 130 lines.
 */

import * as uc from "@unfoldedcircle/integration-api";
import ConnectionManager from "./connectionManager.js";
import AvrInstanceManager from "./avrInstanceManager.js";
import EntityRegistrar from "./entityRegistrar.js";
import { avrStateManager } from "./avrState.js";
import { buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";
import { SelectAttributes, SelectCommands } from "./selectEntity.js";

const integrationName = "listeningModeHandler:";

export default class ListeningModeHandler {
  constructor(
    private driver: uc.IntegrationAPI,
    private connectionManager: ConnectionManager,
    private avrInstanceManager: AvrInstanceManager,
    private entityRegistrar: EntityRegistrar
  ) {}

  public async handle(
    entity: uc.Entity,
    cmdId: string,
    params?: { [key: string]: string | number | boolean }
  ): Promise<uc.StatusCodes> {
    log.info("%s [%s] Listening Mode command: %s", integrationName, entity.id, cmdId, params);

    // Extract avrEntry from entity ID (format: "model_ip_zone_listening_mode")
    const avrEntry = entity.id.replace("_listening_mode", "");
    const instance = this.avrInstanceManager.getInstance(avrEntry);

    if (!instance) {
      log.error("%s [%s] No AVR instance found", integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

    if (!physicalConnection) {
      log.error("%s [%s] No physical connection found", integrationName, entity.id);
      return uc.StatusCodes.ServiceUnavailable;
    }

    // Ensure connected (same reconnection logic the main driver uses)
    if (!physicalConnection.eiscp.connected) {
      log.info("%s [%s] Command received while disconnected, triggering reconnection...", integrationName, entity.id);
      try {
        await physicalConnection.eiscp.connect({
          model: instance.config.model,
          host: instance.config.ip,
          port: instance.config.port
        });
        await physicalConnection.eiscp.waitForConnect(3000);
        log.info("%s [%s] Reconnected on command", integrationName, entity.id);
      } catch (connectErr) {
        log.warn("%s [%s] Failed to reconnect on command: %s", integrationName, entity.id, connectErr);
      }
    }

    try {
      await physicalConnection.eiscp.waitForConnect();
    } catch (err) {
      log.warn("%s [%s] Could not send command, AVR not connected: %s", integrationName, entity.id, err);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          await physicalConnection.eiscp.waitForConnect();
          break;
        } catch (retryErr) {
          if (attempt === 5) {
            log.warn("%s [%s] Could not connect to AVR after 5 attempts: %s", integrationName, entity.id, retryErr);
            return uc.StatusCodes.Timeout;
          }
        }
      }
    }

    try {
      const audioFormat = avrStateManager.getAudioFormat(avrEntry);
      const options = this.entityRegistrar.getListeningModeOptions(
        audioFormat !== "unknown" ? audioFormat : undefined,
        avrEntry
      );
      const currentAttrs = entity.attributes || {};
      const currentOption = (currentAttrs[SelectAttributes.CurrentOption] as string) || "";

      let newOption: string | undefined;

      switch (cmdId) {
        case SelectCommands.SelectOption:
          newOption = params?.option as string;
          break;
        case SelectCommands.SelectFirst:
          newOption = options[0];
          break;
        case SelectCommands.SelectLast:
          newOption = options[options.length - 1];
          break;
        case SelectCommands.SelectNext: {
          const currentIndex = options.indexOf(currentOption);
          if (currentIndex >= 0 && currentIndex < options.length - 1) {
            newOption = options[currentIndex + 1];
          } else if (params?.cycle === true) {
            newOption = options[0];
          }
          break;
        }
        case SelectCommands.SelectPrevious: {
          const currentIndex = options.indexOf(currentOption);
          if (currentIndex > 0) {
            newOption = options[currentIndex - 1];
          } else if (params?.cycle === true) {
            newOption = options[options.length - 1];
          }
          break;
        }
        default:
          log.warn("%s [%s] Unknown command: %s", integrationName, entity.id, cmdId);
          return uc.StatusCodes.BadRequest;
      }

      if (!newOption) {
        log.warn("%s [%s] No option selected", integrationName, entity.id);
        return uc.StatusCodes.BadRequest;
      }

      log.info("%s [%s] Setting listening mode to: %s", integrationName, entity.id, newOption);
      await physicalConnection.eiscp.command({
        zone: instance.config.zone,
        command: "listening-mode",
        args: newOption
      });

      this.driver.updateEntityAttributes(entity.id, {
        [SelectAttributes.CurrentOption]: newOption
      });

      return uc.StatusCodes.Ok;
    } catch (err) {
      log.error("%s [%s] Failed to set listening mode:", integrationName, entity.id, err);
      return uc.StatusCodes.ServerError;
    }
  }
}
