import { describe, expect, it } from "vitest";
import { ALL_SIMPLE_COMMANDS } from "../src/simpleCommands.js";
import { createRemoteEntity, REPORTED_INPUT_COMMAND_PREFIX } from "../src/remoteEntity.js";

// UC simple command naming rules (core-api entity_media_player.md / entity_remote.md).
// The documented 20-character limit no longer applies, so length is intentionally not checked.
const RESERVED_REMOTE_COMMANDS = ["on", "off", "toggle", "send_cmd", "send_cmd_sequence"];
// Media player: upper case, no spaces, only A-Z 0-9 and -/_.:+#*°@%()?
const MEDIA_PLAYER_SIMPLE_COMMAND = /^[A-Z0-9/_.:+#*°@%()?-]+$/;

function violations(commands: string[], isValid: (command: string) => boolean): string[] {
  return commands.filter((command) => !isValid(command));
}

describe("simple command naming rules", () => {
  it("generates at least one simple command", () => {
    expect(ALL_SIMPLE_COMMANDS.length).toBeGreaterThan(0);
  });

  it("media player simple commands are upper case and use only allowed characters", () => {
    expect(violations(ALL_SIMPLE_COMMANDS, (c) => MEDIA_PLAYER_SIMPLE_COMMAND.test(c))).toEqual([]);
  });

  it("simple commands are unique", () => {
    expect(new Set(ALL_SIMPLE_COMMANDS).size).toBe(ALL_SIMPLE_COMMANDS.length);
  });

  it("simple commands do not use reserved remote entity command names", () => {
    expect(violations(ALL_SIMPLE_COMMANDS, (c) => !RESERVED_REMOTE_COMMANDS.includes(c.toLowerCase()))).toEqual([]);
  });

  it("remote entity commands, including AVR-reported inputs, contain no whitespace and no reserved names", () => {
    const reportedInputNames = ["Music Server", "BD/DVD", "CBL/SAT", "TuneIn Radio", "Chromecast built-in", "PHONO", "Spotify Connect"];
    const remote = createRemoteEntity("M_1.2.3.4_main", "Test", undefined, reportedInputNames);
    const options = (remote.options ?? {}) as Record<string, unknown>;
    const commands = (options.simple_commands ?? []) as string[];

    const reported = commands.filter((c) => c.startsWith(REPORTED_INPUT_COMMAND_PREFIX));
    expect(reported).toHaveLength(reportedInputNames.length);

    expect(violations(commands, (c) => c.length > 0 && !/\s/.test(c))).toEqual([]);
    expect(violations(commands, (c) => !RESERVED_REMOTE_COMMANDS.includes(c.toLowerCase()))).toEqual([]);
    expect(new Set(commands).size).toBe(commands.length);
  });
});
