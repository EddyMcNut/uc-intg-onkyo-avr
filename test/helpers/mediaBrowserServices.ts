// Service browsers and media browser on the test registry. The browsers keep no state of their own (it lives in the
// registry), so tests can use these alongside components that were given the same registry.
import { MediaBrowserServices } from "../../src/mediaBrowserServices.js";
import { MediaBrowser } from "../../src/mediaBrowser.js";
import type { AvrStateApi } from "../../src/types.js";
import { testAvrContexts } from "./contexts.js";
import { testConfigStore } from "./configStore.js";

export const testMediaBrowserServices = new MediaBrowserServices(testAvrContexts, testConfigStore);

// A media browser on the component's own state API: browseMedia reads source and sub-source from it.
export const testMediaBrowser = (avrStateApi: Pick<AvrStateApi, "getSource" | "getSubSource">): MediaBrowser => new MediaBrowser(avrStateApi, testMediaBrowserServices);
