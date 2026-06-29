const CLEVER_MAPLIBRE_DEFAULT_OPTIONS = {
  cooperativeGestures: true,
};

export function createMapLibreMap(maplibregl, options) {
  return new maplibregl.Map({
    ...options,
    ...CLEVER_MAPLIBRE_DEFAULT_OPTIONS,
  });
}
