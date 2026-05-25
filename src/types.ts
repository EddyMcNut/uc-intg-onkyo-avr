/*jslint node:true nomen:true*/
"use strict";

import { EiscpDriver, EiscpConfig } from "./eiscp.js";
import { CommandSender as CommandSenderClass } from "./commandSender.js";
import { CommandReceiver as CommandReceiverClass } from "./commandReceiver.js";
import { AvrConfig, OnkyoConfig } from "./configManager.js";

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
export type CreateCommandSenderFn = (avrSpecificConfig: OnkyoConfig, eiscp: EiscpInstance, commandReceiver: CommandReceiver) => CommandSender;
export type QueryAvrStateFn = (avrEntry: string, eiscp: EiscpInstance, context: string) => Promise<void>;
export type QueryAllZonesStateFn = (physicalAvr: string, eiscp: EiscpInstance, context: string) => Promise<void>;

/** Factory that creates a new EiscpDriver instance — inject this instead of calling `new EiscpDriver()` directly. */
export type EiscpDriverFactory = (config: EiscpConfig) => EiscpInstance;

/**
 * Narrow interfaces — ISP: handlers declare only the methods they actually call,
 * not the full concrete class. Each concrete class satisfies these structurally.
 */

/** One-method slice of ConnectionManager used by the select-entity handlers. */
export interface IPhysicalConnectionLookup {
  getPhysicalConnection(physicalAVR: string): PhysicalConnection | undefined;
}

/**
 * One-method slice of AvrInstanceManager used by the select-entity handlers.
 * Uses a structural inline type to avoid a circular import with avrInstanceManager.ts.
 */
export interface IAvrInstanceLookup {
  getInstance(entry: string): { config: AvrConfig } | undefined;
}

/** One-method slice of EntityRegistrar used by ListeningModeHandler. */
export interface IListeningModeOptionsProvider {
  getListeningModeOptions(audioFormat?: string, avrEntry?: string): string[];
}

/** One-method slice of EntityRegistrar used by InputSelectorHandler. */
export interface IInputSelectorOptionsProvider {
  getInputSelectorOptions(avrEntry?: string): string[];
}

/**
 * DIP: the subset of CommandReceiver that CommandSender and avrState actually call.
 * Placing the interface here breaks the would-be circular import between
 * commandSender.ts and commandReceiver.ts.
 */
export interface ICommandReceiver {
  abortTuneInPreload(entityId: string): boolean;
  maybeUpdateImage(entityId: string, force?: boolean): Promise<void>;
}
