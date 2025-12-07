export let avrCurrentSource: string = "unknown";

const integrationName = "Onkyo-Integration (state):";

export function setAvrCurrentSource(source: string, eiscpInstance?: any, zone?: string, entityId?: string, driver?: any) {
  // Check if source has really changed
  if (avrCurrentSource !== source) {
    console.log("%s [%s] source changed from '%s' to '%s'", integrationName, entityId || '', avrCurrentSource, source);
    avrCurrentSource = source;
    
    // Trigger volume query and clear media attributes if eiscp instance and zone are provided
    if (eiscpInstance && zone && driver && entityId) {
      console.log("%s [%s] querying volume for zone '%s'", integrationName, entityId, zone);
      eiscpInstance.command({ zone, command: "volume", args: "query" });
      
      // Clear media attributes so they can be updated with new data, prevents showing old data if new source does not deliver similar info
      driver.updateEntityAttributes(entityId, {
        MediaArtist: "",
        MediaTitle: "",
        MediaAlbum: "",
        MediaImageUrl: "",
        MediaPosition: "",
        MediaDuration: ""
      });
    }
  } else {
    avrCurrentSource = source;
  }
}
