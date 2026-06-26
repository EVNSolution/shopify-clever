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
  routeStop: {
    color: "#303030",
  },
  snappedStop: {
    color: "#1473e6",
  },
};

export const MAP_PIN_PATH =
  "M20 50C20 50 4 31.5 4 18C4 9.16 11.16 2 20 2s16 7.16 16 16c0 13.5-16 32-16 32Z";

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

export function createNumberedMarkerElement({
  ariaLabel,
  className,
  color,
  label,
  labelClassName,
  zIndex,
}) {
  const markerElement = document.createElement("button");
  const labelElement = document.createElement("span");

  markerElement.type = "button";
  markerElement.className = className;
  markerElement.style.zIndex = zIndex;
  if (color) markerElement.style.setProperty("--map-marker-color", color);
  markerElement.setAttribute("aria-label", ariaLabel);
  labelElement.className = labelClassName;
  labelElement.textContent = String(label);
  markerElement.append(labelElement);

  return markerElement;
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
  const pixelRatio = options.pixelRatio ?? 2;
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
