import EiscpDriver from "./eiscp.js";
import { buildEntityId } from "./configManager.js";
import { collectAvrInputSources } from "./inputSourceResolver.js";
import type { AvrInput } from "./inputSourceStore.js";
import { getAvrInfo } from "./avrInfoStore.js";
import log from "./loggers.js";

export type SetupEiscpDriverFactory = (config: { host?: string; port?: number; model?: string }) => EiscpDriver;

export interface InputSourceProbeResult {
  inputs: AvrInput[];
  available: boolean;
  model?: string;
  ip?: string;
  port?: number;
}

/** Performs setup-only NRI probing without coupling setup flow to the main driver. */
export class SetupInputSourceProbe {
  constructor(private readonly createDriver: SetupEiscpDriverFactory = (config) => new EiscpDriver(config)) {}

  async query(model: string, ip: string, port: number): Promise<InputSourceProbeResult> {
    let resolvedModel = model;
    let resolvedIp = ip;
    let resolvedPort = port;
    const probe = this.createDriver({ host: resolvedIp, port: resolvedPort, model: resolvedModel });
    try {
      if (!resolvedModel && !resolvedIp) {
        const found = await probe.discover({ address: "255.255.255.255", timeout: 3, devices: 1 });
        if (!found?.length) return { inputs: [], available: false };
        resolvedModel = found[0].model;
        resolvedIp = found[0].host;
        resolvedPort = Number(found[0].port) || 60128;
      }
      if (!resolvedIp) return { inputs: [], available: false };
      const connected = await probe.connect({ model: resolvedModel, host: resolvedIp, port: resolvedPort });
      if (!connected) return { inputs: [], available: false, model: resolvedModel, ip: resolvedIp, port: resolvedPort };
      await probe.waitForConnect(5000);
      const entityId = buildEntityId(resolvedModel, resolvedIp, "main");
      const response = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        probe.on("data", (data: { command?: string }) => {
          if (data.command === "avr-info") {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      await probe.command({ zone: "main", command: "avr-info", args: "query" });
      await response;
      const info = getAvrInfo(entityId);
      const inputs = collectAvrInputSources(
        info?.selectors ?? [],
        (info?.netServices ?? []).filter((service) => service.enabled).map((service) => ({ id: service.id, name: service.name }))
      );
      return { inputs, available: inputs.length > 0, model: resolvedModel, ip: resolvedIp, port: resolvedPort };
    } catch (err) {
      log.debug("setupInputSourceProbe: AVR input discovery failed: %o", err);
      return { inputs: [], available: false, model: resolvedModel, ip: resolvedIp, port: resolvedPort };
    } finally {
      probe.disconnect();
    }
  }
}
