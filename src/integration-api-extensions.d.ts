// Module augmentation to widen integration-API typings (e.g. updateEntityAttributes accepts richer values like select options arrays).

import "@unfoldedcircle/integration-api";

declare module "@unfoldedcircle/integration-api" {
  interface IntegrationAPI {
    // widen attribute map so callers can send arrays or other JSON-like values without casting.  `any` could be used but `unknown` encourages local validation if necessary.
    updateEntityAttributes(entityId: string, attributes: Record<string, unknown>): boolean;
  }
}
