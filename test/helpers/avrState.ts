// A state manager for tests that need a real AvrStateManager. Vitest gives every test file its own module scope, so
// each test file gets its own instance (the driver creates its own in production).
import { AvrStateManager } from "../../src/avrState.js";

export const avrStateManager = new AvrStateManager();
