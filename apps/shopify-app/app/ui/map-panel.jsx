/* eslint-disable react/prop-types */
const mapPanelStyle = {
  overflow: "hidden",
  position: "relative",
  width: "100%",
};

const mapCanvasStyle = {
  height: "100%",
  width: "100%",
};

// ponytail: mirror MapLibre NavigationControl's control size/offset, but keep one React toolbar layer.
const MAPLIBRE_CONTROL_OFFSET_PX = 12;
const MAPLIBRE_CONTROL_SIZE_PX = 30;
const MAPLIBRE_CONTROL_BORDER_WIDTH_PX = 2;
const MAP_TOOLBAR_BORDER_COLOR = "#8a8a8a";
const MAP_TOOLBAR_DIVIDER_COLOR = MAP_TOOLBAR_BORDER_COLOR;

const mapToolbarStyle = {
  alignItems: "center",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  position: "absolute",
  right: `${MAPLIBRE_CONTROL_OFFSET_PX}px`,
  top: `${MAPLIBRE_CONTROL_OFFSET_PX}px`,
  zIndex: 2,
};

const mapToolbarGroupStyle = {
  background: "rgba(255, 255, 255, 0.94)",
  border: `${MAPLIBRE_CONTROL_BORDER_WIDTH_PX}px solid ${MAP_TOOLBAR_BORDER_COLOR}`,
  borderRadius: "8px",
  overflow: "hidden",
};

const mapToolbarItemStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "#303030",
  display: "flex",
  height: `${MAPLIBRE_CONTROL_SIZE_PX}px`,
  justifyContent: "center",
  padding: 0,
  width: `${MAPLIBRE_CONTROL_SIZE_PX}px`,
};

const mapToolbarDividerStyle = {
  borderTop: `${MAPLIBRE_CONTROL_BORDER_WIDTH_PX}px solid ${MAP_TOOLBAR_DIVIDER_COLOR}`,
};

const mapToolbarButtonStyle = {
  ...mapToolbarItemStyle,
  cursor: "pointer",
};

const disabledMapToolbarButtonStyle = {
  ...mapToolbarButtonStyle,
  color: "#8a8a8a",
  cursor: "not-allowed",
  opacity: 0.72,
};

const mapToolbarIconStyle = {
  display: "block",
  height: "16px",
  width: "16px",
};

const mapStatusStyle = {
  ...mapToolbarItemStyle,
  fontSize: "12px",
  fontWeight: 700,
};

export function MapPanel({
  ariaLabel,
  canvasKey,
  canvasRef,
  canvasStyle,
  frameStyle,
  id,
  toolbar,
}) {
  return (
    <div aria-label={ariaLabel} role="region" style={{ ...mapPanelStyle, ...frameStyle }}>
      {toolbar}
      <div
        aria-label={ariaLabel}
        id={id}
        key={canvasKey}
        ref={canvasRef}
        style={{ ...mapCanvasStyle, ...canvasStyle }}
      />
    </div>
  );
}

function getMapToolbarItemStyle(baseStyle, index) {
  return index === 0 ? baseStyle : { ...baseStyle, ...mapToolbarDividerStyle };
}

export function MapToolbar({ actions = [], statusLabel, statusGlyph }) {
  if (actions.length === 0 && !statusLabel) return null;

  const toolbarGroups = [actions.slice(0, 2), actions.slice(2, 4), actions.slice(4)].filter(
    (actionGroup) => actionGroup.length > 0,
  );
  if (statusLabel) {
    if (toolbarGroups.length === 0) toolbarGroups.push([]);
    toolbarGroups.at(-1).push({ ariaLabel: statusLabel, statusGlyph, type: "status" });
  }

  return (
    <div style={mapToolbarStyle}>
      {toolbarGroups.map((actionGroup, groupIndex) => (
        <div key={groupIndex} style={mapToolbarGroupStyle}>
          {actionGroup.map((action, actionIndex) =>
            action.type === "status" ? (
              <span
                aria-label={action.ariaLabel}
                key={action.ariaLabel}
                role="status"
                style={getMapToolbarItemStyle(mapStatusStyle, actionIndex)}
              >
                <span aria-hidden="true">{action.statusGlyph ?? "…"}</span>
              </span>
            ) : (
              <button
                aria-label={action.ariaLabel}
                disabled={action.disabled}
                key={action.ariaLabel}
                onClick={action.onClick}
                style={getMapToolbarItemStyle(
                  action.disabled ? disabledMapToolbarButtonStyle : mapToolbarButtonStyle,
                  actionIndex,
                )}
                type="button"
              >
                {action.icon}
              </button>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function renderMapToolbarIcon(children) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      style={mapToolbarIconStyle}
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}


export function renderMapZoomInIcon() {
  return renderMapToolbarIcon(
    <>
      <path d="M10 5v10" />
      <path d="M5 10h10" />
    </>,
  );
}

export function renderMapZoomOutIcon() {
  return renderMapToolbarIcon(<path d="M5 10h10" />);
}

export function renderMapRefreshIcon() {
  return renderMapToolbarIcon(
    <>
      <path d="M16 7a6 6 0 1 0 1 5" />
      <path d="M16 3v4h-4" />
    </>,
  );
}

export function renderMapFitIcon() {
  return renderMapToolbarIcon(
    <>
      <path d="M4.5 8V4.5H8" />
      <path d="M12 4.5h3.5V8" />
      <path d="M15.5 12v3.5H12" />
      <path d="M8 15.5H4.5V12" />
    </>,
  );
}

function renderMapExpandWidthIcon() {
  return renderMapToolbarIcon(
    <>
      <path d="m7 6-4 4 4 4" />
      <path d="m13 6 4 4-4 4" />
    </>,
  );
}

function renderMapRestoreWidthIcon() {
  return renderMapToolbarIcon(
    <>
      <path d="m3 6 4 4-4 4" />
      <path d="m17 6-4 4 4 4" />
    </>,
  );
}

export function renderMapWidthIcon(isWide) {
  return isWide ? renderMapRestoreWidthIcon() : renderMapExpandWidthIcon();
}
