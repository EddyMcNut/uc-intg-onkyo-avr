// Generic handler for select-entity commands (Listening Mode, Input Selector).
// Entity suffix, EISCP command, log label, and options callback are parameterised to avoid duplication.

import * as uc from "@unfoldedcircle/integration-api";
import { SelectAttributes, SelectCommands } from "@unfoldedcircle/integration-api";
import { IPhysicalConnectionLookup, IAvrInstanceLookup } from "./types.js";
import { buildPhysicalAvrId } from "./configManager.js";
import { ensureEiscpConnected } from "./utils.js";
import log from "./loggers.js";

export class SelectEntityHandler {
  private readonly integrationName: string;

  constructor(
    private readonly driver: uc.IntegrationAPI,
    private readonly connectionManager: IPhysicalConnectionLookup,
    private readonly avrInstanceManager: IAvrInstanceLookup,
    /** Entity ID suffix to strip when deriving the AVR entry (e.g. "_listening_mode"). */
    private readonly entitySuffix: string,
    /** EISCP command name to send (e.g. "listening-mode"). */
    private readonly eiscpCommand: string,
    /** Human-readable label used in log messages (e.g. "Listening Mode"). */
    private readonly logLabel: string,
    /** Returns the ordered list of valid option strings for the given AVR entry. */
    private readonly getOptions: (avrEntry: string) => string[]
  ) {
    // Derive "listeningModeHandler:" / "inputSelectorHandler:" from the suffix.
    this.integrationName = entitySuffix.slice(1).replace(/_(\w)/g, (_, c: string) => c.toUpperCase()) + "Handler:";
  }

  public async handle(entity: uc.Entity, cmdId: string, params?: { [key: string]: string | number | boolean }): Promise<uc.StatusCodes> {
    log.info("%s [%s] %s command: %s", this.integrationName, entity.id, this.logLabel, cmdId, params);

    const avrEntry = entity.id.replace(this.entitySuffix, "");
    const instance = this.avrInstanceManager.get(avrEntry);

    if (!instance) {
      log.error("%s [%s] No AVR instance found", this.integrationName, entity.id);
      return uc.StatusCodes.NotFound;
    }

    const physicalAVR = buildPhysicalAvrId(instance.config.model, instance.config.ip);
    const physicalConnection = this.connectionManager.getPhysicalConnection(physicalAVR);

    if (!physicalConnection) {
      log.error("%s [%s] No physical connection found", this.integrationName, entity.id);
      return uc.StatusCodes.ServiceUnavailable;
    }

    if (!(await ensureEiscpConnected(physicalConnection.eiscp, { model: instance.config.model, host: instance.config.ip, port: instance.config.port }, entity.id, this.integrationName))) {
      return uc.StatusCodes.Timeout;
    }

    try {
      const options = this.getOptions(avrEntry);
      const currentOption = ((entity.attributes || {})[SelectAttributes.CurrentOption] as string) || "";
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
          const i = options.indexOf(currentOption);
          if (i >= 0 && i < options.length - 1) newOption = options[i + 1];
          else if (params?.cycle === true) newOption = options[0];
          break;
        }
        case SelectCommands.SelectPrevious: {
          const i = options.indexOf(currentOption);
          if (i > 0) newOption = options[i - 1];
          else if (params?.cycle === true) newOption = options[options.length - 1];
          break;
        }
        default:
          log.warn("%s [%s] Unknown command: %s", this.integrationName, entity.id, cmdId);
          return uc.StatusCodes.BadRequest;
      }

      if (!newOption) {
        log.warn("%s [%s] No option selected", this.integrationName, entity.id);
        return uc.StatusCodes.BadRequest;
      }

      log.info("%s [%s] Setting %s to: %s", this.integrationName, entity.id, this.logLabel.toLowerCase(), newOption);
      await physicalConnection.eiscp.command({
        zone: instance.config.zone,
        command: this.eiscpCommand,
        args: newOption
      });

      this.driver.updateEntityAttributes(entity.id, {
        [SelectAttributes.CurrentOption]: newOption
      });

      return uc.StatusCodes.Ok;
    } catch (err) {
      log.error("%s [%s] Failed to set %s:", this.integrationName, entity.id, this.logLabel.toLowerCase(), err);
      return uc.StatusCodes.ServerError;
    }
  }
}
