// Force debug logging for ucapi
process.env.DEBUG = "onkyo_avr:*";

import OnkyoDriver from "./onkyo.js";

const driver = new OnkyoDriver();
driver.init();
