// In-memory config stores for tests. They implement the ConfigStore methods components use, without touching the
// file system; each method is a vi.fn so tests can assert on reads and writes.
import { vi, type Mock } from "vitest";
import type { AvrConfig, AvrZone, ConfigStore, IntegrationConfig } from "../../src/configManager.js";

export type MemoryConfigStore = {
  [K in "get" | "load" | "save" | "addAvr" | "patchAvr" | "clear"]: Mock<ConfigStore[K]>;
} & { readonly path: string };

export function memoryConfigStore(initial: IntegrationConfig = {}): MemoryConfigStore {
  let config: IntegrationConfig = initial;
  return {
    path: "memory://config.json",
    get: vi.fn(() => config),
    load: vi.fn(() => config),
    save: vi.fn((patch: Partial<IntegrationConfig>) => {
      config = { ...config, ...patch };
    }),
    addAvr: vi.fn((avr: Partial<AvrConfig>) => {
      const avrs = (config.avrs ?? []).filter((existing) => !(existing.ip === avr.ip && existing.zone === avr.zone));
      config = { ...config, avrs: [...avrs, avr as AvrConfig] };
    }),
    patchAvr: vi.fn((ip: string, zone: AvrZone, patch: Partial<AvrConfig>) => {
      const index = config.avrs?.findIndex((avr) => avr.ip === ip && avr.zone === zone) ?? -1;
      if (index < 0 || !config.avrs) return false;
      config.avrs[index] = { ...config.avrs[index], ...patch };
      return true;
    }),
    clear: vi.fn(() => {
      config = {};
    })
  };
}

// Shared store for tests that do not care about settings (like testAvrContexts for the registry).
export const testConfigStore = memoryConfigStore();
