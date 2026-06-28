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
  "_front_panel_display_sensor"
] as const;

export const SELECT_SUFFIXES = ["_listening_mode", "_input_selector"] as const;

/** All sensor/select suffixes (for use in regex construction, etc.) */
export const ALL_SUFFIXES = [...SENSOR_SUFFIXES, ...SELECT_SUFFIXES] as readonly string[];
