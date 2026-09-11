// CapabilityLearner: watches LMD/SLI updates and, for not-yet-learned codes, re-sends the same ISCP
// command to make the AVR show the name on the front panel, then captures the resulting FLD display text
// and commits it to the learning store once verified plausible (basic relation check).
"use strict";

import { EiscpDriver } from "./eiscp.js";
import type { LearningKind } from "./learningStore.js";
import { learningStore, extractIscpCode } from "./learningStore.js";
import { LEARNING_COOLDOWN_MS, LEARNING_FLD_WINDOW_MS, FLD_DISPLAY_MAX_LENGTH } from "./constants.js";
import log from "./loggers.js";

const integrationName = "capabilityLearner:";

// SLI codes whose FLD shows now-playing/station content instead of the input name
// (e.g. a DAB station name for "DAB"). Learning these would mislabel the source selector.
const SLI_CONTENT_CODES = new Set([
  "24", // fm            -> RDS / station info
  "25", // am
  "26", // tuner
  "27", // musicserver (p4s, dlna) -> playing content
  "28", // internetradio
  "29", // usb1
  "2A", // usb2
  "2B", // net / network
  "2C", // usbt
  "2E", // bluetooth
  "31", // xm
  "32", // sirius
  "33", // dab -> station name
  "40" // universalport / upnp
]);

interface PendingCapture {
  kind: LearningKind;
  code: string;
  startedAt: number;
  // Last seen FLD text for this pending capture; a capture only commits when the same text is seen twice.
  sampleText?: string;
}

/** Basic plausibility check for a captured FLD text. Returns true when the text looks like a real display name. */
export function isPlausibleFldText(text: string): boolean {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > FLD_DISPLAY_MAX_LENGTH) return false;
  if (!/[A-Za-z0-9]/.test(trimmed)) return false;
  return true;
}

export class CapabilityLearner {
  private readonly eiscp: EiscpDriver;
  private readonly physicalAvrId: string;
  private readonly pendingCaptures: Map<string, PendingCapture> = new Map();
  private readonly lastAttempt = new Map<string, number>();
  private readonly dataListener: (update: any) => Promise<void>;

  constructor(eiscp: EiscpDriver, physicalAvrId: string) {
    this.eiscp = eiscp;
    this.physicalAvrId = physicalAvrId;
    this.dataListener = (update) => this.handleData(update);
  }

  attach(): void {
    this.eiscp.on("data", this.dataListener);
  }

  private key(kind: LearningKind, code: string): string {
    return `${kind}:${code}`;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, pending] of this.pendingCaptures) {
      if (now - pending.startedAt > LEARNING_FLD_WINDOW_MS) {
        this.pendingCaptures.delete(key);
      }
    }
  }

  private async handleData(update: any): Promise<void> {
    if (!update || typeof update !== "object") return;
    const zone = update.zone ?? "main";
    if (zone !== "main") return;

    // When learning is disabled, don't trigger any FLD captures even though the listener stays attached.
    if (!learningStore.isEnabled()) {
      log.debug("%s [%s] learning disabled, skipping %s", integrationName, this.physicalAvrId, update.command);
      return;
    }

    const command = update.command;

    if (command === "FLD") {
      this.handleFld(String(update.argument ?? ""));
      return;
    }

    if (command !== "listening-mode" && command !== "input-selector") return;

    const kind: LearningKind = command === "listening-mode" ? "LMD" : "SLI";
    if (typeof update.iscpCommand !== "string" || update.iscpCommand.length < 4) return;
    const code = extractIscpCode(update.iscpCommand);

    // Network service codes (NSS01-NSS28) show content-dependent FLD text (e.g. "BBC Radio 4"),
    // not source names ("TuneIn"). Skip them so the canonical names remain as labels.
    if (code.startsWith("NSS")) return;

    // Tuner/radio/streaming sources display now-playing content on the front panel, not the input
    // name. Learning their FLD would corrupt the source label with station/album text.
    if (kind === "SLI" && SLI_CONTENT_CODES.has(code)) return;

    const entry = learningStore.getEntry(this.physicalAvrId, kind, code);
    if (!entry) {
      log.debug("%s [%s] no catalog entry for %s %s", integrationName, this.physicalAvrId, kind, code);
      return;
    }
    if (entry.updated) {
      log.debug("%s [%s] %s %s already learned (%s)", integrationName, this.physicalAvrId, kind, code, entry.displayName ?? "");
      return;
    }

    this.pruneExpired();

    const now = Date.now();
    const lastTry = this.lastAttempt.get(this.key(kind, code)) ?? 0;
    if (now - lastTry < LEARNING_COOLDOWN_MS) {
      log.debug("%s [%s] %s %s in cooldown (last try %dms ago)", integrationName, this.physicalAvrId, kind, code, now - lastTry);
      return;
    }

    // Re-send the same ISCP command to force the AVR to display the name (triggers a fresh FLD).
    this.lastAttempt.set(this.key(kind, code), now);
    this.pendingCaptures.set(this.key(kind, code), { kind, code, startedAt: now });

    log.info("%s [%s] triggering FLD capture for %s %s via %s", integrationName, this.physicalAvrId, kind, code, update.iscpCommand);
    this.eiscp.raw(update.iscpCommand).catch((err: unknown) => {
      log.warn("%s [%s] re-send failed for %s: %s", integrationName, this.physicalAvrId, update.iscpCommand, err instanceof Error ? err.message : String(err));
    });
  }

  private handleFld(text: string): void {
    if (!isPlausibleFldText(text)) return;

    this.pruneExpired();
    if (this.pendingCaptures.size === 0) return;
    const now = Date.now();

    // The front panel shows a single line, so an FLD echo can only belong to the most recent
    // trigger. Older pending captures are never fed stale display text.
    let targetKey: string | undefined;
    let target: PendingCapture | undefined;
    for (const [key, pending] of this.pendingCaptures) {
      if (now - pending.startedAt > LEARNING_FLD_WINDOW_MS) continue;
      if (!target || pending.startedAt > target.startedAt) {
        target = pending;
        targetKey = key;
      }
    }
    if (!target) return;

    const fldText = text.trim();

    // Basic relation check: the text must not simply echo the code.
    if (fldText.toLowerCase() === target.code.toLowerCase()) return;

    // Confirm the display is stable before committing: a one-off sample may be a transitional
    // fragment (e.g. a name mid-scroll), so only a repeated identical sample is trusted.
    if (target.sampleText !== fldText) {
      target.sampleText = fldText;
      return;
    }

    log.info("%s [%s] FLD capture for %s %s: '%s'", integrationName, this.physicalAvrId, target.kind, target.code, fldText);
    learningStore.commitLearned(this.physicalAvrId, target.kind, target.code, fldText);
    this.pendingCaptures.delete(targetKey!);
  }

  /** Cleanup timers/listeners for reconnect/teardown. */
  detach(): void {
    this.eiscp.off("data", this.dataListener);
  }
}

// Weak registry so we attach exactly one learner per eiscp instance.
const learnersByInstance = new WeakMap<EiscpDriver, CapabilityLearner>();

export function learnerFor(eiscp: EiscpDriver, physicalAvrId: string): CapabilityLearner {
  let learner = learnersByInstance.get(eiscp);
  if (!learner) {
    learner = new CapabilityLearner(eiscp, physicalAvrId);
    learnersByInstance.set(eiscp, learner);
  }
  return learner;
}

export default CapabilityLearner;
