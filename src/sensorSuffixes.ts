// Single source of truth for sensor/select entity ID suffixes.

export const SENSOR_SUFFIXES = [
  "_mute_sensor",
  "_volume_sensor",
  "_source_sensor",
  "_audio_input_sensor",
  "_audio_output_sensor",
  "_video_input_sensor",
  "_video_output_sensor",
  "_output_display_sensor",
  "_front_panel_display_sensor",
  "_treble_sensor",
  "_bass_sensor",
  "_vocal_sensor",
  "_temp_center_sensor",
  "_temp_subwoofer_sensor"
] as const;

export const SELECT_SUFFIXES = {
  listeningMode: "_listening_mode",
  inputSelector: "_input_selector",
  tunerPresets: "_tuner_presets",
  dirac: "_dirac"
} as const;

/** Suffix used for the optional remote entity. */
export const REMOTE_SUFFIX = "_remote";

/** All sensor/select suffixes (for use in regex construction, etc.) */
export const ALL_SUFFIXES = [...SENSOR_SUFFIXES, ...Object.values(SELECT_SUFFIXES), REMOTE_SUFFIX] as readonly string[];
