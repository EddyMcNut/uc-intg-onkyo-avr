import { describe, it, expect } from "vitest";

it("SIMPLE_COMMANDS_MAP loads and contains expected total keys", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;
  const all = mod.ALL_SIMPLE_COMMANDS as string[];

  expect(map).toBeTruthy();
  expect(all).toBeTruthy();
  expect(all.length).toBe(Object.keys(map).length);
  expect(all.length).toBe(345);
});

it("SIMPLE_COMMANDS_MAP contains expected known input keys", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["INPUT_CD"]).toBe("input-selector cd");
  expect(map["INPUT_DVD"]).toBe("input-selector bd");
  expect(map["INPUT_BD"]).toBe("input-selector bd");
  expect(map["INPUT_TV"]).toBe("input-selector tv");
  expect(map["INPUT_FM"]).toBe("input-selector fm");
  expect(map["INPUT_AM"]).toBe("input-selector am");
  expect(map["INPUT_TUNER"]).toBe("input-selector tuner");
  expect(map["INPUT_BLUETOOTH"]).toBe("input-selector bluetooth");
});

it("SIMPLE_COMMANDS_MAP includes NSS streaming sources", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["INPUT_TUNEIN"]).toBe("input-selector tunein");
  expect(map["INPUT_SPOTIFY"]).toBe("input-selector spotify");
  expect(map["INPUT_DEEZER"]).toBe("input-selector deezer");
  expect(map["INPUT_TIDAL"]).toBe("input-selector tidal");
  expect(map["INPUT_AMAZONMUSIC"]).toBe("input-selector amazonmusic");
  expect(map["INPUT_CHROMECAST"]).toBe("input-selector chromecast");
  expect(map["INPUT_AIRPLAY"]).toBe("input-selector airplay");
  expect(map["INPUT_ALEXA"]).toBe("input-selector alexa");
});

it("SIMPLE_COMMANDS_MAP excludes query, up, and down", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["INPUT_QUERY"]).toBeFalsy();
  expect(map["INPUT_UP"]).toBeFalsy();
  expect(map["INPUT_DOWN"]).toBeFalsy();
});

it("SIMPLE_COMMANDS_MAP generates multiple keys for aliases mapping to same value", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  // video1/vcr/dvr all map to input-selector video1
  expect(map["INPUT_VIDEO1"]).toBe("input-selector video1");
  expect(map["INPUT_VCR"]).toBe("input-selector video1");
  expect(map["INPUT_DVR"]).toBe("input-selector video1");

  // bd/dvd both map to input-selector bd
  expect(map["INPUT_BD"]).toBe("input-selector bd");
  expect(map["INPUT_DVD"]).toBe("input-selector bd");

  // net/network both map to input-selector net
  expect(map["INPUT_NET"]).toBe("input-selector net");
  expect(map["INPUT_NETWORK"]).toBe("input-selector net");
});

it("SIMPLE_COMMANDS_MAP includes audio-muting commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["MUTE_ON"]).toBe("audio-muting on");
  expect(map["MUTE_OFF"]).toBe("audio-muting off");
  expect(map["MUTE_TOGGLE"]).toBe("audio-muting toggle");
  expect(map["MUTE_QUERY"]).toBeFalsy();
});

it("SIMPLE_COMMANDS_MAP includes multi-zone-muting commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["MULTI_ZONE_MUTE_ALL_ON"]).toBe("multi-zone-muting all-on");
  expect(map["MULTI_ZONE_MUTE_ALL_OFF"]).toBe("multi-zone-muting all-off");
  expect(map["MULTI_ZONE_MUTE_ALL_TOGGLE"]).toBe("multi-zone-muting all-toggle");
  expect(map["MULTI_ZONE_MUTE_MAIN_ZONE2_ON"]).toBe("multi-zone-muting main-zone2-on");
  expect(map["MULTI_ZONE_MUTE_ZONE2_ZONE3_TOGGLE"]).toBe("multi-zone-muting zone2-zone3-toggle");
  expect(map["MULTI_ZONE_MUTE_ZONE2_ZONE3_ZONE4_OFF"]).toBe("multi-zone-muting zone2-zone3-zone4-off");
});

it("SIMPLE_COMMANDS_MAP includes multi-zone-volume commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["MULTI_ZONE_VOLUME_ALL_UP"]).toBe("multi-zone-volume all-up");
  expect(map["MULTI_ZONE_VOLUME_ALL_DOWN"]).toBe("multi-zone-volume all-down");
  expect(map["MULTI_ZONE_VOLUME_MAIN_ZONE2_UP"]).toBe("multi-zone-volume main-zone2-up");
  expect(map["MULTI_ZONE_VOLUME_ZONE2_ZONE3_DOWN"]).toBe("multi-zone-volume zone2-zone3-down");
  expect(map["MULTI_ZONE_VOLUME_ZONE2_ZONE3_ZONE4_UP"]).toBe("multi-zone-volume zone2-zone3-zone4-up");
});

it("SIMPLE_COMMANDS_MAP includes audio-return-channel commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["AUDIO_RETURN_CHANNEL_AUTO"]).toBe("audio-return-channel auto");
  expect(map["AUDIO_RETURN_CHANNEL_OFF"]).toBe("audio-return-channel off");
});

it("SIMPLE_COMMANDS_MAP includes dimmer-level commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["DIMMER_BRIGHT"]).toBe("dimmer-level bright");
  expect(map["DIMMER_DARK"]).toBe("dimmer-level dark");
  expect(map["DIMMER_DIM"]).toBe("dimmer-level dim");
});

it("SIMPLE_COMMANDS_MAP includes dirac commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["DIRAC_SLOT1"]).toBe("dirac slot1");
  expect(map["DIRAC_SLOT2"]).toBe("dirac slot2");
  expect(map["DIRAC_SLOT3"]).toBe("dirac slot3");
  expect(map["DIRAC_OFF"]).toBe("dirac off");
});

it("SIMPLE_COMMANDS_MAP includes listening-mode commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["LISTENING_MODE_STEREO"]).toBe("listening-mode stereo");
  expect(map["LISTENING_MODE_DIRECT"]).toBe("listening-mode direct");
  expect(map["LISTENING_MODE_MONO"]).toBe("listening-mode mono");
  expect(map["LISTENING_MODE_UP"]).toBeFalsy();
  expect(map["LISTENING_MODE_DOWN"]).toBeFalsy();
});

it("SIMPLE_COMMANDS_MAP includes late-night commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

    expect(map["LATE_NIGHT_OFF"]).toBe("late-night off");
  expect(map["LATE_NIGHT_LOW_DOLBYDIGITAL"]).toBe("late-night low-dolbydigital");
  expect(map["LATE_NIGHT_HIGH_DOLBYDIGITAL"]).toBe("late-night high-dolbydigital");
});

it("SIMPLE_COMMANDS_MAP includes lfe-level commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["LFE_LEVEL_0DB"]).toBe("lfe-level 0dB");
  expect(map["LFE_LEVEL__10DB"]).toBe("lfe-level -10dB");
  expect(map["LFE_LEVEL__5DB"]).toBeTruthy();
});

it("SIMPLE_COMMANDS_MAP includes loudness-management commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["LOUDNESS_MANAGEMENT_ON"]).toBe("loudness-management on");
  expect(map["LOUDNESS_MANAGEMENT_OFF"]).toBe("loudness-management off");
});

it("SIMPLE_COMMANDS_MAP includes music-optimizer commands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["MUSIC_OPTIMIZER_ON"]).toBe("music-optimizer on");
  expect(map["MUSIC_OPTIMIZER_OFF"]).toBe("music-optimizer off");
});

it("SIMPLE_COMMANDS_MAP replaces hyphens with underscores in IDs", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  expect(map["INPUT_DTS_PLAY_FI"]).toBe("input-selector dts-play-fi");
  expect(map["INPUT_MUSIC_SERVER"]).toBe("input-selector music-server");
});

it("ALL_SIMPLE_COMMANDS is an array of all map keys", async () => {
  const mod = await import("../src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;
  const all = mod.ALL_SIMPLE_COMMANDS as string[];

  expect(Array.isArray(all)).toBe(true);
  expect(all.sort()).toEqual(Object.keys(map).sort());
});

it("ALL_INPUT_SELECTOR_NAMES contains canonical input names from eiscpCommands", async () => {
  const mod = await import("../src/simpleCommands.js");
  const names = mod.ALL_INPUT_SELECTOR_NAMES as string[];

  expect(Array.isArray(names)).toBe(true);
  expect(names.includes("cd")).toBe(true);
  expect(names.includes("bd")).toBe(true);
  expect(names.includes("tv")).toBe(true);
  expect(names.includes("net")).toBe(true);
  expect(names.includes("tunein")).toBe(true);
  expect(names.includes("spotify")).toBe(true);
  expect(names.includes("bluetooth")).toBe(true);
  expect(names.includes("dts-play-fi")).toBe(true);
  expect(names.includes("music-server")).toBe(true);
  expect(names.includes("query")).toBe(false);
  expect(names.includes("up")).toBe(false);
  expect(names.includes("down")).toBe(false);
  expect(names.includes("dvd")).toBe(true);
  expect(names.includes("vcr")).toBe(true);
  expect(names.includes("network")).toBe(true);
});
