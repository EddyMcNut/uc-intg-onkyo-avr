/**
 * Central log functions.
 *
 * Use [debug](https://www.npmjs.com/package/debug) module for logging.
 *
 * @copyright (c) 2024 by Unfolded Circle ApS.
 * @license Mozilla Public License Version 2.0, see LICENSE for more details.
 */

import debugModule from "debug";

const log = {
  msgTrace: debugModule("onkyo-avr:msg"),
  debug: debugModule("onkyo-avr:debug"),
  info: debugModule("onkyo-avr:info"),
  warn: debugModule("onkyo-avr:warn"),
  error: debugModule("onkyo-avr:error")
};

export default log;
