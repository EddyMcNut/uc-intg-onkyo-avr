/*jslint node:true nomen:true*/
"use strict";

import { EiscpDriver } from "./eiscp.js";
import { CommandSender as CommandSenderClass } from "./commandSender.js";
import { CommandReceiver as CommandReceiverClass } from "./commandReceiver.js";
import { AvrConfig } from "./configManager.js";

export type EiscpInstance = EiscpDriver;
export type CommandSender = CommandSenderClass;
export type CommandReceiver = CommandReceiverClass;

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
