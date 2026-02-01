/**
 * Listening mode audio format compatibility mapping
 * Maps audio format types to compatible listening modes
 */

/** Audio format categories */
export enum AudioFormatType {
  Analog = "analog",
  DTS = "dts",
  DTSHD = "dts-hd",
  DTSX = "dts-x",
  DolbyAtmos = "dolby-atmos",
  DolbyDigital = "dolby-digital",
  DolbyTrueHD = "dolby-truehd",
  Multichannel = "multichannel",
  PCM = "pcm",
  Stereo = "stereo"
}

/** Listening modes that work with stereo sources (2.0 audio) */
const stereoCompatibleModes = [
  "all-ch-stereo",
  "direct",
  "dolby-virtual",
  "dts-surround-sensation",
  "enhance",
  "enhanced-7",
  "full-mono",
  "mono",
  "neo-6",
  "neo-6-cinema",
  "neo-6-music",
  "neo-x-cinema",
  "neo-x-game",
  "neo-x-music",
  "neural-digital-music",
  "neural-surr",
  "neural-surround",
  "orchestra",
  "plii",
  "pliix",
  "pliix-game",
  "pliix-movie",
  "pliix-music",
  "pure-audio",
  "stereo",
  "studio-mix",
  "theater-dimensional",
  "tv-logic",
  "unplugged",
  "whole-house"
];

/** Listening modes that work with Dolby Digital (AC3) sources */
const dolbyDigitalModes = [
  ...stereoCompatibleModes,
  "action",
  "cinema2",
  "dolby-ex",
  "film",
  "mono-movie",
  "musical",
  "neural-thx",
  "neural-thx-cinema",
  "neural-thx-games",
  "neural-thx-music",
  "pliix-thx-cinema",
  "pliix-thx-games",
  "pliix-thx-music",
  "s-cinema",
  "s2",
  "s2-cinema",
  "s2-games",
  "s2-music",
  "s-games",
  "s-music",
  "straight-decode",
  "surround",
  "thx",
  "thx-cinema",
  "thx-games",
  "thx-music",
  "thx-musicmode",
  "thx-surround-ex",
  "thx-u2"
];

/** Listening modes that work with DTS sources */
const dtsModes = [
  ...stereoCompatibleModes,
  "action",
  "film",
  "mono-movie",
  "musical",
  "neo-6",
  "neo-6-cinema",
  "neo-6-cinema-dts-surround-sensation",
  "neo-6-music",
  "neo-6-music-dts-surround-sensation",
  "neo-x-cinema",
  "neo-x-game",
  "neo-x-music",
  "neo-x-thx-cinema",
  "neo-x-thx-games",
  "neo-x-thx-music",
  "neural-digital-music",
  "neural-surr",
  "neural-surround",
  "neural-thx",
  "neural-thx-cinema",
  "neural-thx-games",
  "neural-thx-music",
  "straight-decode",
  "surround",
  "thx",
  "thx-cinema",
  "thx-games",
  "thx-music"
];

/** Listening modes that work with Dolby TrueHD sources */
const dolbyTrueHDModes = [
  ...dolbyDigitalModes,
  "pliiz-height",
  "pliiz-height-thx-cinema",
  "pliiz-height-thx-games",
  "pliiz-height-thx-music",
  "pliiz-height-thx-u2"
];

/** Listening modes that work with DTS-HD sources */
const dtsHDModes = [
  ...dtsModes,
  "audyssey-dsx",
  "dolby-ex-audyssey-dsx",
  "neo-6-cinema-audyssey-dsx",
  "neo-6-music-audyssey-dsx",
  "neural-digital-music-audyssey-dsx",
  "neural-surround-audyssey-dsx",
  "plii-game-audyssey-dsx",
  "plii-movie-audyssey-dsx",
  "plii-music-audyssey-dsx"
];

/** Listening modes that work with Dolby Atmos sources */
const dolbyAtmosModes = [
  ...dolbyTrueHDModes
];

/** Listening modes that work with DTS:X sources */
const dtsXModes = [
  ...dtsHDModes
];

/** Listening modes that work with multichannel PCM */
const multichannelPCMModes = [
  ...stereoCompatibleModes,
  "action",
  "film",
  "mono-movie",
  "musical",
  "straight-decode",
  "surround"
];

/** Listening modes that work with analog inputs */
const analogModes = [
  ...stereoCompatibleModes
];

/**
 * Get compatible listening modes based on audio format
 */
export function getCompatibleListeningModes(audioFormat: string | undefined): string[] | null {
  if (!audioFormat) {
    return null; // No filtering if format unknown
  }

  const format = audioFormat.toLowerCase();

  // Dolby formats
  if (format.includes("atmos")) {
    return dolbyAtmosModes;
  }
  if (format.includes("truehd") || format.includes("true hd")) {
    return dolbyTrueHDModes;
  }
  if (format.includes("dolby") || format.includes("ac3") || format.includes("dd") || format.includes("ac-3")) {
    return dolbyDigitalModes;
  }

  // DTS formats
  if (format.includes("dts:x") || format.includes("dts-x")) {
    return dtsXModes;
  }
  if (format.includes("dts-hd") || format.includes("dts hd") || format.includes("dts-ma") || format.includes("dts ma")) {
    return dtsHDModes;
  }
  if (format.includes("dts")) {
    return dtsModes;
  }

  // PCM formats
  if (format.includes("pcm") || format.includes("lpcm")) {
    if (format.includes("multichannel") || format.includes("multi") || format.match(/[5-9]\.\d/)) {
      return multichannelPCMModes;
    }
    return stereoCompatibleModes;
  }

  // Analog
  if (format.includes("analog") || format.includes("analogue")) {
    return analogModes;
  }

  // Default to stereo modes if format not recognized
  return stereoCompatibleModes;
}

/**
 * Detect audio format type from IFA audio input string
 */
export function detectAudioFormatType(audioInput: string): string {
  if (!audioInput) {
    return "unknown";
  }

  const input = audioInput.toLowerCase();

  // Dolby formats
  if (input.includes("atmos")) return "Dolby Atmos";
  if (input.includes("truehd") || input.includes("true hd")) return "Dolby TrueHD";
  if (input.includes("dolby") || input.includes("ac3") || input.includes("dd") || input.includes("ac-3")) return "Dolby Digital";

  // DTS formats
  if (input.includes("dts:x") || input.includes("dts-x")) return "DTS:X";
  if (input.includes("dts-hd") || input.includes("dts hd") || input.includes("dts-ma") || input.includes("dts ma")) return "DTS-HD";
  if (input.includes("dts")) return "DTS";

  // PCM formats
  if (input.includes("pcm") || input.includes("lpcm")) {
    if (input.includes("multichannel") || input.includes("multi") || input.match(/[5-9]\.\d/)) {
      return "Multichannel PCM";
    }
    return "PCM Stereo";
  }

  // Analog
  if (input.includes("analog") || input.includes("analogue")) return "Analog";

  return audioInput;
}
