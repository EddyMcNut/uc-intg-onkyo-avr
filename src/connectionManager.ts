/*jslint node:true nomen:true*/
"use strict";
import log from "./loggers.js";
import { ReconnectionManager } from "./reconnectionManager.js";
import { AvrConfig } from "./configManager.js";
import EiscpDriver from "./eiscp.js";
import { PhysicalConnection, CreateCommandReceiverFn, QueryAllZonesStateFn } from "./types.js";

export default class ConnectionManager {
  private reconnectionManager: ReconnectionManager;
  private queryAllZonesState: QueryAllZonesStateFn;
  private physicalConnections: Map<string, PhysicalConnection> = new Map();
  private getDriverVersion?: () => string;

  constructor(reconnectionManager: ReconnectionManager, queryAllZonesState: (physicalAvr: string, eiscp: EiscpDriver, context: string) => Promise<void>, getDriverVersion?: () => string) {
    this.reconnectionManager = reconnectionManager;
    this.queryAllZonesState = queryAllZonesState;
    this.getDriverVersion = getDriverVersion;
  }

  getPhysicalConnection(physicalAVR: string): PhysicalConnection | undefined {
    return this.physicalConnections.get(physicalAVR);
  }

  setPhysicalConnection(physicalAVR: string, connection: PhysicalConnection): void {
    this.physicalConnections.set(physicalAVR, connection);
  }

  async createAndConnect(physicalAVR: string, avrConfig: AvrConfig, createCommandReceiver: CreateCommandReceiverFn): Promise<PhysicalConnection> {
    log.info(`driver: [${physicalAVR}] Connecting to AVR at ${avrConfig.ip}:${avrConfig.port}`);

    const eiscpInstance = new EiscpDriver({
      host: avrConfig.ip,
      port: avrConfig.port,
      model: avrConfig.model,
      send_delay: avrConfig.queueThreshold || 100,
      netMenuDelay: avrConfig.netMenuDelay
    });

    const commandReceiver = createCommandReceiver(eiscpInstance);
    commandReceiver.setupEiscpListener();

    const physicalConnection: PhysicalConnection = { eiscp: eiscpInstance, commandReceiver, avrConfig };
    this.setPhysicalConnection(physicalAVR, physicalConnection);

    eiscpInstance.on("error", (err: Error) => {
      log.error(`driver: [${physicalAVR}] EiscpDriver error:`, err);
    });

    eiscpInstance.on("close", () => {
      log.warn(`driver: [${physicalAVR}] Connection to AVR lost`);
    });

    try {
      const result = await eiscpInstance.connect({ model: avrConfig.model, host: avrConfig.ip, port: avrConfig.port });
      if (!result || !result.model) {
        throw new Error("AVR connection failed or returned null");
      }

      await eiscpInstance.waitForConnect(3000);
      log.info(`driver: [${physicalAVR}] Connected to AVR`);
      return physicalConnection;
    } catch (err) {
      log.error(`driver: [${physicalAVR}] Failed to connect to AVR:`, err);
      log.info(`driver: [${physicalAVR}] Zone instances will be created but unavailable until connection succeeds`);
      // schedule reconnect
      this.scheduleReconnect(physicalAVR, physicalConnection, avrConfig);
      return physicalConnection;
    }
  }

  scheduleReconnect(physicalAVR: string, physicalConnection: PhysicalConnection, avrConfig: AvrConfig): void {
    this.reconnectionManager.scheduleReconnection(
      physicalAVR,
      physicalConnection.eiscp,
      { model: avrConfig.model, host: avrConfig.ip, port: avrConfig.port },
      () => false, // keep retrying until success; calling code will cancel if appropriate
      async (avr) => this.queryAllZonesState(avr, physicalConnection.eiscp, "after scheduled reconnection")
    );
  }

  async attemptReconnection(physicalAVR: string): Promise<{ success: boolean }> {
    const conn = this.physicalConnections.get(physicalAVR);
    if (!conn) {
      return { success: false };
    }
    const avr = conn.avrConfig;
    if (!avr) return { success: false };
    try {
      const result = await this.reconnectionManager.attemptReconnection(physicalAVR, conn.eiscp, { model: avr.model, host: avr.ip, port: avr.port }, "Reconnection");
      if (result.success) {
        this.reconnectionManager.cancelScheduledReconnection(physicalAVR);
      }
      return result;
    } catch (err) {
      log.warn(`driver: [${physicalAVR}] Reconnection attempt failed:`, err);
      return { success: false };
    }
  }

  cancelAllScheduledReconnections(): void {
    this.reconnectionManager.cancelAllScheduledReconnections();
  }

  cancelScheduledReconnection(physicalAVR: string): void {
    this.reconnectionManager.cancelScheduledReconnection(physicalAVR);
  }

  disconnectAll(): void {
    for (const [physicalAVR, connection] of this.physicalConnections) {
      try {
        if (connection.eiscp.connected) {
          log.info(`driver: [${physicalAVR}] Disconnecting AVR`);
          connection.eiscp.disconnect();
        }
      } catch (err) {
        log.warn(`driver: [${physicalAVR}] Error disconnecting AVR:`, err);
      }
    }
  }

  clearAllConnections(): void {
    this.disconnectAll();
    this.physicalConnections.clear();
  }
}
