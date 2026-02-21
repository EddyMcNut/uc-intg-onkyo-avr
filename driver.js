import OnkyoDriver from "./dist/src/driver.js";

// side‑effect: start up when executed by `node driver.js`
const driver = new OnkyoDriver();
driver.init();

// allow consumers to import the class
export default OnkyoDriver;
