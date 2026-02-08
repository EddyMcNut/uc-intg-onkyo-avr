/*jslint node:true nomen:true*/
"use strict";

import { EiscpDriver } from "./eiscp.js";
import { OnkyoCommandSender } from "./onkyoCommandSender.js";
import { OnkyoCommandReceiver } from "./onkyoCommandReceiver.js";
import { AvrConfig } from "./configManager.js";

export type EiscpInstance = EiscpDriver;
export type CommandSender = OnkyoCommandSender;
export type CommandReceiver = OnkyoCommandReceiver;

export type PhysicalConnection = {
  eiscp: EiscpInstance;
  commandReceiver: CommandReceiver;
  avrConfig?: AvrConfig;
};

export type CreateCommandReceiverFn = (eiscp: EiscpInstance) => CommandReceiver;
export type CreateCommandReceiverFactory = (avrConfig: AvrConfig) => CreateCommandReceiverFn;
export type CreateCommandSenderFn = (avrSpecificConfig: any, eiscp: EiscpInstance) => CommandSender;
export type QueryAvrStateFn = (avrEntry: string, eiscp: EiscpInstance, context: string) => Promise<void>;
export type QueryAllZonesStateFn = (physicalAvr: string, eiscp: EiscpInstance, context: string) => Promise<void>;
