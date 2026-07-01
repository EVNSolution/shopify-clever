const APP_GENERATED_MAP_IMAGE_ID_PREFIXES = ["orders-map-pin", "route-detail-"];

function isAppGeneratedMapImageId(imageId) {
  return APP_GENERATED_MAP_IMAGE_ID_PREFIXES.some((prefix) => imageId === prefix || imageId.startsWith(prefix));
}

export function installMissingMapImageFallback(map) {
  if (!map || typeof map.on !== "function") return;

  map.on("styleimagemissing", (event) => {
    addTransparentFallbackImage(map, event?.id);
  });
}

function addTransparentFallbackImage(map, imageId) {
  if (typeof imageId !== "string" || imageId.trim() === "") return;
  if (isAppGeneratedMapImageId(imageId)) return;
  if (typeof map.addImage !== "function") return;
  if (typeof map.hasImage === "function" && map.hasImage(imageId)) return;

  try {
    map.addImage(imageId, {
      data: new Uint8Array([0, 0, 0, 0]),
      height: 1,
      width: 1,
    });
  } catch {
    // MapLibre can race when several style layers request the same missing sprite.
  }
}
