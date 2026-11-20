import { describe, expect, it } from "vitest";
import { createRemoteEntity, REPORTED_INPUT_COMMAND_PREFIX, UC_REMOTE_COMMANDS } from "../src/remoteEntity.js";

type Command = { cmd_id: string; params?: Record<string, unknown> };
type RemoteOptions = {
  simple_commands: string[];
  button_mapping: { button: string; short_press?: Command; long_press?: Command }[];
  user_interface: { pages: { items: { command?: Command }[] }[] };
};

// Remote entity commands (core-api entity_remote.md) without and with the entity type prefix.
const REMOTE_ENTITY_COMMANDS = ["on", "off", "toggle", "send_cmd", "send_cmd_sequence"];

function optionsOf(reportedInputNames?: string[]): RemoteOptions {
  return createRemoteEntity("M_1.2.3.4_main", "Test", undefined, reportedInputNames).options as unknown as RemoteOptions;
}

// A button/UI command must be a remote entity command, or a simple command declared in `simple_commands`
// (directly, or wrapped in send_cmd / send_cmd_sequence).
function undeclaredCommands(options: RemoteOptions): string[] {
  const declared = new Set(options.simple_commands);
  const commands: Command[] = [
    ...options.button_mapping.flatMap((mapping) => [mapping.short_press, mapping.long_press]),
    ...options.user_interface.pages.flatMap((page) => page.items.map((item) => item.command))
  ].filter((command): command is Command => command !== undefined);

  const problems: string[] = [];
  for (const command of commands) {
    const cmdId = command.cmd_id.replace(/^remote\./, "");
    if (cmdId === "send_cmd") {
      const name = String(command.params?.command ?? "");
      if (!declared.has(name)) problems.push(`send_cmd ${name}`);
    } else if (cmdId === "send_cmd_sequence") {
      for (const name of (command.params?.sequence as string[]) ?? []) if (!declared.has(name)) problems.push(`send_cmd_sequence ${name}`);
    } else if (!REMOTE_ENTITY_COMMANDS.includes(cmdId) && !declared.has(cmdId)) {
      problems.push(cmdId);
    }
  }
  return problems;
}

describe("remote entity definition", () => {
  it("advertises the UC-recommended command names first", () => {
    const { simple_commands } = optionsOf();
    expect(simple_commands.slice(0, Object.keys(UC_REMOTE_COMMANDS).length)).toEqual(Object.keys(UC_REMOTE_COMMANDS));
    expect(new Set(simple_commands).size).toBe(simple_commands.length);
  });

  it("only uses declared simple commands or remote entity commands in buttons and UI pages", () => {
    expect(undeclaredCommands(optionsOf())).toEqual([]);
    expect(undeclaredCommands(optionsOf(["Music Server", "BD/DVD", "TuneIn Radio"]))).toEqual([]);
  });

  it("maps the power button and power icon to the remote's own toggle command", () => {
    const options = optionsOf();
    expect(options.button_mapping.find((mapping) => mapping.button === "POWER")?.short_press).toEqual({ cmd_id: "remote.toggle" });
    const commands = options.user_interface.pages.flatMap((page) => page.items.map((item) => item.command));
    expect(commands).toContainEqual({ cmd_id: "remote.toggle" });
    // "toggle" must not be sent as a simple command (UC reserves on/off/toggle).
    expect(commands.some((command) => command?.cmd_id === "send_cmd" && command.params?.command === "toggle")).toBe(false);
  });

  it("declares a command for every AVR-reported input", () => {
    const { simple_commands } = optionsOf(["Music Server", "BD/DVD"]);
    expect(simple_commands).toContain(`${REPORTED_INPUT_COMMAND_PREFIX}Music%20Server`);
    expect(simple_commands).toContain(`${REPORTED_INPUT_COMMAND_PREFIX}BD%2FDVD`);
  });
});
