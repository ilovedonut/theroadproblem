'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { Layers, ShieldCheck, AlertTriangle, Newspaper, MessageSquare, Twitter, Eye, Maximize2, Compass } from 'lucide-react';

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

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Dark high-contrast telemetry basemap style with inverted OSM raster
    const darkTelemetryStyle = {
      version: 8 as const,
      sources: {
        'osm-tiles': {
          type: 'raster' as const,
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors • ODbL'
        }
      },
      layers: [
        {
          id: 'dark-background',
          type: 'background' as const,
          paint: {
            'background-color': '#020617'
          }
        },
        {
          id: 'osm-base-layer',
          type: 'raster' as const,
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
          paint: {
            'raster-brightness-max': 0.32,
            'raster-contrast': 0.45,
            'raster-saturation': -0.92
          }
        }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkTelemetryStyle,
      center: [77.625, 12.92], // Karnataka pilot center (Bengaluru & Ramanagara)
      zoom: 11,
      minZoom: 5,
      maxZoom: 18,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'theroadproblem.quest • PostGIS Canonical Network'
      }),
      'bottom-left'
    );

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach(m => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update GeoJSON Road Lines on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !roads || roads.length === 0) return;

    // Build GeoJSON FeatureCollection from road segments
    const features: any[] = [];

    roads.forEach((road) => {
      const hasWorks = road.works && road.works.length > 0;
      const hasIncidents = road.incidents && road.incidents.length > 0;

      let statusColor = '#06b6d4'; // default cyan (official work)
      if (hasIncidents) {
        statusColor = '#f59e0b'; // amber (excavated / damaged)
      } else if (hasWorks && road.works?.[0].official_status === 'officially_completed') {
        statusColor = '#10b981'; // emerald (verified intact / completed)
      }

      if (Array.isArray(road.segments)) {
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
                is_selected: road.id === selectedRoadId,
                contractor: road.works?.[0]?.contractor_name || 'Unassigned',
                package_name: road.works?.[0]?.package_name || 'No active work package'
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

      // Glow backdrop line
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
          'line-width': ['case', ['get', 'is_selected'], 14, 8],
          'line-opacity': 0.35,
          'line-blur': 3
        }
      });

      // Sharp central road line
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
          'line-width': ['case', ['get', 'is_selected'], 5, 3.5],
          'line-opacity': 0.95
        }
      });

      // Interactive Click & Hover
      map.on('click', 'roads-line', (e) => {
        if (!e.features || e.features.length === 0) return;
        const roadId = e.features[0].properties.road_id;
        const matchedRoad = roads.find((r) => r.id === roadId);
        if (matchedRoad) {
          onSelectRoad(matchedRoad);
        }
      });

      map.on('mouseenter', 'roads-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'roads-line', () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }, [roads, mapLoaded, selectedRoadId, onSelectRoad]);

  // Update Multi-Source Signal Markers on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear previous markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!activeLayerFilters.newsSocial) return;

    signals.forEach((sig) => {
      // Create custom marker DOM element
      const el = document.createElement('div');
      el.className = 'group cursor-pointer relative';

      let bgClass = 'bg-cyan-950 border-cyan-400 text-cyan-300';
      let iconHtml = '🏛️';

      if (sig.type === 'news_media') {
        bgClass = 'bg-purple-950 border-purple-400 text-purple-300';
        iconHtml = '📰';
      } else if (sig.type === 'reddit_community') {
        bgClass = 'bg-orange-950 border-orange-400 text-orange-300';
        iconHtml = '💬';
      } else if (sig.type === 'twitter_signal') {
        bgClass = 'bg-sky-950 border-sky-400 text-sky-300';
        iconHtml = '🐦';
      } else if (sig.type === 'field_evidence') {
        bgClass = 'bg-emerald-950 border-emerald-400 text-emerald-300';
        iconHtml = '📸';
      }

      el.innerHTML = `
        <div class="w-7 h-7 rounded-full border-2 ${bgClass} flex items-center justify-center text-xs shadow-lg transform transition-transform hover:scale-125 hover:z-50">
          <span>${iconHtml}</span>
        </div>
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-slate-100 text-[10px] font-mono px-2 py-1 rounded shadow-xl whitespace-nowrap pointer-events-none z-50">
          <p class="font-bold text-white">${sig.source}</p>
          <p class="text-slate-400">${sig.title.slice(0, 36)}...</p>
        </div>
      `;

      el.addEventListener('click', () => {
        onSelectSignal(sig);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([sig.lon, sig.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [signals, mapLoaded, activeLayerFilters.newsSocial, onSelectSignal]);

  const fitKarnatakaPilot = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [77.625, 12.92],
      zoom: 11,
      speed: 1.2
    });
  };

  return (
    <div className="relative w-full h-full min-h-[500px] flex-1 bg-slate-950 overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Control: Layer Toggles (God's Eye View Style) */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2 max-w-[90vw]">
        <button
          onClick={() => onToggleFilter('officialWorks')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all backdrop-blur-md shadow-md ${
            activeLayerFilters.officialWorks
              ? 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 font-bold'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>Official Tenders (MoRTH/CPPP)</span>
        </button>

        <button
          onClick={() => onToggleFilter('excavations')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all backdrop-blur-md shadow-md ${
            activeLayerFilters.excavations
              ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 font-bold'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>Active Excavations</span>
        </button>

        <button
          onClick={() => onToggleFilter('newsSocial')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all backdrop-blur-md shadow-md ${
            activeLayerFilters.newsSocial
              ? 'bg-purple-950/80 border-purple-500/60 text-purple-300 font-bold'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          <span>Multi-Source Intel (News/Reddit/X)</span>
        </button>

        <button
          onClick={() => onToggleFilter('verifiedIntact')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all backdrop-blur-md shadow-md ${
            activeLayerFilters.verifiedIntact
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 font-bold'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>In Warranty / Intact</span>
        </button>
      </div>

      {/* Floating Compass / Reset View */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={fitKarnatakaPilot}
          title="Reset to Pilot Corridor (Bengaluru ORR & NH-44)"
          className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-cyan-400 backdrop-blur-md transition-colors shadow-lg flex items-center gap-1.5 text-xs font-mono"
        >
          <Compass className="w-4 h-4" />
          <span className="hidden sm:inline">Pilot Focus</span>
        </button>
      </div>

      {/* Legend Badge Bottom Center */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-4 px-4 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-slate-800/80 text-[11px] font-mono text-slate-300 shadow-xl">
        <span className="text-slate-400 font-bold">MAP TELEMETRY:</span>
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-cyan-400 rounded-full inline-block"></span>
          <span>Official Public Works</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-amber-400 rounded-full inline-block"></span>
          <span>Ground Dig / Excavation</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-1 bg-emerald-400 rounded-full inline-block"></span>
          <span>Verified Completed</span>
        </div>
        <span className="text-slate-500">Tap any road to open full dossier</span>
      </div>
    </div>
  );
}
