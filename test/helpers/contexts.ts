// The AvrContextRegistry tests pass to the components and store functions they exercise. Vitest runs every test file
// in its own module scope, so each test file gets its own registry.
import { AvrContextRegistry } from "../../src/avrContext.js";

export const testAvrContexts = new AvrContextRegistry();
