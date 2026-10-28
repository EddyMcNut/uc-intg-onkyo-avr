export type SetupFlowPage = { kind: "idle" } | { kind: "manual"; page: 1 | 2 | 3 } | { kind: "inputSources"; page: number; total: number } | { kind: "listeningModes"; page: number; total: number };

export const IDLE_SETUP_PAGE: SetupFlowPage = { kind: "idle" };
