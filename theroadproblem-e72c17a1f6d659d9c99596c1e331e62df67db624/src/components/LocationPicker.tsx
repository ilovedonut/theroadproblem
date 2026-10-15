"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

export interface Pin {
  lat: number;
  lon: number;
}

export interface RoadCandidate {
  segment_id: string;
  road_id?: string;
  road_name?: string;
  road_ref?: string;
  road_class?: string;
  distance_m?: number;
  display_label?: string;
  grade_label?: string;
  geometry?: any;
  geom_geojson?: string;
}

export function LocationPicker({
  value,
  onChange,
  original,
  readOnly = false,
  candidates = [],
  selectedSegmentId = null,
  onSelectSegment,
}: {
  value: Pin;
  onChange?: (pin: Pin) => void;
  original?: Pin;
  readOnly?: boolean;
  candidates?: RoadCandidate[];
  selectedSegmentId?: string | null;
  onSelectSegment?: (segmentId: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const selectSegmentRef = useRef(onSelectSegment);
  selectSegmentRef.current = onSelectSegment;

  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState({
    lat: String(value.lat),
    lon: String(value.lon),
  });

  // Initialize Map
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map | undefined;
    let themeObserver: MutationObserver | undefined;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [value.lon, value.lat],
        zoom: 15,
        style: {
          version: 8,
          sources: {
            streets: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors (ODbL 1.0)",
            },
          },
          layers: [{ id: "streets", type: "raster", source: "streets" }],
        },
        attributionControl: { compact: true },
      });
      map.current = instance;
      const applyMapTheme = () => {
        if (!instance?.getLayer("streets")) return;
        const dark = document.documentElement.classList.contains("dark");
        instance.setPaintProperty("streets", "raster-brightness-max", dark ? 0.45 : 1);
        instance.setPaintProperty("streets", "raster-saturation", dark ? -0.65 : 0);
      };
      instance.on("load", applyMapTheme);
      themeObserver = new MutationObserver(applyMapTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      marker.current = new maplibregl.Marker({
        color: "#0891b2",
        draggable: !readOnly,
      })
        .setLngLat([value.lon, value.lat])
        .addTo(instance);

      marker.current
        .getElement()
        .setAttribute(
          "aria-label",
          readOnly
            ? "Selected evidence location"
            : "Evidence location marker; drag to move",
        );

      marker.current.on("dragend", () => {
        const p = marker.current!.getLngLat();
        setAccuracy(null);
        change.current?.({ lat: p.lat, lon: p.lng });
      });

      if (original) {
        new maplibregl.Marker({ color: "#64748b" })
          .setLngLat([original.lon, original.lat])
          .addTo(instance);
      }

      instance.on("click", (e) => {
        if (!readOnly) {
          setAccuracy(null);
          change.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        }
      });

      instance.on("load", () => {
        // Source for unselected candidates
        if (!instance!.getSource("candidate-segments")) {
          instance!.addSource("candidate-segments", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });

          instance!.addLayer({
            id: "candidate-segments-lines",
            type: "line",
            source: "candidate-segments",
            paint: {
              "line-color": "#475569",
              "line-width": 4,
              "line-opacity": 0.8,
            },
          });
        }

        // Source for selected highlighted segment
        if (!instance!.getSource("selected-segment")) {
          instance!.addSource("selected-segment", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });

          instance!.addLayer({
            id: "selected-segment-glow",
            type: "line",
            source: "selected-segment",
            paint: {
              "line-color": "#06b6d4",
              "line-width": 10,
              "line-opacity": 0.35,
            },
          });

          instance!.addLayer({
            id: "selected-segment-line",
            type: "line",
            source: "selected-segment",
            paint: {
              "line-color": "#22d3ee",
              "line-width": 5,
              "line-opacity": 1.0,
            },
          });
        }

        instance!.on("click", "candidate-segments-lines", (e) => {
          const feat = e.features?.[0];
          if (feat?.properties?.id && selectSegmentRef.current) {
            selectSegmentRef.current(feat.properties.id);
          }
        });
      });

      instance.on("error", () =>
        setError(
          "Map tiles could not load. You can still enter coordinates below.",
        ),
      );
    } catch {
      setError(
        "The map is unavailable on this device. Enter coordinates below.",
      );
    }

    return () => {
      themeObserver?.disconnect();
      instance?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [readOnly]);

  // Sync marker and center on coordinate update
  useEffect(() => {
    marker.current?.setLngLat([value.lon, value.lat]);
    map.current?.easeTo({ center: [value.lon, value.lat], duration: 350 });
    setManual({
      lat: String(Number(value.lat.toFixed(6))),
      lon: String(Number(value.lon.toFixed(6))),
    });
  }, [value.lat, value.lon]);

  // Sync candidate and selected road segment layers
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const updateLayers = () => {
      const allFeatures = (candidates || []).map((c) => {
        let geom = c.geometry;
        if (!geom && c.geom_geojson) {
          try {
            geom = JSON.parse(c.geom_geojson);
          } catch {}
        }
        return {
          type: "Feature" as const,
          properties: {
            id: c.segment_id,
            label: c.display_label || c.road_name,
          },
          geometry: geom || { type: "LineString", coordinates: [] },
        };
      });

      const unselectedFeatures = allFeatures.filter(
        (f) => f.properties.id !== selectedSegmentId,
      );
      const selectedFeatures = allFeatures.filter(
        (f) => f.properties.id === selectedSegmentId,
      );

      const candidateSource = m.getSource(
        "candidate-segments",
      ) as maplibregl.GeoJSONSource | undefined;
      if (candidateSource) {
        candidateSource.setData({
          type: "FeatureCollection",
          features: unselectedFeatures,
        });
      }

      const selectedSource = m.getSource(
        "selected-segment",
      ) as maplibregl.GeoJSONSource | undefined;
      if (selectedSource) {
        selectedSource.setData({
          type: "FeatureCollection",
          features: selectedFeatures,
        });
      }
    };

    if (m.isStyleLoaded()) {
      updateLayers();
    } else {
      m.once("load", updateLayers);
    }
  }, [candidates, selectedSegmentId]);

  function locate() {
    if (!navigator.geolocation) {
      setError(
        "Location access is unavailable. Tap the map or enter coordinates.",
      );
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setAccuracy(p.coords.accuracy);
        change.current?.({ lat: p.coords.latitude, lon: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setError(
          "Location access was denied or unavailable. Tap the map or enter coordinates.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function applyManual() {
    const lat = Number(manual.lat);
    const lon = Number(manual.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError("Enter valid decimal coordinates.");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setError("Coordinates out of range (-90..90, -180..180).");
      return;
    }
    setError("");
    change.current?.({ lat, lon });
  }

  return (
    <div className="space-y-3 font-sans">
      <div
        ref={container}
        className="h-72 sm:h-80 rounded-xl overflow-hidden border border-line relative"
        aria-label="Location map"
      />

      {!readOnly && (
        <div className="flex flex-wrap justify-between gap-2 items-center text-xs font-mono">
          <p className="text-muted">
            Tap map or drag cyan pin to position.
            {candidates.length > 0 && " Nearby road segments shown as lines."}
          </p>
          <button
            type="button"
            className="evidence-secondary"
            disabled={locating}
            onClick={locate}
          >
            {locating ? "Locating…" : "Use My GPS"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger font-mono">
          {error}
        </p>
      )}

      {/* Manual Coordinate Override */}
      <details className="text-xs font-mono text-muted">
        <summary className="cursor-pointer hover:text-ink">
          Manual Coordinates ({Number(value.lat).toFixed(5)}, {Number(value.lon).toFixed(5)})
        </summary>
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-line">
          <input
            type="text"
            className="w-28 px-2 py-1 bg-surface border border-line-strong rounded text-ink"
            placeholder="Latitude"
            value={manual.lat}
            onChange={(e) => setManual({ ...manual, lat: e.target.value })}
          />
          <input
            type="text"
            className="w-28 px-2 py-1 bg-surface border border-line-strong rounded text-ink"
            placeholder="Longitude"
            value={manual.lon}
            onChange={(e) => setManual({ ...manual, lon: e.target.value })}
          />
          <button
            type="button"
            onClick={applyManual}
            className="px-3 py-1 bg-cyan-950 border border-cyan-500/50 text-information rounded font-bold"
          >
            Apply
          </button>
        </div>
      </details>
    </div>
  );
}
