/*jslint node:true nomen:true*/

import net from "net";
import dgram from "dgram";
import util from "util";
import async from "async";
import events from "events";
import eiscp_commands = require("./eiscp-commands.json");

("use strict");
var self: any,
  eiscp: any,
  send_queue: any,
  COMMANDS = eiscp_commands.commands,
  COMMAND_MAPPINGS = eiscp_commands.command_mappings,
  VALUE_MAPPINGS: {
    [prefix: string]: {
      [arg: string]: any;
      INTRANGES?: any;
    };
  } = eiscp_commands.value_mappings,
  config = {
    host: "",
    port: 60128,
    model: "",
    reconnect: true,
    reconnect_sleep: 5,
    modelsets: [] as string[],
    send_delay: 500,
    verify_commands: true
  };

const integrationName = "Onkyo-Integration: ";

self = new events.EventEmitter();
export default self;

self.is_connected = false;
self.connected = self.is_connected;

export { self, eiscp, send_queue, config, COMMANDS, COMMAND_MAPPINGS, VALUE_MAPPINGS };

function eiscp_packet(data: any) {
  // Wraps command or iscp message in eISCP packet for communicating over Ethernet, type is device type where 1 is receiver and x is for the discovery broadcast, Returns complete eISCP packet as a buffer ready to be sent
  var iscp_msg, header;

  // Add ISCP header if not already present
  if (data.charAt(0) !== "!") {
    data = "!1" + data;
  }
  // ISCP message
  iscp_msg = Buffer.from(data + "\x0D\x0a");

  // eISCP header
  header = Buffer.from([
    73,
    83,
    67,
    80, // magic
    0,
    0,
    0,
    16, // header size
    0,
    0,
    0,
    0, // data size
    1, // version
    0,
    0,
    0 // reserved
  ]);
  // write data size to eISCP header
  header.writeUInt32BE(iscp_msg.length, 8);

  return Buffer.concat([header, iscp_msg]);
}

function eiscp_packet_extract(packet: any) {
  return packet.toString("ascii", 18, packet.length - 2);
}

function iscp_to_command(iscp_message: any) {
  // Transform a low-level ISCP message to a high-level command
  var command = iscp_message.slice(0, 3),
    value = iscp_message.slice(3),
    result: { command: string; argument: string | number | string[]; zone: string } = {
      command: "undefined",
      argument: "undefined",
      zone: "main"
    };
  value = String(value).replace(/[\x00-\x1F]/g, ""); // remove weird characters like \x1A
  console.log("%s RAW: %s %s", integrationName, command, value);

  if (command === "NTM") {
    result.command = "NTM";
    result.argument = value;
    return result;
  }

  // Special handling for FLD (metadata) responses
  if (command === "FLD" && value.length >= 2) {
    const fldTag = value.slice(0, 2).toUpperCase();
    const hexContent = value.slice(2).replace(/[^0-9A-Fa-f]/g, "");
    // FLD tag mapping (expand as needed)
    const fldMap: Record<string, { command: string; name: string }> = {
      "1A": { command: "NAT", name: "net-usb-artist-name-info" }, // Artist
      "1B": { command: "NAL", name: "net-usb-album-name-info" }, // Album
      "1C": { command: "NTI", name: "net-usb-title-name" } // Title
      // Add more if needed
    };
    const mapped = fldMap[fldTag];
    if (mapped) {
      result.command = mapped.command;
      // Decode hex to UTF-8 string
      const bytes = [];
      for (let i = 0; i < hexContent.length; i += 2) {
        bytes.push(parseInt(hexContent.substr(i, 2), 16));
      }
      result.argument = Buffer.from(bytes).toString("utf8");
      console.log("********************** %s", result);
      return result;
    }
  }

  type CommandType = {
    name: string;
    values: { [key: string]: { name: string } };
  };

  (Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).forEach(function () {
    const commansList = COMMANDS as unknown as { [key: string]: CommandType };

    if (typeof commansList[command] !== "undefined") {
      result.command = commansList[command].name;

      const cmdObj = COMMANDS[command as keyof typeof COMMANDS];
      const valuesObj = cmdObj.values as { [key: string]: { name: string } };
      if (valuesObj[value]?.name !== undefined) {
        result.argument = valuesObj[value]?.name;
      } else if (Object.prototype.hasOwnProperty.call(VALUE_MAPPINGS[command], "INTRANGES")) {
        result.argument = parseInt(value, 16);
      } else if (typeof value === "string" && value.match(/^([0-9A-F]{2})+(,([0-9A-F]{2})+)*$/i)) {
        // Handle hex-encoded string(s), possibly comma-separated
        result.argument = value.split(",").map((hexStr) => {
          hexStr = hexStr.trim();
          let str = "";
          for (let i = 0; i < hexStr.length; i += 2) {
            str += String.fromCharCode(parseInt(hexStr.substring(i, i + 2), 16));
          }
          return str;
        });
        if (result.argument.length === 1) {
          result.argument = result.argument[0];
        }
      }
    }
  });

  return result;
}

function command_to_iscp(command: string, args: any, zone: string) {
  var prefix: any, value: any;

  prefix = COMMAND_MAPPINGS[command as keyof typeof COMMAND_MAPPINGS];

  if (VALUE_MAPPINGS[prefix] && Object.prototype.hasOwnProperty.call(VALUE_MAPPINGS[prefix], args)) {
    value = VALUE_MAPPINGS[prefix][args].value;
  } else if (VALUE_MAPPINGS[prefix] && Object.prototype.hasOwnProperty.call(VALUE_MAPPINGS[prefix], "INTRANGES")) {
    self.emit("debug", util.format("INTRANGES assumed for zone %s, command %s", zone, prefix));

    // Convert decimal number to hexadecimal since receiver doesn't understand decimal, Pad value if it is not 2 digits
    value = (+args).toString(16).toUpperCase();
    value = value.length < 2 ? "0" + value : value;
  } else {
    console.log("%s not found in JSON: %s %s", integrationName, command, args);
    value = args;
  }

  self.emit("debug", util.format('DEBUG (command_to_iscp) raw command "%s"', prefix + value));

  return prefix + value;
}

self.discover = function () {
  /*
      discover([options, ] callback)
      Sends broadcast and waits for response callback called when number of devices or timeout reached
      option.devices    - stop listening after this amount of devices have answered (default: 1)
      option.timeout    - time in seconds to wait for devices to respond (default: 10)
      option.address    - broadcast address to send magic packet to (default: 255.255.255.255)
      option.port       - receiver port should always be 60128 this is just available if you need it
    */
  var callback: any,
    timeout_timer: any,
    options: { devices?: number; timeout?: number; address?: string; port?: number } = {},
    result: any[] = [],
    client = dgram.createSocket("udp4"),
    argv = Array.prototype.slice.call(arguments),
    argc = argv.length;

  if (argc === 1 && typeof argv[0] === "function") {
    callback = argv[0];
  } else if (argc === 2 && typeof argv[1] === "function") {
    options = argv[0];
    callback = argv[1];
  } else {
    return;
  }

  options.devices = options.devices || 1;
  options.timeout = options.timeout || 10;
  options.address = options.address || "255.255.255.255";
  options.port = options.port || 60128;

  function close() {
    client.close();
    callback(false, result);
  }

  client
    .on("error", function (err: any) {
      self.emit(
        "error",
        util.format("ERROR (server_error) Server error on %s:%s - %s", options.address, options.port, err)
      );
      client.close();
      callback(err, null);
    })
    .on("message", function (packet: any, rinfo: any) {
      var message = eiscp_packet_extract(packet),
        command = message.slice(0, 3),
        data;
      if (command === "ECN") {
        data = message.slice(3).split("/");
        result.push({
          host: rinfo.address,
          port: data[1],
          model: data[0],
          mac: data[3].slice(0, 12), // There's lots of null chars after MAC so we slice them off
          areacode: data[2]
        });
        self.emit(
          "debug",
          util.format(
            "DEBUG (received_discovery) Received discovery packet from %s:%s (%j)",
            rinfo.address,
            rinfo.port,
            result
          )
        );
        if (result.length >= (options.devices ?? 1)) {
          clearTimeout(timeout_timer);
          close();
        }
      } else {
        self.emit(
          "debug",
          util.format("DEBUG (received_data) Recevied data from %s:%s - %j", rinfo.address, rinfo.port, message)
        );
      }
    })
    .on("listening", function () {
      client.setBroadcast(true);
      var buffer = eiscp_packet("!xECNQSTN");
      self.emit(
        "debug",
        util.format("DEBUG (sent_discovery) Sent broadcast discovery packet to %s:%s", options.address, options.port)
      );
      client.send(buffer, 0, buffer.length, options.port, options.address);
      timeout_timer = setTimeout(close, (options.timeout ?? 10) * 1000);
    })
    .bind(0);
};

self.connect = async function (options?: any): Promise<{ model: string; host: string; port: number } | null> {
  /*
      No options required if you only have one receiver on your network. We will find it and connect to it!
      options.host            - Hostname/IP
      options.port            - Port (default: 60128)
      options.send_delay      - Delay in milliseconds between each command sent to receiver (default: 500)
      options.model           - Should be discovered automatically but if you want to override it you can
      options.reconnect       - Try to reconnect if connection is lost (default: false)
      options.reconnect_sleep - Time in seconds to sleep between reconnection attempts (default: 5)
      options.verify_commands - Whether the reject commands not found for the current model
    */
  options = options || {};
  config.host = options.host || config.host;
  config.port = options.port || config.port;
  config.model = options.model || config.model;
  config.reconnect = options.reconnect === undefined ? config.reconnect : options.reconnect;
  config.reconnect_sleep = options.reconnect_sleep || config.reconnect_sleep;
  config.verify_commands = options.verify_commands === undefined ? config.verify_commands : options.verify_commands;

  const connection_properties = {
    host: config.host,
    port: config.port
  };

  // Helper to promisify discover
  function discoverAsync(opts?: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
      self.discover(
        opts ||
          ((err: any, hosts: any) => {
            if (err) reject(err);
            else resolve(hosts);
          }),
        (err: any, hosts: any) => {
          if (err) reject(err);
          else resolve(hosts);
        }
      );
    });
  }

  // If no host is configured - we connect to the first device to answer
  if (typeof config.host === "undefined" || config.host === "") {
    try {
      const hosts = await discoverAsync();
      if (hosts && hosts.length > 0) {
        await self.connect(hosts[0]);
        return { model: hosts[0].model, host: hosts[0].host, port: hosts[0].port };
      }
      return null;
    } catch {
      return null;
    }
  }

  // If host is configured but no model is set - we send a discover directly to this receiver
  if (typeof config.model === "undefined" || config.model === "") {
    try {
      const hosts = await discoverAsync({ address: config.host });
      if (hosts && hosts.length > 0) {
        await self.connect(hosts[0]);
        return { model: hosts[0].model, host: hosts[0].host, port: hosts[0].port };
      }
      return null;
    } catch {
      return null;
    }
  }

  self.emit(
    "debug",
    util.format("INFO (connecting) Connecting to %s:%s (model: %s)", config.host, config.port, config.model)
  );

  // Prevent double connection
  if (self.is_connected && eiscp) {
    self.emit("debug", "Already connected, skipping connect()");
    return { model: config.model, host: config.host, port: config.port };
  }

  // Reconnect if we have previously connected
  if (typeof eiscp !== "undefined") {
    eiscp.connect(connection_properties);
    return { model: config.model, host: config.host, port: config.port };
  }

  // Connecting the first time
  eiscp = net.connect(connection_properties);
  // Send system-power query right after connecting
  eiscp
    .on("connect", function () {
      self.is_connected = true;
      self.emit("connect", config.host, config.port, config.model);
    })
    .on("close", function () {
      self.is_connected = false;
      self.emit("close", config.host, config.port);

      if (config.reconnect) {
        setTimeout(() => self.connect(), config.reconnect_sleep * 1000);
      }
    })
    .on("error", function () {
      self.is_connected = false;
      eiscp.destroy();
    })
    .on("data", function (data: any) {
      var iscp_message = eiscp_packet_extract(data);
      const rawResult = iscp_to_command(iscp_message);
      const result: {
        command: string | undefined;
        argument: string | number | undefined;
        zone: string;
        iscp_command?: string;
        host?: string;
        port?: number;
        model?: string;
      } = {
        ...rawResult,
        argument: Array.isArray(rawResult.argument)
          ? rawResult.argument.length === 1
            ? rawResult.argument[0]
            : String(rawResult.argument)
          : rawResult.argument
      };

      result.iscp_command = iscp_message;
      result.host = config.host;
      result.port = config.port;
      result.model = config.model;

      self.emit("data", result);
    });

  return { model: config.model, host: config.host, port: config.port };
};

self.close = self.disconnect = function () {
  if (self.is_connected) {
    eiscp.destroy();
  }
};

send_queue = async.queue(function (data: any, callback: any) {
  //Syncronous queue which sends commands to device, callback(bool error, string error_message)

  if (self.is_connected) {
    eiscp.write(eiscp_packet(data));
    setTimeout(callback, config.send_delay, false);
    return;
  }

  callback("Send command, while not connected", null);
}, 1);

self.raw = function (data: any, callback: any) {
  // Send a low level command like PWR01, callback only tells you that the command was sent but not that it succsessfully did what you asked
  if (typeof data !== "undefined" && data !== "") {
    send_queue.push(data, function (err: any) {
      if (typeof callback === "function") {
        callback(err, null);
      }
    });
  } else if (typeof callback === "function") {
    callback(true, "No data provided.");
  }
};

self.command = function (data: any, callback: any) {
  // Send a high level command like system-power=query, callback only tells you that the command was sent but not that it succsessfully did what you asked
  let command: string, args: any, zone: any;

  if (typeof data === "string") {
    // Attempt to parse string command (e.g., "main.power.on" or "power.on")
    const parts = data
      .toLowerCase()
      .split(/[\s\.=:]/)
      .filter((item: any) => item !== "");
    if (parts.length === 3) {
      zone = parts[0] as keyof typeof COMMANDS;
      command = parts[1];
      args = parts[2];
    } else if (parts.length === 2) {
      zone = "main";
      command = parts[0];
      args = parts[1];
    } else {
      // fallback: pass as single string, let command_to_iscp handle error
      self.raw(command_to_iscp(data, undefined, "main"), callback);
      return;
    }
  } else if (typeof data === "object" && data !== null) {
    // If data is already an object with the right properties
    zone = (data.zone ?? "main") as keyof typeof COMMANDS;
    command = data.command;
    args = data.args;
  } else {
    // fallback: pass as single string, let command_to_iscp handle error
    self.raw(command_to_iscp(data, undefined, "main"), callback);
    return;
  }
  self.raw(command_to_iscp(command, args, zone), callback);
};

self.get_commands = function (zone: string, callback: any) {
  // Returns all commands in given zone
  var result: any[] = [];
  async.each(
    Object.keys((COMMAND_MAPPINGS as any)[zone]),
    function (cmd: string, cb: any) {
      result.push(cmd);
      cb();
    },
    function (err: any) {
      callback(err, result);
    }
  );
};

self.get_command = function (command: string, callback: any) {
  // Returns all command values in given zone and command
  var result: any[] = [],
    // zone,
    parts = command.split(".");

  if (parts.length !== 2) {
    // zone = "main";
    command = parts[0];
  } else {
    // zone = parts[0];
    command = parts[1];
  }

  async.each(
    Object.keys(VALUE_MAPPINGS[(COMMAND_MAPPINGS as Record<string, string>)[command]]),
    function (val: string, cb: any) {
      result.push(val);
      cb();
    },
    function (err: any) {
      callback(err, result);
    }
  );
};

/**
 * Resolves when the eiscp connection is established.
 */
self.waitForConnect = function (timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (self.is_connected) {
      resolve();
      return;
    }
    const onConnect = () => {
      clearTimeout(timer);
      self.off("connect", onConnect);
      resolve();
    };
    const timer = setTimeout(() => {
      self.off("connect", onConnect);
      reject(new Error("Timeout waiting for AVR connection"));
    }, timeoutMs);
    self.on("connect", onConnect);
  });
};

// Handle unhandled errors
if (self.listenerCount("error") === 0) {
  self.on("error", (err: any) => {
    console.error("eiscp error (unhandled):", err);
  });
}
