import type { TidalBrowseState } from "./tidalBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";

const { createBackdrop, getOrCreateThumbnail } = createServiceThumbnails({
  svgFileName: "tidal.svg",
  logoTransform: "translate(135 180) scale(.20655)",
  logoPathAttrs: 'fill="#ffffff"',
  backgroundColor: "#000000",
  fallbackLabel: "TIDAL",
  fallbackLabelColor: "#00fecc",
  fallbackBgOpacity: ".15",
  textColor: "#00fecc",
  fallbackIcon: "icon://uc:music",
  logName: "Tidal"
});

export function createTidalBackdrop(): string {
  return createBackdrop();
}

export function getOrCreateTidalThumbnail(state: TidalBrowseState, title: string): string {
  return getOrCreateThumbnail(state, title);
}
