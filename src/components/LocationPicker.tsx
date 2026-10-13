"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

export interface Pin {
  lat: number;
  lon: number;
}
export function LocationPicker({
  value,
  onChange,
  original,
  readOnly = false,
}: {
  value: Pin;
  onChange?: (pin: Pin) => void;
  original?: Pin;
  readOnly?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState({
    lat: String(value.lat),
    lon: String(value.lon),
  });
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map | undefined;
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
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{ id: "streets", type: "raster", source: "streets" }],
        },
        attributionControl: { compact: true },
      });
      map.current = instance;
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
      if (original)
        new maplibregl.Marker({ color: "#64748b" })
          .setLngLat([original.lon, original.lat])
          .addTo(instance);
      instance.on("click", (e) => {
        if (!readOnly) {
          setAccuracy(null);
          change.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        }
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
      instance?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [readOnly]);
  useEffect(() => {
    marker.current?.setLngLat([value.lon, value.lat]);
    map.current?.easeTo({ center: [value.lon, value.lat], duration: 350 });
    setManual({
      lat: String(Number(value.lat.toFixed(6))),
      lon: String(Number(value.lon.toFixed(6))),
    });
  }, [value.lat, value.lon]);
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
  return (
    <div className="space-y-3">
      <div
        ref={container}
        className="h-72 sm:h-80 rounded-xl overflow-hidden border border-slate-700"
        aria-label="Location map"
      />
      {!readOnly && (
        <div className="flex flex-wrap justify-between gap-2 items-center">
          <p className="text-sm text-slate-400">
            Tap the map or drag the blue pin.
            {original && " Grey marks the current issue location."}
          </p>
          <button
            type="button"
            className="evidence-secondary"
            disabled={locating}
            onClick={locate}
          >
            {locating ? "Finding your location…" : "Use my location"}
          </button>
        </div>
      )}
      {readOnly && original && (
        <p className="text-sm text-slate-400">
          Blue: proposed location. Grey: original issue location.
        </p>
      )}
      {accuracy !== null && (
        <p role="status" className="text-sm text-cyan-200">
          GPS accuracy: approximately {Math.round(accuracy)} m. Adjust the pin
          to the issue’s exact location.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      )}
      {!readOnly && (
        <details open={!!error}>
          <summary className="cursor-pointer text-sm text-slate-400">
            Enter coordinates instead
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="text-sm">
              Latitude
              <input
                className="evidence-input"
                inputMode="decimal"
                value={manual.lat}
                onChange={(e) => setManual({ ...manual, lat: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Longitude
              <input
                className="evidence-input"
                inputMode="decimal"
                value={manual.lon}
                onChange={(e) => setManual({ ...manual, lon: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            className="evidence-secondary mt-3"
            onClick={() => {
              const lat = Number(manual.lat),
                lon = Number(manual.lon);
              if (
                !manual.lat.trim() ||
                !manual.lon.trim() ||
                !Number.isFinite(lat) ||
                !Number.isFinite(lon) ||
                Math.abs(lat) > 90 ||
                Math.abs(lon) > 180
              ) {
                setError(
                  "Enter latitude between −90 and 90 and longitude between −180 and 180.",
                );
                return;
              }
              setError("");
              setAccuracy(null);
              change.current?.({ lat, lon });
            }}
          >
            Place pin at coordinates
          </button>
        </details>
      )}
      <p className="text-xs text-slate-400 font-mono">
        {value.lat.toFixed(6)}, {value.lon.toFixed(6)}
      </p>
    </div>
  );
}
