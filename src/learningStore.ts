// LearningStore: manages per-physical-AVR learned capability names (LMD, SLI).
// Seeded from eiscp-mappings on install, updated at runtime by CapabilityLearner, persisted via ConfigManager.
"use strict";

import { eiscpMappings } from "./eiscp-mappings.js";
import { ConfigManager, OnkyoConfig, LearningCatalog, LearnedEntry, buildPhysicalAvrId } from "./configManager.js";
import log from "./loggers.js";

const integrationName = "learningStore:";

// Defensive accessors: partial mocks of ConfigManager (e.g. in driver tests) may only expose `load`.
// Call statics directly (not via a detached reference) to preserve `this` binding.
function getConfig(): OnkyoConfig {
  const cm = ConfigManager as unknown as { get?: () => OnkyoConfig };
  return typeof cm.get === "function" ? cm.get() : {};
}

function saveConfig(newConfig: Partial<OnkyoConfig>): void {
  const cm = ConfigManager as unknown as { save?: (cfg: Partial<OnkyoConfig>) => void };
  if (typeof cm.save === "function") cm.save(newConfig);
}

export type LearningKind = "LMD" | "SLI";

const NAVIGATION_CODES = new Set(["UP", "DOWN", "QSTN", "MOVIE", "MUSIC", "GAME"]);

function invertMappings(commands: Record<string, { value: string }>): Record<string, string[]> {
  const byCode: Record<string, string[]> = {};
  for (const [name, entry] of Object.entries(commands)) {
    const value = entry?.value;
    if (typeof value !== "string") continue;
    if (NAVIGATION_CODES.has(value)) continue;
    if (!byCode[value]) byCode[value] = [];
    byCode[value].push(name);
  }
  return byCode;
}

function buildSeedCatalog(kind: LearningKind): Record<string, LearnedEntry> {
  const raw = eiscpMappings.value_mappings[kind];
  if (!raw) return {};
  const grouped = invertMappings(raw as Record<string, { value: string }>);
  const catalog: Record<string, LearnedEntry> = {};
  for (const [code, names] of Object.entries(grouped)) {
    catalog[code] = { names, updated: false };
  }
  return catalog;
}

export interface OptionItem {
  canonical: string;
  label: string;
}

function isEnabled(): boolean {
  return getConfig().learningEnabled !== false;
}

function getCatalog(physicalAvrId: string): LearningCatalog | undefined {
  if (!isEnabled()) return undefined;
  const cfg = getConfig();
  const catalog = cfg.learning?.[physicalAvrId];
  if (catalog !== undefined) return catalog;

  const lrKeys = cfg.learning ? Object.keys(cfg.learning).join(", ") : "(absent)";
  log.debug("%s getCatalog(%s): MISS -> learning=%s, pid=%s, learningEnabled=%s", integrationName, physicalAvrId, typeof cfg.learning, lrKeys, cfg.learningEnabled);
  return undefined;
}

function ensureSeed(physicalAvrId: string): void {
  if (!isEnabled()) return;
  const cfg = getConfig();
  if (cfg.learning?.[physicalAvrId]) return;

  const catalog: LearningCatalog = {
    LMD: buildSeedCatalog("LMD"),
    SLI: buildSeedCatalog("SLI")
  };

  saveConfig({ learning: { ...cfg.learning, [physicalAvrId]: catalog } });
  const lmdCount = Object.keys(catalog.LMD).length;
  const sliCount = Object.keys(catalog.SLI).length;
  log.info("%s Seeded learning catalog for %s (LMD: %d, SLI: %d)", integrationName, physicalAvrId, lmdCount, sliCount);
}

function getEntry(physicalAvrId: string, kind: LearningKind, code: string): LearnedEntry | undefined {
  return getCatalog(physicalAvrId)?.[kind]?.[code];
}

function isUpdated(physicalAvrId: string, kind: LearningKind, code: string): boolean {
  return getEntry(physicalAvrId, kind, code)?.updated ?? false;
}

/**
 * Replace the learned code's aliases inside the user-configured options lists (avrs[].listeningModeOptions
 * for LMD, avrs[].inputSelectorOptions for SLI) with the newly learned display name, so the configured
 * Select Entity options reflect the real front-panel-name. Only arrays are touched; "all"/"none"/null are left alone.
 */
function applyLearnedConfigLabel(cfg: OnkyoConfig, physicalAvrId: string, kind: LearningKind, entry: LearnedEntry): void {
  if (!entry.displayName || !Array.isArray(cfg.avrs)) return;
  const field: "listeningModeOptions" | "inputSelectorOptions" = kind === "LMD" ? "listeningModeOptions" : "inputSelectorOptions";
  const aliases = new Set(entry.names);

  for (const avr of cfg.avrs) {
    if (buildPhysicalAvrId(avr.model, avr.ip) !== physicalAvrId) continue;
    const options = avr[field];
    if (!Array.isArray(options)) continue;

    const replaced = options.map((opt) => (aliases.has(opt) ? (entry.displayName as string) : opt));
    const deduped: string[] = [];
    for (const opt of replaced) {
      if (!deduped.includes(opt)) deduped.push(opt);
    }
    const changed = deduped.length !== options.length || deduped.some((v, i) => v !== options[i]);
    if (changed) {
      avr[field] = deduped;
      log.info("%s [%s] updated configured %s: %s", integrationName, physicalAvrId, field, deduped.join("; "));
    }
  }
}

function commitLearned(physicalAvrId: string, kind: LearningKind, code: string, displayName: string): void {
  if (!isEnabled()) return;
  const cfg = getConfig();
  const catalog = cfg.learning?.[physicalAvrId]?.[kind];
  const entry = catalog?.[code];
  if (!entry || entry.updated) return;

  entry.displayName = displayName;
  entry.updated = true;
  applyLearnedConfigLabel(cfg, physicalAvrId, kind, entry);
  saveConfig({ learning: cfg.learning, avrs: cfg.avrs });
  log.info("%s [%s] %s %s learned: %s", integrationName, physicalAvrId, kind, code, displayName);
}

function getDisplayLabel(physicalAvrId: string, kind: LearningKind, code: string, fallbackLabel: string): string {
  const entry = getEntry(physicalAvrId, kind, code);
  return entry?.updated && entry.displayName ? entry.displayName : fallbackLabel;
}

function resolveSendName(physicalAvrId: string, kind: LearningKind, optionLabel: string): string {
  const catalog = getCatalog(physicalAvrId)?.[kind];
  if (!catalog) return optionLabel;

  const lower = optionLabel.toLowerCase();
  for (const entry of Object.values(catalog)) {
    if (entry.updated && entry.displayName && entry.displayName.toLowerCase() === lower) {
      return entry.names[0];
    }
  }
  for (const entry of Object.values(catalog)) {
    if (entry.names.some((n) => n.toLowerCase() === lower)) {
      return entry.names[0];
    }
  }
  return optionLabel;
}

function listOptions(physicalAvrId: string, kind: LearningKind, compatibleCanonical?: string[] | null): OptionItem[] | null {
  const catalog = getCatalog(physicalAvrId)?.[kind];
  if (!catalog) return null;

  const items: OptionItem[] = [];

  const keepEntry = (names: string[]): boolean => {
    if (!compatibleCanonical || compatibleCanonical.length === 0) return true;
    const compatSet = new Set(compatibleCanonical);
    return names.some((n) => compatSet.has(n));
  };

  for (const entry of Object.values(catalog)) {
    if (!keepEntry(entry.names)) continue;

    if (entry.updated && entry.displayName) {
      items.push({ canonical: entry.names[0], label: entry.displayName });
    } else {
      for (const name of entry.names) {
        items.push({ canonical: name, label: name });
      }
    }
  }

  items.sort((a, b) => a.label.localeCompare(b.label));
  return items;
}

function listLabels(physicalAvrId: string, kind: LearningKind, compatibleCanonical?: string[] | null): string[] | null {
  return listOptions(physicalAvrId, kind, compatibleCanonical)?.map((i) => i.label) ?? null;
}

export function extractIscpCode(iscpCommand: string): string {
  return iscpCommand.slice(3);
}

export const learningStore = {
  getCatalog,
  isEnabled,
  ensureSeed,
  getEntry,
  isUpdated,
  commitLearned,
  getDisplayLabel,
  resolveSendName,
  listOptions,
  listLabels
};
export default learningStore;
