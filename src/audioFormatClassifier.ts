// Shared audio format classification — single source of truth for detecting format type from an IFA audio input string.

/** Audio format type categories for listening-mode filtering */
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

// Detect audio format category from an IFA audio input string. Returns the AudioFormatType enum value, or null for stereo (default).
export function classifyAudioFormat(audioInput: string): AudioFormatType | null {
  if (!audioInput) {
    return null;
  }

  const input = audioInput.toLowerCase();

  // Dolby formats
  if (input.includes("atmos")) return AudioFormatType.DolbyAtmos;
  if (input.includes("truehd") || input.includes("true hd")) return AudioFormatType.DolbyTrueHD;
  if (input.includes("dolby") || input.includes("ac3") || input.includes("dd") || input.includes("ac-3")) return AudioFormatType.DolbyDigital;

  // DTS formats
  if (input.includes("dts:x") || input.includes("dts-x")) return AudioFormatType.DTSX;
  if (input.includes("dts-hd") || input.includes("dts hd") || input.includes("dts-ma") || input.includes("dts ma")) return AudioFormatType.DTSHD;
  if (input.includes("dts")) return AudioFormatType.DTS;

  // PCM formats — differentiate multichannel vs stereo
  if (input.includes("pcm") || input.includes("lpcm")) {
    if (input.includes("multichannel") || input.includes("multi") || input.match(/[5-9]\.\d/) !== null) {
      return AudioFormatType.Multichannel;
    }
    return AudioFormatType.PCM;
  }

  // Analog
  if (input.includes("analog") || input.includes("analogue")) return AudioFormatType.Analog;

  // Default: stereo
  return AudioFormatType.Stereo;
}

/** Human-readable display name for each audio format type. */
export function formatAudioTypeName(type: AudioFormatType | null): string {
  switch (type) {
    case AudioFormatType.DolbyAtmos:
      return "Dolby Atmos";
    case AudioFormatType.DolbyTrueHD:
      return "Dolby TrueHD";
    case AudioFormatType.DolbyDigital:
      return "Dolby Digital";
    case AudioFormatType.DTSX:
      return "DTS:X";
    case AudioFormatType.DTSHD:
      return "DTS-HD";
    case AudioFormatType.DTS:
      return "DTS";
    case AudioFormatType.Multichannel:
      return "Multichannel PCM";
    case AudioFormatType.PCM:
      return "PCM Stereo";
    case AudioFormatType.Analog:
      return "Analog";
    case AudioFormatType.Stereo:
      return "Stereo";
    default:
      return "unknown";
  }
}
