import util from "util";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = "warn";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

const log = {
  debug: (...args: any[]) => {
    if (LEVEL_RANK["debug"] >= LEVEL_RANK[currentLevel]) console.log("[DEBUG]", util.format(...args));
  },
  info: (...args: any[]) => {
    if (LEVEL_RANK["info"] >= LEVEL_RANK[currentLevel]) console.log("[INFO]", util.format(...args));
  },
  warn: (...args: any[]) => {
    if (LEVEL_RANK["warn"] >= LEVEL_RANK[currentLevel]) console.log("[WARN]", util.format(...args));
  },
  error: (...args: any[]) => {
    if (LEVEL_RANK["error"] >= LEVEL_RANK[currentLevel]) console.log("[ERROR]", util.format(...args));
  }
};

export default log;
