// Listening mode audio format compatibility mapping — maps audio format types to compatible listening modes.

import { AudioFormatType, classifyAudioFormat } from "./audioFormatClassifier.js";

/** Listening modes that work with stereo sources (2.0 audio) */
const stereoCompatibleModes = [
  "all-ch-stereo",
  "extended-stereo",
  "direct",
  "dolby-virtual",
  "dts-surround-sensation",
  "enhance",
  "enhance-7",
  "dolby-surround-sports",
  "full-mono",
  "extended-mono",
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
  "dolby-surround-classical",
  "plii",
  "pliix",
  "pliix-game",
  "pliix-movie",
  "dolby-surround",
  "pliix-music",
  "pure-audio",
  "pure-direct",
  "stereo",
  "studio-mix",
  "dolby-surround-entertainment-show",
  "theater-dimensional",
  "dolby-surround-front-stage-surround",
  "tv-logic",
  "dolby-surround-drama",
  "unplugged",
  "dolby-surround-unplugged",
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
  "dts-neural:x",
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
const dolbyTrueHDModes = [...dolbyDigitalModes, "pliiz-height", "pliiz-height-thx-cinema", "pliiz-height-thx-games", "pliiz-height-thx-music", "pliiz-height-thx-u2"];

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
const dolbyAtmosModes = [...dolbyTrueHDModes];

/** Listening modes that work with DTS:X sources */
const dtsXModes = [...dtsHDModes];

/** Listening modes that work with multichannel PCM */
const multichannelPCMModes = [...stereoCompatibleModes, "action", "film", "mono-movie", "musical", "straight-decode", "surround"];

/** Listening modes that work with analog inputs */
const analogModes = [...stereoCompatibleModes];

// Returns compatible listening modes for the given audio format string, or null if format is unknown.
export function getCompatibleListeningModes(audioFormat: string | undefined): string[] | null {
  if (!audioFormat) {
    return null; // No filtering if format unknown
  }

  const formatType = classifyAudioFormat(audioFormat);

  switch (formatType) {
    case AudioFormatType.DolbyAtmos:
      return dolbyAtmosModes;
    case AudioFormatType.DolbyTrueHD:
      return dolbyTrueHDModes;
    case AudioFormatType.DolbyDigital:
      return dolbyDigitalModes;
    case AudioFormatType.DTSX:
      return dtsXModes;
    case AudioFormatType.DTSHD:
      return dtsHDModes;
    case AudioFormatType.DTS:
      return dtsModes;
    case AudioFormatType.Multichannel:
      return multichannelPCMModes;
    case AudioFormatType.PCM:
      return stereoCompatibleModes;
    case AudioFormatType.Analog:
      return analogModes;
    case AudioFormatType.Stereo:
      return stereoCompatibleModes;
    default:
      return stereoCompatibleModes;
  }
}
