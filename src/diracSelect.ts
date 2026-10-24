import { eiscpMappings } from "./eiscp-mappings.js";

// Display order in the select entity.
const DIRAC_DISPLAY_ORDER = ["off", "slot1", "slot2", "slot3"] as const;

const DIRAC_SERVICE_TO_LABEL: Record<string, string> = {
  off: "Off",
  slot1: "Slot 1",
  slot2: "Slot 2",
  slot3: "Slot 3"
};

const DSS_VALUES = eiscpMappings.value_mappings.DSS;

// Fixed Dirac options shown in the UC UI, in display order.
export const DIRAC_OPTION_LABELS: string[] = DIRAC_DISPLAY_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(DSS_VALUES, key)).map((key) => DIRAC_SERVICE_TO_LABEL[key]);

// Translate a UI option label ("Slot 1") to its eiscp service key ("slot1").
export function diracOptionToServiceKey(label: string): string {
  const entry = Object.entries(DIRAC_SERVICE_TO_LABEL).find(([, value]) => value === label);
  return entry ? entry[0] : label;
}

// Translate an eiscp service key ("slot1") to its UI option label ("Slot 1").
export function diracServiceKeyToOption(key: string): string {
  return DIRAC_SERVICE_TO_LABEL[key] ?? key;
}

// Response values reported by the AVR on a DSS QSTN query.
const DIRAC_RESPONSE_TO_COMMAND_VALUE: Record<string, string> = {
  "100": "C00",
  "200": "C01",
  "300": "C02",
  "400": "C03"
};

// Translate a raw DSS query response value ("100", "200", ...) to its eiscp command value ("C00", "C01", ...). Unknown values pass through unchanged.
export function diracResponseToCommandValue(rawValue: string): string {
  return DIRAC_RESPONSE_TO_COMMAND_VALUE[rawValue] ?? rawValue;
}
