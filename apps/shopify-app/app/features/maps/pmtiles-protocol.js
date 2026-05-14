const PMTILES_PROTOCOL_NAME = "pmtiles";
const PMTILES_PROTOCOL_KEY = "__tomatonoPmtilesProtocolInstalled";

export function installPmtilesProtocol(maplibregl, Protocol) {
  if (!maplibregl || !Protocol || typeof window === "undefined") {
    return;
  }

  if (window[PMTILES_PROTOCOL_KEY]) {
    return;
  }

  const protocol = new Protocol({ metadata: true });
  maplibregl.addProtocol(PMTILES_PROTOCOL_NAME, protocol.tile);
  window[PMTILES_PROTOCOL_KEY] = true;
}
