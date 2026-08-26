/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { createMapLibreMap } from "../maps/maplibre-map";
import { installMissingMapImageFallback } from "../maps/maplibre-missing-images";
import { MapPanel, MapToolbar, renderMapFitIcon, renderMapZoomInIcon, renderMapZoomOutIcon } from "../../ui/map-panel";

const OPENFREEMAP_STYLE_URL = "/vendor/openfreemap-liberty.json";
const DEFAULT_SETTINGS_MAP_CENTER = [-79.4163, 43.787];
const DEFAULT_SETTINGS_MAP_ZOOM = 10;
const SETTINGS_MAP_COORDINATE_ZOOM = 14;

const settingsMapFrameStyle = {
  border: "1px solid #c9c9c9",
  borderRadius: "10px",
  height: "300px",
};

function coordinateToLngLat(coordinate) {
  return [coordinate.longitude, coordinate.latitude];
}

export function LocationPreviewMap({ ariaLabel = "Location map", coordinate, onCoordinateChange, readOnly = false }) {
  const initialCoordinateRef = useRef(coordinate);
  const mapContainerRef = useRef(null);
  const mapLibraryRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onCoordinateChangeRef = useRef(onCoordinateChange);
  const [isMapReady, setIsMapReady] = useState(false);
  const latitude = coordinate?.latitude;
  const longitude = coordinate?.longitude;

  useEffect(() => {
    onCoordinateChangeRef.current = onCoordinateChange;
  }, [onCoordinateChange]);

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      const { default: maplibregl } = await import("maplibre-gl");

      if (!isMounted || !mapContainerRef.current || mapRef.current) return;

      mapLibraryRef.current = maplibregl;
      mapRef.current = createMapLibreMap(maplibregl, {
        attributionControl: { compact: true },
        center: initialCoordinateRef.current
          ? coordinateToLngLat(initialCoordinateRef.current)
          : DEFAULT_SETTINGS_MAP_CENTER,
        container: mapContainerRef.current,
        fadeDuration: 0,
        style: OPENFREEMAP_STYLE_URL,
        zoom: initialCoordinateRef.current
          ? SETTINGS_MAP_COORDINATE_ZOOM
          : DEFAULT_SETTINGS_MAP_ZOOM,
      });
      installMissingMapImageFallback(mapRef.current);
      mapRef.current.on("load", () => {
        if (isMounted) setIsMapReady(true);
      });
      if (!readOnly) {
        mapRef.current.on("click", (event) => {
          onCoordinateChangeRef.current?.({
            latitude: event.lngLat.lat,
            longitude: event.lngLat.lng,
          });
        });
      }
    };

    initializeMap();

    return () => {
      isMounted = false;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibraryRef.current = null;
    };
  }, [readOnly]);

  const handleFitHighlightedMapMarkers = useCallback(() => {
    if (latitude == null || longitude == null || !mapRef.current) return;

    mapRef.current.easeTo({
      center: [longitude, latitude],
      duration: 300,
      zoom: SETTINGS_MAP_COORDINATE_ZOOM,
    });
  }, [latitude, longitude]);

  const handleZoomInMap = () => {
    mapRef.current?.zoomIn({ duration: 250 });
  };

  const handleZoomOutMap = () => {
    mapRef.current?.zoomOut({ duration: 250 });
  };

  useEffect(() => {
    const maplibregl = mapLibraryRef.current;
    const map = mapRef.current;

    if (!maplibregl || !map || !isMapReady) return;

    if (latitude == null || longitude == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat = [longitude, latitude];

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        color: "#008060",
        draggable: !readOnly,
      })
        .setLngLat(lngLat)
        .addTo(map);
      if (!readOnly) {
        markerRef.current.on("dragend", () => {
          const markerLngLat = markerRef.current?.getLngLat();
          if (!markerLngLat) return;

          onCoordinateChangeRef.current?.({
            latitude: markerLngLat.lat,
            longitude: markerLngLat.lng,
          });
        });
      }
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    map.easeTo({
      center: lngLat,
      duration: 300,
      zoom: Math.max(map.getZoom(), SETTINGS_MAP_COORDINATE_ZOOM),
    });
  }, [latitude, longitude, isMapReady, readOnly]);

  return (
    <MapPanel
      ariaLabel={ariaLabel}
      canvasRef={mapContainerRef}
      frameStyle={settingsMapFrameStyle}
      toolbar={
        <MapToolbar
          actions={[
            {
              ariaLabel: "Zoom map in",
              icon: renderMapZoomInIcon(),
              onClick: handleZoomInMap,
            },
            {
              ariaLabel: "Zoom map out",
              icon: renderMapZoomOutIcon(),
              onClick: handleZoomOutMap,
            },
            {
              ariaLabel: "Fit highlighted map markers",
              disabled: latitude == null || longitude == null,
              icon: renderMapFitIcon(),
              onClick: handleFitHighlightedMapMarkers,
            },
          ]}
        />
      }
    />
  );
}

export function SettingsDepartureMap(props) {
  return <LocationPreviewMap {...props} ariaLabel="Departure location map" />;
}
