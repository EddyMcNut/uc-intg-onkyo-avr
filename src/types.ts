/*jslint node:true nomen:true*/
"use strict";

import { EiscpDriver, EiscpConfig } from "./eiscp.js";
import { CommandSender as CommandSenderClass } from "./commandSender.js";
import { CommandReceiver as CommandReceiverClass } from "./commandReceiver.js";
import { AvrConfig, OnkyoConfig } from "./configManager.js";

export type EiscpInstance = EiscpDriver;
export type CommandSender = CommandSenderClass;
export type CommandReceiver = CommandReceiverClass;

export interface AvrInstance {
  config: AvrConfig;
  commandSender: CommandSender;
}

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

// Narrow interfaces — ISP: handlers declare only the methods they actually call; concrete classes satisfy these structurally.

/** One-method slice of ConnectionManager used by the select-entity handlers. */
export interface IPhysicalConnectionLookup {
  getPhysicalConnection(physicalAVR: string): PhysicalConnection | undefined;
}

/** One-method slice of the AVR instance map used by the select-entity handlers. */
export interface IAvrInstanceLookup {
  get(entry: string): AvrInstance | undefined;
}

// DIP: subset of CommandReceiver that CommandSender and avrState call. Interface placed here to break circular import.
export interface ICommandReceiver {
  abortTuneInPreload(entityId: string): boolean;
  maybeUpdateImage(entityId: string, force?: boolean): Promise<void>;
}

/** DIP: AvrStateApi interface for per-entity state management. Injected instead of using avrStateManager singleton. */
export interface AvrStateApi {
  // Query methods
  getSource(entityId: string): string;
  getSubSource(entityId: string): string;
  getVolume(entityId: string): number;
  getAudioFormat(entityId: string): string;
  getPowerState(entityId: string): string;
  getPlaybackStatus(entityId: string): string;
  isEntityOn(entityId: string): boolean;
  getEntitiesBySource(source: string): string[];
  getEntitiesBySourceAndSubSource(source: string, subSource: string): string[];
  getEntitiesByPhysicalAvrAndSource(physicalAvrId: string, source: string): string[];

  // State mutation methods
  setAudioFormat(entityId: string, audioFormat: string): boolean;
  setPowerState(entityId: string, powerState: string, driver?: any): boolean;
  setVolume(entityId: string, volume: number): boolean;
  setSource(entityId: string, source: string, eiscpInstance?: any, zone?: string, _driver?: any): boolean;
  setSubSource(entityId: string, subSource: string, eiscpInstance?: any, zone?: string, _driver?: any): boolean;
  setPlaybackStatus(entityId: string, playbackStatus: string, driver?: any): boolean;

  // Utility methods
  clearState(entityId: string): void;
  clearAllState(): void;
  applyMediaPlayerState(entityId: string, driver?: any): void;
  refreshAvrState(entityId: string, eiscpInstance?: any, zone?: string, driver?: any, queueThreshold?: number, commandReceiver?: ICommandReceiver): Promise<void>;
}
