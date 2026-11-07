import util from "util";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = "warn";

function formatLogMessage(args: unknown[]): string {
  // Multiline payloads (notably NRI XML) are prefixed by the host logger once
  // per line. Do not emit empty payload lines as separate, useless log records.
  return util
    .format(...args)
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function setLogLevel(level: LogLevel): void {
  const previous = currentLevel;
  currentLevel = level;
  if (previous !== level) {
    console.log("[WARN]", `loggers: log level changed from '${previous}' to '${level}'`);
  }
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

const log = {
  debug: (...args: unknown[]) => {
    if (LEVEL_RANK["debug"] >= LEVEL_RANK[currentLevel]) console.log("[DEBUG]", formatLogMessage(args));
  },
  info: (...args: unknown[]) => {
    if (LEVEL_RANK["info"] >= LEVEL_RANK[currentLevel]) console.log("[INFO]", formatLogMessage(args));
  },
  warn: (...args: unknown[]) => {
    if (LEVEL_RANK["warn"] >= LEVEL_RANK[currentLevel]) console.log("[WARN]", formatLogMessage(args));
  },
  error: (...args: unknown[]) => {
    console.log("[ERROR]", formatLogMessage(args));
  }
};

export default log;
