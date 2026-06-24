import test from "ava";
import { pathToFileURL } from "url";
import path from "path";

async function importDist(modulePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.resolve(process.cwd(), modulePath)).href);
}

test.serial("SIMPLE_COMMANDS_MAP loads and contains expected total keys", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;
  const all = mod.ALL_SIMPLE_COMMANDS as string[];

  t.truthy(map);
  t.truthy(all);
  t.is(all.length, Object.keys(map).length);
  t.is(all.length, 218);
});

test.serial("SIMPLE_COMMANDS_MAP contains expected known input keys", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["INPUT_CD"], "input-selector cd");
  t.is(map["INPUT_DVD"], "input-selector bd");
  t.is(map["INPUT_BD"], "input-selector bd");
  t.is(map["INPUT_TV"], "input-selector tv");
  t.is(map["INPUT_FM"], "input-selector fm");
  t.is(map["INPUT_AM"], "input-selector am");
  t.is(map["INPUT_TUNER"], "input-selector tuner");
  t.is(map["INPUT_BLUETOOTH"], "input-selector bluetooth");
});

test.serial("SIMPLE_COMMANDS_MAP includes NSS streaming sources", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["INPUT_TUNEIN"], "input-selector tunein");
  t.is(map["INPUT_SPOTIFY"], "input-selector spotify");
  t.is(map["INPUT_DEEZER"], "input-selector deezer");
  t.is(map["INPUT_TIDAL"], "input-selector tidal");
  t.is(map["INPUT_AMAZONMUSIC"], "input-selector amazonmusic");
  t.is(map["INPUT_CHROMECAST"], "input-selector chromecast");
  t.is(map["INPUT_AIRPLAY"], "input-selector airplay");
  t.is(map["INPUT_ALEXA"], "input-selector alexa");
});

test.serial("SIMPLE_COMMANDS_MAP excludes query, up, and down", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.falsy(map["INPUT_QUERY"]);
  t.falsy(map["INPUT_UP"]);
  t.falsy(map["INPUT_DOWN"]);
});

test.serial("SIMPLE_COMMANDS_MAP generates multiple keys for aliases mapping to same value", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  // video1/vcr/dvr all map to input-selector video1
  t.is(map["INPUT_VIDEO1"], "input-selector video1");
  t.is(map["INPUT_VCR"], "input-selector video1");
  t.is(map["INPUT_DVR"], "input-selector video1");

  // bd/dvd both map to input-selector bd
  t.is(map["INPUT_BD"], "input-selector bd");
  t.is(map["INPUT_DVD"], "input-selector bd");

  // net/network both map to input-selector net
  t.is(map["INPUT_NET"], "input-selector net");
  t.is(map["INPUT_NETWORK"], "input-selector net");
});

test.serial("SIMPLE_COMMANDS_MAP includes audio-muting commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["MUTE_ON"], "audio-muting on");
  t.is(map["MUTE_OFF"], "audio-muting off");
  t.is(map["MUTE_TOGGLE"], "audio-muting toggle");
  t.falsy(map["MUTE_QUERY"]);
});

test.serial("SIMPLE_COMMANDS_MAP includes multi-zone-muting commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["MULTI_ZONE_MUTE_ALL_ON"], "multi-zone-muting all-on");
  t.is(map["MULTI_ZONE_MUTE_ALL_OFF"], "multi-zone-muting all-off");
  t.is(map["MULTI_ZONE_MUTE_ALL_TOGGLE"], "multi-zone-muting all-toggle");
  t.is(map["MULTI_ZONE_MUTE_MAIN_ZONE2_ON"], "multi-zone-muting main-zone2-on");
  t.is(map["MULTI_ZONE_MUTE_ZONE2_ZONE3_TOGGLE"], "multi-zone-muting zone2-zone3-toggle");
  t.is(map["MULTI_ZONE_MUTE_ZONE2_ZONE3_ZONE4_OFF"], "multi-zone-muting zone2-zone3-zone4-off");
});

test.serial("SIMPLE_COMMANDS_MAP includes multi-zone-volume commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["MULTI_ZONE_VOLUME_ALL_UP"], "multi-zone-volume all-up");
  t.is(map["MULTI_ZONE_VOLUME_ALL_DOWN"], "multi-zone-volume all-down");
  t.is(map["MULTI_ZONE_VOLUME_MAIN_ZONE2_UP"], "multi-zone-volume main-zone2-up");
  t.is(map["MULTI_ZONE_VOLUME_ZONE2_ZONE3_DOWN"], "multi-zone-volume zone2-zone3-down");
  t.is(map["MULTI_ZONE_VOLUME_ZONE2_ZONE3_ZONE4_UP"], "multi-zone-volume zone2-zone3-zone4-up");
});

test.serial("SIMPLE_COMMANDS_MAP includes audio-return-channel commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["AUDIO_RETURN_CHANNEL_AUTO"], "audio-return-channel auto");
  t.is(map["AUDIO_RETURN_CHANNEL_OFF"], "audio-return-channel off");
});

test.serial("SIMPLE_COMMANDS_MAP includes dimmer-level commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["DIMMER_BRIGHT"], "dimmer-level bright");
  t.is(map["DIMMER_DARK"], "dimmer-level dark");
  t.is(map["DIMMER_DIM"], "dimmer-level dim");
});

test.serial("SIMPLE_COMMANDS_MAP includes dirac commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["DIRAC_SLOT1"], "dirac slot1");
  t.is(map["DIRAC_SLOT2"], "dirac slot2");
  t.is(map["DIRAC_SLOT3"], "dirac slot3");
  t.is(map["DIRAC_OFF"], "dirac off");
});

test.serial("SIMPLE_COMMANDS_MAP includes listening-mode commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["LISTENING_MODE_STEREO"], "listening-mode stereo");
  t.is(map["LISTENING_MODE_DIRECT"], "listening-mode direct");
  t.is(map["LISTENING_MODE_MONO"], "listening-mode mono");
  t.falsy(map["LISTENING_MODE_UP"]);
  t.falsy(map["LISTENING_MODE_DOWN"]);
});

test.serial("SIMPLE_COMMANDS_MAP includes late-night commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

    t.is(map["LATE_NIGHT_OFF"], "late-night off");
  t.is(map["LATE_NIGHT_LOW_DOLBYDIGITAL"], "late-night low-dolbydigital");
  t.is(map["LATE_NIGHT_HIGH_DOLBYDIGITAL"], "late-night high-dolbydigital");
});

test.serial("SIMPLE_COMMANDS_MAP includes lfe-level commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["LFE_LEVEL_0DB"], "lfe-level 0dB");
  t.is(map["LFE_LEVEL__10DB"], "lfe-level -10dB");
  t.truthy(map["LFE_LEVEL__5DB"]);
});

test.serial("SIMPLE_COMMANDS_MAP includes loudness-management commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["LOUDNESS_MANAGEMENT_ON"], "loudness-management on");
  t.is(map["LOUDNESS_MANAGEMENT_OFF"], "loudness-management off");
});

test.serial("SIMPLE_COMMANDS_MAP includes music-optimizer commands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["MUSIC_OPTIMIZER_ON"], "music-optimizer on");
  t.is(map["MUSIC_OPTIMIZER_OFF"], "music-optimizer off");
});

test.serial("SIMPLE_COMMANDS_MAP replaces hyphens with underscores in IDs", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;

  t.is(map["INPUT_DTS_PLAY_FI"], "input-selector dts-play-fi");
  t.is(map["INPUT_MUSIC_SERVER"], "input-selector music-server");
});

test.serial("ALL_SIMPLE_COMMANDS is an array of all map keys", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const map = mod.SIMPLE_COMMANDS_MAP as Record<string, string>;
  const all = mod.ALL_SIMPLE_COMMANDS as string[];

  t.true(Array.isArray(all));
  t.deepEqual(all.sort(), Object.keys(map).sort());
});

test.serial("ALL_INPUT_SELECTOR_NAMES contains canonical input names from eiscpCommands", async (t) => {
  const mod = await importDist("dist/src/simpleCommands.js");
  const names = mod.ALL_INPUT_SELECTOR_NAMES as string[];

  t.true(Array.isArray(names));
  t.true(names.includes("cd"), "should include cd");
  t.true(names.includes("bd"), "should include bd (primary of bd/dvd)");
  t.true(names.includes("tv"), "should include tv");
  t.true(names.includes("net"), "should include net (primary of net/network)");
  t.true(names.includes("tunein"), "should include tunein");
  t.true(names.includes("spotify"), "should include spotify");
  t.true(names.includes("bluetooth"), "should include bluetooth");
  t.true(names.includes("dts-play-fi"), "should include dts-play-fi");
  t.true(names.includes("music-server"), "should include music-server");
  t.false(names.includes("query"), "should exclude query");
  t.false(names.includes("up"), "should exclude up");
  t.false(names.includes("down"), "should exclude down");
  t.true(names.includes("dvd"), "should include alias dvd alongside primary bd");
  t.true(names.includes("vcr"), "should include alias vcr alongside primary video1");
  t.true(names.includes("network"), "should include alias network alongside primary net");
});
