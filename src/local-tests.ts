/*jslint node:true nomen:true*/
"use strict";
import { exit } from "process";
import util from "util";
import eiscp from "./eiscp.js";

const avr: { model: string; host: string } = await eiscp.connect();
console.log(util.format("\******* CONNECTED to: %s (%s)\n", avr.model, avr.host));

eiscp.on("dimmer-level", function (arg: any) {
  console.log(util.format("\SOMETHING changed to: %s\n", arg));

  eiscp.close();

  exit(0); // Exit the process
});

eiscp.on("connect", function () {
  // eiscp.command("volume query");
  // eiscp.command("system-power query");
  // eiscp.command("preset query");
  eiscp.command("dimmer-level query");
});
