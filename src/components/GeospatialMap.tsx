'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { Compass, Globe2, Map as MapIcon } from 'lucide-react';

export interface RoadFeature {
  id: string;
  name: string;
  display_name?: string;
  has_official_name?: boolean;
  ref: string | null;
  road_class: string;
  authority_name: string | null;
  state: string;
  district: string;
  total_length_m: string;
  segments?: Array<{
    segment_id: string;
    chainage_from: number;
    chainage_to: number;
    length_m: number;
    geojson: {
      type: string;
      coordinates: number[][];
    };
  }>;
  works?: Array<{
    work_id: string;
    package_name: string;
    authority_name: string;
    tender_id: string;
    contract_id: string;
    official_status: string;
    contract_value_inr: number;
    contractor_name: string;
    cin?: string;
    gstin?: string;
    start_date?: string;
    target_completion_date?: string;
    actual_completion_date?: string;
    defect_liability_end_date?: string;
  }>;
  incidents?: Array<{
    incident_id: string;
    category: string;
    lifecycle_status: string;
    verification_state: string;
    last_observed_at: string;
    lat: number;
    lon: number;
  }>;
}

export interface MultiSourceSignal {
  id: string;
  type: string;
  source: string;
  title: string;
  date: string;
  road_name: string;
  lat: number;
  lon: number;
  details: string;
  verified: boolean;
  source_url: string;
  status?: string;
  disclaimer?: string;
  is_demo?: boolean;
}

import { normaliseMapBounds, parseMapBounds, type MapBounds } from '@/lib/map-bounds';

interface GeospatialMapProps {
  onViewportChange?: (bounds: MapBounds, zoom?: number) => void;
  roads: RoadFeature[];
  signals: MultiSourceSignal[];
  selectedRoadId: string | null;
  onSelectRoad: (road: RoadFeature) => void;
  onSelectSignal: (signal: MultiSourceSignal) => void;
  activeLayerFilters: {
    officialWorks: boolean;
    excavations: boolean;
    newsSocial: boolean;
    verifiedIntact: boolean;
  };
  onToggleFilter: (key: 'officialWorks' | 'excavations' | 'newsSocial' | 'verifiedIntact') => void;
}

export function GeospatialMap({
  onViewportChange,
  roads,
  signals,
  selectedRoadId,
  onSelectRoad,
  onSelectSignal,
  activeLayerFilters,
  onToggleFilter,
}: GeospatialMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const signalPopupRef = useRef<maplibregl.Popup | null>(null);
  const roadPopupRef = useRef<maplibregl.Popup | null>(null);
  const signalsRef = useRef<MultiSourceSignal[]>(signals);
  signalsRef.current = signals;
  const roadsRef = useRef<RoadFeature[]>(roads);
  roadsRef.current = roads;
  const onSelectRoadRef = useRef(onSelectRoad);
  onSelectRoadRef.current = onSelectRoad;
  const onSelectSignalRef = useRef(onSelectSignal);
  onSelectSignalRef.current = onSelectSignal;
  const lastSwoopedRoadIdRef = useRef<string | null>(null);

  const viewportCallback = useRef(onViewportChange);
  viewportCallback.current = onViewportChange;

  const [mapLoaded, setMapLoaded] = useState(false);
  const [isGlobe, setIsGlobe] = useState(true);

  // Initialize MapLibre GL with 3D Globe Projection
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const darkGlobeStyle: any = {
      version: 8,
      projection: {
        type: 'globe'
      },
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'cosmic-space-background',
          type: 'background',
          paint: {
            'background-color': '#eee9df'
          }
        },
        {
          id: 'osm-globe-surface',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-brightness-max': 1,
            'raster-contrast': 0,
            'raster-saturation': 0
          }
        }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkGlobeStyle,
      center: [77.625, 12.92], // Bengaluru Urban pilot center
      zoom: 10.5,
      pitch: 42,
      bearing: -15,
      maxPitch: 75,
      minZoom: 1.5,
      maxZoom: 18,
      attributionControl: false
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'bottom-right'
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'theroadproblem.quest • Bengaluru Urban District Index'
      }),
      'bottom-left'
    );

    const applyMapTheme = () => {
      if (!map.getLayer('cosmic-space-background')) return;
      const dark = document.documentElement.classList.contains('dark');
      map.setPaintProperty('cosmic-space-background', 'background-color', dark ? '#211f1b' : '#eee9df');
    };
    const themeObserver = new MutationObserver(applyMapTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    let viewportReady = false;
    const publishBounds = () => {
      // Initialization and ResizeObserver emit moveend before the requested
      // location is fitted. Do not launch abandoned city-wide queries then.
      if (!viewportReady) return;
      const b = map.getBounds();
      const z = Number(map.getZoom().toFixed(2));
      viewportCallback.current?.(
        normaliseMapBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth()),
        z
      );
    };
    map.on('moveend', publishBounds);
    map.on('load', () => {
      applyMapTheme();
      try {
        (map as any).setProjection({ type: 'globe' });
      } catch (err) {
        console.warn('Globe projection initialization fallback:', err);
      }
      setMapLoaded(true);
      map.resize();
      const requested = parseMapBounds(new URLSearchParams(window.location.search).get('bbox'));
      if (requested) map.fitBounds([[requested[0], requested[1]], [requested[2], requested[3]]], { padding: 50, duration: 0 });
      viewportReady = true;
      publishBounds();
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      if (signalPopupRef.current) signalPopupRef.current.remove();
      if (roadPopupRef.current) roadPopupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Projection Toggle (Globe 3D vs Flat 2D)
  const toggleProjection = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIsGlobe = !isGlobe;
    setIsGlobe(nextIsGlobe);

    try {
      (map as any).setProjection({
        type: nextIsGlobe ? 'globe' : 'mercator'
      });
      if (!nextIsGlobe) {
        map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      } else {
        map.easeTo({ pitch: 42, bearing: -15, duration: 800 });
      }
    } catch (e) {
      console.warn('Failed to toggle projection:', e);
    }
  }, [isGlobe]);

  // Orbit Reset (Zoom back to global / national view)
  const flyToGlobalOrbit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [78.9629, 20.5937],
      zoom: 3.8,
      pitch: 35,
      bearing: 0,
      speed: 0.9,
      curve: 1.3,
      essential: true
    });
  }, []);

  // Smooth camera swoop only when selectedRoadId changes (does NOT re-swoop when viewport refreshes roads)
  useEffect(() => {
    const map = mapRef.current;
    if (!selectedRoadId) {
      lastSwoopedRoadIdRef.current = null;
      return;
    }
    if (!map || !mapLoaded || !roads || roads.length === 0) return;
    if (lastSwoopedRoadIdRef.current === selectedRoadId) return;

    const matchedRoad = roads.find((r) => r.id === selectedRoadId);
    if (!matchedRoad || !matchedRoad.segments || matchedRoad.segments.length === 0) return;

    const allCoords = matchedRoad.segments.flatMap((s) => s.geojson?.coordinates || []);
    if (allCoords.length === 0) return;

    lastSwoopedRoadIdRef.current = selectedRoadId;
    const midIdx = Math.floor(allCoords.length / 2);
    const centerCoord = allCoords[midIdx];

    map.flyTo({
      center: [centerCoord[0], centerCoord[1]],
      zoom: 13,
      pitch: 48,
      bearing: -15,
      speed: 1.1,
      essential: true
    });
  }, [selectedRoadId, roads, mapLoaded]);

  // Update Vector Road Networks on the Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !roads) return;

    const features: any[] = [];

    roads.forEach((road) => {
      const hasWorks = road.works && road.works.length > 0;
      const hasIncidents = road.incidents && road.incidents.length > 0;

      let statusColor = '#06b6d4';
      if (hasIncidents) {
        statusColor = '#f59e0b';
      } else if (hasWorks && road.works?.[0]?.official_status === 'officially_completed') {
        statusColor = '#10b981';
      }

      let isVisible = true;
      if (hasIncidents && !activeLayerFilters.excavations) isVisible = false;
      if (hasWorks && !hasIncidents && !activeLayerFilters.officialWorks) isVisible = false;

      if (isVisible && Array.isArray(road.segments)) {
        road.segments.forEach((seg) => {
          if (seg.geojson && seg.geojson.coordinates) {
            features.push({
              type: 'Feature',
              id: `${road.id}-${seg.segment_id}`,
              properties: {
                road_id: road.id,
                name: road.display_name || road.name,
                ref: road.ref || '',
                authority: road.authority_name || 'Authority unrecorded',
                status_color: statusColor,
                is_selected: road.id === selectedRoadId
              },
              geometry: seg.geojson
            });
          }
        });
      }
    });

    const geojsonData = {
      type: 'FeatureCollection',
      features
    };

    if (map.getSource('roads-network')) {
      (map.getSource('roads-network') as maplibregl.GeoJSONSource).setData(geojsonData as any);
    } else {
      map.addSource('roads-network', {
        type: 'geojson',
        data: geojsonData as any
      });

      map.addLayer({
        id: 'roads-glow',
        type: 'line',
        source: 'roads-network',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'status_color'],
          'line-width': ['case', ['get', 'is_selected'], 12, 6],
          'line-opacity': 0.45,
          'line-blur': 2.5
        }
      });

      map.addLayer({
        id: 'roads-line',
        type: 'line',
        source: 'roads-network',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': ['get', 'status_color'],
          'line-width': ['case', ['get', 'is_selected'], 4.5, 3],
          'line-opacity': 0.95
        }
      });

      map.on('click', 'roads-line', (e) => {
        if (!e.features || e.features.length === 0) return;
        const roadId = e.features[0].properties.road_id;
        const matchedRoad = roadsRef.current.find((r) => r.id === roadId);
        if (matchedRoad) {
          onSelectRoadRef.current(matchedRoad);
        }
      });

      map.on('mouseenter', 'roads-line', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        if (!e.features || e.features.length === 0) return;
        const props = e.features[0].properties;

        if (!roadPopupRef.current) {
          roadPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 10,
            className: 'deck-telemetry-popup'
          });
        }

        roadPopupRef.current
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="px-2.5 py-1.5 rounded-lg bg-canvas/95 border border-line/80 shadow-2xl text-ink font-sans max-w-xs backdrop-blur-md pointer-events-none">
              <p class="font-bold text-xs text-ink leading-tight">${props.name}</p>
              <p class="text-[10px] font-mono text-information mt-0.5">${props.ref ? props.ref + ' • ' : ''}${props.authority}</p>
            </div>
          `)
          .addTo(map);
      });

      map.on('mousemove', 'roads-line', (e) => {
        if (roadPopupRef.current) {
          roadPopupRef.current.setLngLat(e.lngLat);
        }
      });

      map.on('mouseleave', 'roads-line', () => {
        map.getCanvas().style.cursor = '';
        if (roadPopupRef.current) {
          roadPopupRef.current.remove();
        }
      });
    }
  }, [roads, mapLoaded, selectedRoadId, activeLayerFilters]);

  // Update Multi-Source Intelligence & Incidents via Native WebGL Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const features: any[] = [];

    if (activeLayerFilters.newsSocial) {
      signals.forEach((sig) => {
        let color = '#22d3ee';
        let haloColor = '#0891b2';
        let categoryLabel = 'SIGNAL';

        if (sig.type === 'news_media') {
          color = '#c084fc';
          haloColor = '#7e22ce';
          categoryLabel = 'NEWS';
        } else if (sig.type === 'reddit_community') {
          color = '#fb923c';
          haloColor = '#c2410c';
          categoryLabel = 'REDDIT';
        } else if (sig.type === 'twitter_signal') {
          color = '#38bdf8';
          haloColor = '#0284c7';
          categoryLabel = 'INTEL';
        } else if (sig.type === 'field_evidence') {
          color = '#34d399';
          haloColor = '#059669';
          categoryLabel = 'PHOTO';
        }

        features.push({
          type: 'Feature',
          id: sig.id,
          properties: {
            id: sig.id,
            is_signal: true,
            type: sig.type,
            source: sig.source,
            title: sig.title,
            road_name: sig.road_name,
            date: sig.date,
            color,
            halo_color: haloColor,
            category_label: categoryLabel,
            lat: sig.lat,
            lon: sig.lon
          },
          geometry: {
            type: 'Point',
            coordinates: [sig.lon, sig.lat]
          }
        });
      });
    }

    if (activeLayerFilters.excavations) {
      roads.forEach((road) => {
        if (road.incidents && road.incidents.length > 0) {
          road.incidents.forEach((inc) => {
            if (inc.lat && inc.lon) {
              features.push({
                type: 'Feature',
                id: inc.incident_id,
                properties: {
                  id: inc.incident_id,
                  is_signal: false,
                  type: 'ground_excavation',
                  source: 'Verified Dig',
                  title: `${inc.category.replace(/_/g, ' ').toUpperCase()}`,
                  road_name: road.name,
                  date: inc.last_observed_at ? inc.last_observed_at.split('T')[0] : 'Recent',
                  color: '#f59e0b',
                  halo_color: '#b45309',
                  category_label: 'EXCAVATION',
                  lat: inc.lat,
                  lon: inc.lon
                },
                geometry: {
                  type: 'Point',
                  coordinates: [inc.lon, inc.lat]
                }
              });
            }
          });
        }
      });
    }

    const geojsonData = {
      type: 'FeatureCollection',
      features
    };

    if (map.getSource('signals-intel')) {
      (map.getSource('signals-intel') as maplibregl.GeoJSONSource).setData(geojsonData as any);
    } else {
      map.addSource('signals-intel', {
        type: 'geojson',
        data: geojsonData as any
      });

      map.addLayer({
        id: 'signals-halo',
        type: 'circle',
        source: 'signals-intel',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, 5,
            8, 11,
            14, 18
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.35,
          'circle-blur': 0.4
        }
      });

      map.addLayer({
        id: 'signals-bubble',
        type: 'circle',
        source: 'signals-intel',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, 3.5,
            8, 6.5,
            14, 10
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#020617',
          'circle-opacity': 1
        }
      });

      map.addLayer({
        id: 'signals-center',
        type: 'circle',
        source: 'signals-intel',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, 1,
            8, 2,
            14, 3.5
          ],
          'circle-color': '#ffffff',
          'circle-opacity': 0.95
        }
      });

      map.on('mouseenter', 'signals-bubble', (e) => {
        if (!e.features || e.features.length === 0) return;
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const coordinates = (e.features[0].geometry as any).coordinates.slice();

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        if (!signalPopupRef.current) {
          signalPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14,
            className: 'deck-telemetry-popup'
          });
        }

        signalPopupRef.current
          .setLngLat(coordinates)
          .setHTML(`
            <div class="px-3 py-2 rounded-xl bg-canvas/95 border border-line/80 shadow-2xl text-ink font-sans max-w-[280px] backdrop-blur-xl pointer-events-none">
              <div class="flex items-center justify-between gap-2 font-mono text-[10px] pb-1 border-b border-line">
                <span class="font-bold text-information uppercase">${props.source}</span>
                <span class="text-muted font-semibold">${props.date || 'SIGNAL'}</span>
              </div>
              <p class="font-bold text-xs text-ink mt-1 leading-snug line-clamp-2">${props.title}</p>
              <p class="text-[11px] font-mono text-information mt-1 truncate">${props.road_name}</p>
              <div class="mt-1.5 pt-1 border-t border-line/80 flex items-center justify-between text-[10px] font-mono text-muted">
                <span>Click to inspect</span>
                <span class="text-information font-semibold">Dossier →</span>
              </div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'signals-bubble', () => {
        map.getCanvas().style.cursor = '';
        if (signalPopupRef.current) {
          signalPopupRef.current.remove();
        }
      });

      map.on('click', 'signals-bubble', (e) => {
        if (!e.features || e.features.length === 0) return;
        if (signalPopupRef.current) {
          signalPopupRef.current.remove();
        }
        const props = e.features[0].properties;
        const matchedSig = signalsRef.current.find((s) => s.id === props.id);
        if (matchedSig) {
          onSelectSignalRef.current(matchedSig);
          map.flyTo({
            center: [matchedSig.lon, matchedSig.lat],
            zoom: 13.5,
            pitch: 48,
            bearing: -15,
            speed: 1.1,
            essential: true
          });
        }
      });
    }
  }, [signals, roads, mapLoaded, activeLayerFilters]);

  return (
    <div className="absolute inset-0 w-full h-full bg-canvas overflow-hidden select-none">
      {/* 3D MapLibre Globe Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Floating Top-Right Telemetry Controls */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 flex-wrap justify-end">
        {/* Layer Filters */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-canvas/85 backdrop-blur-md border border-line/80 shadow-xl text-[11px] font-mono">
          <button
            onClick={() => onToggleFilter('officialWorks')}
            title="Toggle Official Works"
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              activeLayerFilters.officialWorks
                ? 'bg-cyan-950/90 text-information font-bold border border-cyan-500/40'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span>Tenders</span>
          </button>

          <button
            onClick={() => onToggleFilter('excavations')}
            title="Toggle Excavations & Digs"
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              activeLayerFilters.excavations
                ? 'bg-amber-950/90 text-warning font-bold border border-amber-500/40'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>Excavations</span>
          </button>

          <button
            onClick={() => onToggleFilter('newsSocial')}
            title="Toggle Multi-Source Intel (News, Reddit, X)"
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              activeLayerFilters.newsSocial
                ? 'bg-purple-950/90 text-source font-bold border border-purple-500/40'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            <span>Intel</span>
          </button>

          <button
            onClick={() => onToggleFilter('verifiedIntact')}
            title="Toggle Verified / In Warranty"
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              activeLayerFilters.verifiedIntact
                ? 'bg-emerald-950/90 text-positive font-bold border border-emerald-500/40'
                : 'text-muted hover:text-ink'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Warranty</span>
          </button>
        </div>

        {/* 3D Globe / 2D Flat View Toggle */}
        <button
          onClick={toggleProjection}
          title={isGlobe ? 'Switch to 2D Mercator Flat Map' : 'Switch to 3D Spherical Globe'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-canvas/85 backdrop-blur-md border border-line/80 text-information hover:text-information hover:bg-surface transition-colors shadow-xl text-[11px] font-mono font-semibold"
        >
          {isGlobe ? <Globe2 className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
          <span>{isGlobe ? '3D Globe' : '2D Map'}</span>
        </button>

        {/* Global Orbit Button */}
        <button
          onClick={flyToGlobalOrbit}
          title="Zoom out to Global Orbit"
          className="p-1.5 rounded-lg bg-canvas/85 backdrop-blur-md border border-line/80 text-muted hover:text-ink hover:bg-surface transition-colors shadow-xl text-[11px] font-mono"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Subtle Legend Indicator Bottom Right (Above controls) */}
      <div className="absolute bottom-10 right-3 z-20 hidden lg:flex items-center gap-3 px-3 py-1 rounded-full bg-canvas/80 backdrop-blur-md border border-line/80 text-[10px] font-mono text-muted shadow-xl pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-1 bg-cyan-400 rounded-full"></span>
          <span>Official Work</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-1 bg-amber-400 rounded-full"></span>
          <span>Ground Dig</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-1 bg-emerald-400 rounded-full"></span>
          <span>Under Warranty</span>
        </span>
      </div>
    </div>
  );
}
