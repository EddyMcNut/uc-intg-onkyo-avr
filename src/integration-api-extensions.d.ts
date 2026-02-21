/*
 * Module augmentation to improve typings for the integration API.
 *
 * A few driver calls pass values that are more complex than the original
 * `string|number|boolean` union found in the shipped types (e.g. select
 * entity options arrays).  Without augmentation we are forced to sprinkle
 * `as any` casts whenever we call `updateEntityAttributes` with those
 * structures.  The integration API itself is forgiving at runtime, so we
 * widen the type here to keep the code clean and safely typed moving
 * forward.
 */

import "@unfoldedcircle/integration-api";

declare module "@unfoldedcircle/integration-api" {
  interface IntegrationAPI {
    // widen attribute map so callers can send arrays or other JSON-like
    // values without casting.  `any` could be used but `unknown` encourages
    // local validation if necessary.
    updateEntityAttributes(
      entityId: string,
      attributes: Record<string, unknown>
    ): boolean;
  }
}
