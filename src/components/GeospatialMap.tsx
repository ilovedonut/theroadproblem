'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { Compass, Globe2, Map as MapIcon, Layers, RefreshCw } from 'lucide-react';

export interface RoadFeature {
  id: string;
  name: string;
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
}

interface GeospatialMapProps {
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
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isGlobe, setIsGlobe] = useState(true);

  // Initialize MapLibre GL with 3D Globe Projection
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Dark high-contrast telemetry basemap style
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
            'background-color': '#020617'
          }
        },
        {
          id: 'osm-globe-surface',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-brightness-max': 0.35,
            'raster-contrast': 0.45,
            'raster-saturation': -0.92
          }
        }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkGlobeStyle,
      center: [77.625, 12.92], // Karnataka pilot center
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
        customAttribution: 'theroadproblem.quest • God\'s Eye 3D Engine'
      }),
      'bottom-left'
    );

    map.on('load', () => {
      // Ensure globe projection is enabled
      try {
        (map as any).setProjection({ type: 'globe' });
      } catch (err) {
        console.warn('Globe projection initialization fallback:', err);
      }
      setMapLoaded(true);
      map.resize();
    });

    mapRef.current = map;

    // Window / container resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach(m => m.remove());
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
      center: [78.9629, 20.5937], // India national center
      zoom: 3.8,
      pitch: 35,
      bearing: 0,
      speed: 0.9,
      curve: 1.3,
      essential: true
    });
  }, []);

  // Pilot Reset (Focus on Bengaluru / Ramanagara pilot network)
  const flyToPilot = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: [77.625, 12.92],
      zoom: 11,
      pitch: 45,
      bearing: -15,
      speed: 1.1,
      essential: true
    });
  }, []);

  // Update Vector Road Networks on the Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !roads || roads.length === 0) return;

    const features: any[] = [];

    roads.forEach((road) => {
      const hasWorks = road.works && road.works.length > 0;
      const hasIncidents = road.incidents && road.incidents.length > 0;

      let statusColor = '#06b6d4'; // cyan: active work package
      if (hasIncidents) {
        statusColor = '#f59e0b'; // amber: active excavation / damage
      } else if (hasWorks && road.works?.[0]?.official_status === 'officially_completed') {
        statusColor = '#10b981'; // emerald: completed / warranty
      }

      // Check layer visibility filters
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
                name: road.name,
                ref: road.ref || '',
                authority: road.authority_name || 'Public Authority',
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

      // Ambient neon underglow
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

      // Crisp vector road line
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
        const matchedRoad = roads.find((r) => r.id === roadId);
        if (matchedRoad) {
          onSelectRoad(matchedRoad);

          // Swoop camera to the clicked corridor
          if (matchedRoad.segments?.[0]?.geojson?.coordinates?.[0]) {
            const coord = matchedRoad.segments[0].geojson.coordinates[0];
            map.flyTo({
              center: [coord[0], coord[1]],
              zoom: 12.5,
              pitch: 50,
              bearing: -15,
              speed: 1.2,
              curve: 1.4,
              essential: true
            });
          }
        }
      });

      map.on('mouseenter', 'roads-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'roads-line', () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }, [roads, mapLoaded, selectedRoadId, activeLayerFilters, onSelectRoad]);

  // Update Multi-Source Intelligence Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!activeLayerFilters.newsSocial) return;

    signals.forEach((sig) => {
      const el = document.createElement('div');
      el.className = 'group cursor-pointer relative';

      let bgClass = 'bg-cyan-950/90 border-cyan-400 text-cyan-300';
      let svgIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

      if (sig.type === 'news_media') {
        bgClass = 'bg-purple-950/90 border-purple-400 text-purple-300';
        svgIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>';
      } else if (sig.type === 'reddit_community') {
        bgClass = 'bg-orange-950/90 border-orange-400 text-orange-300';
        svgIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
      } else if (sig.type === 'twitter_signal') {
        bgClass = 'bg-sky-950/90 border-sky-400 text-sky-300';
        svgIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>';
      } else if (sig.type === 'field_evidence') {
        bgClass = 'bg-emerald-950/90 border-emerald-400 text-emerald-300';
        svgIcon = '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
      }

      el.innerHTML = `
        <div class="w-6 h-6 rounded-full border-2 ${bgClass} flex items-center justify-center shadow-lg transform transition-transform hover:scale-125 hover:z-50">
          ${svgIcon}
        </div>
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-950 border border-slate-700 text-slate-100 text-[10px] font-mono px-2 py-1 rounded shadow-2xl whitespace-nowrap pointer-events-none z-50">
          <p class="font-bold text-white">${sig.source}</p>
          <p class="text-slate-400">${sig.title.slice(0, 32)}...</p>
        </div>
      `;

      el.addEventListener('click', () => {
        onSelectSignal(sig);
        map.flyTo({
          center: [sig.lon, sig.lat],
          zoom: 13,
          pitch: 45,
          speed: 1.1,
          essential: true
        });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([sig.lon, sig.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [signals, mapLoaded, activeLayerFilters.newsSocial, onSelectSignal]);

  return (
    <div className="absolute inset-0 w-full h-full bg-slate-950 overflow-hidden select-none">
      {/* 3D MapLibre Globe Canvas */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Floating Top-Right Telemetry Controls */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 flex-wrap justify-end">
        {/* Layer Filters */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800/80 shadow-xl text-[11px] font-mono">
          <button
            onClick={() => onToggleFilter('officialWorks')}
            title="Toggle Official Works"
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              activeLayerFilters.officialWorks
                ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-slate-400 hover:text-white'
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
                ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/40'
                : 'text-slate-400 hover:text-white'
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
                ? 'bg-purple-950/90 text-purple-300 font-bold border border-purple-500/40'
                : 'text-slate-400 hover:text-white'
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
                ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800/80 text-cyan-400 hover:text-cyan-300 hover:bg-slate-900 transition-colors shadow-xl text-[11px] font-mono font-semibold"
        >
          {isGlobe ? <Globe2 className="w-3.5 h-3.5" /> : <MapIcon className="w-3.5 h-3.5" />}
          <span>{isGlobe ? '3D Globe' : '2D Map'}</span>
        </button>

        {/* Global Orbit & Pilot Focus Buttons */}
        <button
          onClick={flyToGlobalOrbit}
          title="Zoom out to Global Orbit"
          className="p-1.5 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors shadow-xl text-[11px] font-mono"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Subtle Legend Indicator Bottom Right (Above controls) */}
      <div className="absolute bottom-10 right-3 z-20 hidden lg:flex items-center gap-3 px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-800/80 text-[10px] font-mono text-slate-400 shadow-xl pointer-events-none">
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
