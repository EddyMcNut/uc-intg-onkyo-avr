export let avrCurrentSource: string = "unknown";
export let avrCurrentSubSource: string = "unknown";

const integrationName = "Onkyo-Integration (state):";

// Helper to query AVR state and clear media attributes on source change
function refreshAvrState(eiscpInstance?: any, zone?: string, entityId?: string, driver?: any) {
  if (eiscpInstance && zone && driver && entityId) {
    console.log("%s [%s] querying volume for zone '%s'", integrationName, entityId, zone);
    eiscpInstance.command({ zone, command: "volume", args: "query" });
    
    // Clear media attributes so they can be updated with new data, prevents showing old data if new source does not deliver similar info
    driver.updateEntityAttributes(entityId, {
      MediaArtist: "",
      MediaTitle: "",
      MediaAlbum: "",
      MediaImageUrl: "",
      MediaPosition: 0,
      MediaDuration: 0
    });

    // Reset Audio/Video sensors
    console.log("%s [%s] querying AV-info for zone '%s'", integrationName, entityId, zone);
    eiscpInstance.command({ zone, command: "audio-information", args: "query" });
    eiscpInstance.command({ zone, command: "video-information", args: "query" });

    // to make sure the sensor also updates (in case a message is missed)
    eiscpInstance.command({ zone, command: "input-selector", args: "query" });
    eiscpInstance.command({ zone, command: "fp-display", args: "query" });
  }
}

export function setAvrCurrentSource(source: string, eiscpInstance?: any, zone?: string, entityId?: string, driver?: any) {
  // Check if source has really changed
  if (avrCurrentSource !== source) {
    console.log("%s [%s] source changed from '%s' to '%s'", integrationName, entityId || '', avrCurrentSource, source);
    avrCurrentSource = source;
   
    refreshAvrState(eiscpInstance, zone, entityId, driver);
  }
}

export function setAvrCurrentSubSource(subSource: string, eiscpInstance?: any, zone?: string, entityId?: string, driver?: any) {
  // Check if sub-source has really changed
  if (avrCurrentSubSource !== subSource) {
    console.log("%s [%s] sub-source changed from '%s' to '%s'", integrationName, entityId || '', avrCurrentSubSource, subSource);
    avrCurrentSubSource = subSource;

    refreshAvrState(eiscpInstance, zone, entityId, driver);
  }
}