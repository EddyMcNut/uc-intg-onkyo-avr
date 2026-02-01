/**
 * Select entity implementation for Unfolded Circle Integration API
 * 
 * This is a custom implementation since the TypeScript integration library
 * doesn't yet support select entities (as of the current version).
 * 
 * Based on the Unfolded Circle Core API spec:
 * https://unfoldedcircle.github.io/core-api/entities/entity_select.html
 * 
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Apache License 2.0, see LICENSE for more details.
 */

import { Entity, EntityName, CommandHandler, StatusCodes } from "@unfoldedcircle/integration-api";

/**
 * Select entity states
 */
export enum SelectStates {
  Unavailable = "UNAVAILABLE",
  Unknown = "UNKNOWN",
  On = "ON"
}

/**
 * Select entity attributes
 */
export enum SelectAttributes {
  State = "state",
  CurrentOption = "current_option",
  Options = "options"
}

/**
 * Select entity commands
 */
export enum SelectCommands {
  SelectOption = "select_option",
  SelectFirst = "select_first",
  SelectLast = "select_last",
  SelectNext = "select_next",
  SelectPrevious = "select_previous"
}

/**
 * Select entity parameters for constructor
 */
export interface SelectParams {
  attributes?: {
    state?: SelectStates;
    current_option?: string;
    options?: string[];
  };
  area?: string;
  cmdHandler?: CommandHandler;
}

/**
 * Select entity class
 * 
 * This entity offers a limited set of selectable options.
 */
export class Select extends Entity {
  /**
   * Constructs a new select entity.
   *
   * @param id The entity identifier. Must be unique inside the integration driver.
   * @param name The human-readable name of the entity.
   * @param params Entity parameters.
   */
  constructor(
    id: string,
    name: EntityName,
    { attributes = {}, area, cmdHandler }: SelectParams = {}
  ) {
    // Convert options array to required format for API
    const apiAttributes: { [key: string]: string | number | boolean | string[] } = {
      [SelectAttributes.State]: attributes.state || SelectStates.On,
      [SelectAttributes.CurrentOption]: attributes.current_option || "",
      [SelectAttributes.Options]: attributes.options || []
    };

    // Use "select" as the entity_type (this is the core API type)
    // Even though the TypeScript library doesn't have it in the enum yet
    super(id, name, "select" as any, {
      features: [], // Select entities have no features
      attributes: apiAttributes,
      area,
      cmdHandler
    });
  }
}
