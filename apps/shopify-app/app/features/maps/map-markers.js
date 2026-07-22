export const MAP_MARKER_PALETTE = {
  departure: {
    color: "#008060",
  },
  order: {
    color: "#006fbb",
    shadowColor: "rgba(0, 111, 187, 0.36)",
  },
  plannedOrder: {
    color: "#006fbb",
    shadowColor: "rgba(0, 111, 187, 0.36)",
  },
};

export const MAP_PIN_PATH =
  "M20 50C20 50 4 31.5 4 18C4 9.16 11.16 2 20 2s16 7.16 16 16c0 13.5-16 32-16 32Z";
export const MAP_PIN_PIXEL_RATIO = 2;
export const MAP_PIN_ICON_SIZE = 0.54;
export const MAP_PIN_SYMBOL_LAYOUT = {
  "icon-allow-overlap": true,
  "icon-anchor": "bottom",
  "icon-ignore-placement": true,
  "icon-size": MAP_PIN_ICON_SIZE,
};
const DEPARTURE_HOUSE_ICON_PATH = "M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z";

export function createDepartureMarkerElement(departureLocation, options = {}) {
  const markerElement = document.createElement("button");
  const markerPinElement = document.createElement("span");
  markerElement.type = "button";
  markerElement.className = "departure-map-marker";
  markerElement.style.zIndex = options.zIndex ?? "3000";
  markerElement.style.setProperty("--map-marker-color", MAP_MARKER_PALETTE.departure.color);
  markerElement.setAttribute("aria-label", `Route start: ${departureLocation.name}`);
  markerPinElement.className = "departure-map-marker__pin";
  markerPinElement.append(createDepartureMarkerIconElement());
  markerElement.append(markerPinElement);

  return markerElement;
}

export function createDepartureMarkerIconElement() {
  const iconElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const iconPathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");

  iconElement.classList.add("departure-map-marker__icon");
  iconElement.setAttribute("viewBox", "0 0 20 20");
  iconElement.setAttribute("aria-hidden", "true");
  iconPathElement.setAttribute(
    "d",
    "M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z",
  );
  iconElement.append(iconPathElement);

  return iconElement;
}

export function createDotMarkerElement({ ariaHidden = true, className, color, zIndex }) {
  const markerElement = document.createElement("span");

  markerElement.className = className;
  markerElement.style.zIndex = zIndex;
  if (color) markerElement.style.setProperty("--map-marker-color", color);
  if (ariaHidden) markerElement.setAttribute("aria-hidden", "true");

  return markerElement;
}

export function createMapPinImageData(color, options = {}) {
  const pixelRatio = options.pixelRatio ?? MAP_PIN_PIXEL_RATIO;
  const width = (options.width ?? 40) * pixelRatio;
  const height = (options.height ?? 52) * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.scale(pixelRatio, pixelRatio);
  const pinPath = new Path2D(options.path ?? MAP_PIN_PATH);
  context.fillStyle = color;
  context.strokeStyle = options.strokeStyle ?? "#ffffff";
  context.lineJoin = "round";
  context.lineWidth = options.borderWidth ?? 3.2;
  context.shadowBlur = options.shadowBlur ?? 4;
  context.shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.32)";
  context.shadowOffsetY = options.shadowOffsetY ?? 2;
  context.fill(pinPath);
  context.shadowColor = "transparent";
  context.stroke(pinPath);

  if (options.label) {
    context.fillStyle = options.labelColor ?? "#ffffff";
    context.font = `700 ${options.labelFontSize ?? (String(options.label).length > 1 ? 15 : 17)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(options.label), 20, 18);
  }

  return context.getImageData(0, 0, width, height);
}

export function createDepartureMarkerImageData(options = {}) {
  const pixelRatio = options.pixelRatio ?? MAP_PIN_PIXEL_RATIO;
  const width = 26 * pixelRatio;
  const height = 34 * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = options.color ?? MAP_MARKER_PALETTE.departure.color;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.shadowBlur = 9;
  context.shadowColor = "rgba(0, 0, 0, 0.3)";
  context.shadowOffsetY = 3;

  context.save();
  context.translate(13, 25);
  context.rotate(Math.PI / 4);
  context.fillRect(-4.5, -4.5, 9, 9);
  context.strokeRect(-4.5, -4.5, 9, 9);
  context.restore();

  context.beginPath();
  context.arc(13, 13, 12, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.stroke();

  context.fillStyle = "#ffffff";
  context.save();
  context.translate(6.5, 6);
  context.scale(0.65, 0.65);
  context.fill(new Path2D(DEPARTURE_HOUSE_ICON_PATH));
  context.restore();

  return context.getImageData(0, 0, width, height);
}

export function createMapBadgeImageData(color, options = {}) {
  const pixelRatio = options.pixelRatio ?? MAP_PIN_PIXEL_RATIO;
  const size = options.size ?? 28;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size * pixelRatio;
  canvas.height = size * pixelRatio;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.scale(pixelRatio, pixelRatio);
  context.beginPath();
  context.arc(center, center, options.radius ?? 11, 0, Math.PI * 2);
  context.fillStyle = color;
  context.strokeStyle = options.strokeStyle ?? "#ffffff";
  context.lineWidth = options.borderWidth ?? 2;
  context.shadowBlur = options.shadowBlur ?? 3;
  context.shadowColor = options.shadowColor ?? "rgba(0, 0, 0, 0.26)";
  context.shadowOffsetY = options.shadowOffsetY ?? 1;
  context.fill();
  context.shadowColor = "transparent";
  context.stroke();

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function createPaletteMapPinImageData(markerType, options = {}) {
  const paletteEntry = MAP_MARKER_PALETTE[markerType];
  if (!paletteEntry) return null;

  return createMapPinImageData(paletteEntry.color, {
    shadowColor: paletteEntry.shadowColor,
    ...options,
  });
}

export function addMapPinImage(map, imageId, imageData) {
  if (!imageData || typeof map?.hasImage !== "function" || typeof map?.addImage !== "function") {
    return false;
  }
  if (map.hasImage(imageId)) return true;

  map.addImage(imageId, imageData, { pixelRatio: MAP_PIN_PIXEL_RATIO });
  return true;
}

export function createMapPinSymbolLayer({ id, source, iconImage = ["get", "pinImage"], iconSize = MAP_PIN_ICON_SIZE, sortKey = ["get", "sortKey"] }) {
  return {
    id,
    type: "symbol",
    source,
    layout: {
      ...MAP_PIN_SYMBOL_LAYOUT,
      "icon-image": iconImage,
      "icon-size": iconSize,
      "symbol-sort-key": sortKey,
    },
  };
}
