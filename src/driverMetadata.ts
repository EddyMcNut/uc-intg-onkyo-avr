import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DriverMetadata {
  driverId: string;
  driverVersion: string;
  // Set when driver.json could not be read or parsed; the fields above then hold "unknown".
  error?: unknown;
}

// Reads driver_id and version from driver.json.
// The path is relative to the working directory on purpose: the integration library loads the same file with
// `driver.init("driver.json")`, so this always reads the file the running driver was started with.
// Not cached: it is read once at startup and once per backup, and tests replace the file contents per test.
export function readDriverMetadata(): DriverMetadata {
  try {
    const driverJson = JSON.parse(readFileSync(resolve(process.cwd(), "driver.json"), "utf-8"));
    return { driverId: driverJson.driver_id || "unknown", driverVersion: driverJson.version || "unknown" };
  } catch (error) {
    return { driverId: "unknown", driverVersion: "unknown", error };
  }
}
