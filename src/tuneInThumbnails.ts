import type { TuneInBrowseState } from "./tuneInBrowserStore.js";
import { createServiceThumbnails } from "./serviceThumbnails.js";

const { createBackdrop, getOrCreateThumbnail } = createServiceThumbnails({
  svgFileName: "tunein.svg",
  logoTransform: "translate(202 228) scale(.38)",
  logoPathAttrs: 'fill="#17245f" fill-rule="evenodd" clip-rule="evenodd"',
  backgroundColor: "rgb(20,216,204)",
  fallbackLabel: "tunein",
  fallbackLabelColor: "#17245f",
  fallbackBgOpacity: ".22",
  textColor: "#17245f",
  fallbackIcon: "icon://uc:radio",
  logName: "TuneIn"
});

export function createTuneInBackdrop(): string {
  return createBackdrop();
}

export function getOrCreateTuneInThumbnail(state: TuneInBrowseState, title: string): string {
  return getOrCreateThumbnail(state, title);
}
