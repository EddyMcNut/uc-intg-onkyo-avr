import util from "util";

const log = {
  info: (...args: any[]) => console.log("[INFO]", util.format(...args)),
  warn: (...args: any[]) => console.log("[WARN]", util.format(...args)),
  error: (...args: any[]) => console.log("[ERROR]", util.format(...args)),
  debug: (...args: any[]) => console.log("[DEBUG]", util.format(...args)),
};

export default log;