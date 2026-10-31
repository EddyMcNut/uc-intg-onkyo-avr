/** Configuration shared by the transport and AVR command workflow layers. */
export interface EiscpConfig {
  host?: string;
  port?: number;
  model?: string;
  reconnect?: boolean;
  reconnectSleep?: number;
  sendDelay?: number;
  receiveDelay?: number;
  netMenuDelay?: number;
  tuneinPresetPosition?: number;
  configuredZones?: string[];
  idInputSources?: import("./configConstants.js").InputSourceSettings;
}
