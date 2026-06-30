const CLEVER_MAPLIBRE_DEFAULT_OPTIONS = {
  cooperativeGestures: true,
  scrollZoom: true,
};

export function createMapLibreMap(maplibregl, options) {
  return new maplibregl.Map({
    ...CLEVER_MAPLIBRE_DEFAULT_OPTIONS,
    ...options,
  });
}
