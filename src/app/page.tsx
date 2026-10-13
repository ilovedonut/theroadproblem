'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, ShieldCheck, AlertTriangle, Layers, Building2, 
  Banknote, Calendar, RefreshCw, Compass, MapPin, Database, 
  ExternalLink, ChevronRight, Activity, Newspaper, MessageSquare, Twitter, PlusCircle
} from 'lucide-react';
import { GeospatialMap, RoadFeature, MultiSourceSignal } from '@/components/GeospatialMap';
import { RoadDossierDrawer } from '@/components/RoadDossierDrawer';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

export default function GeospatialDeckPage() {
  const [locale, setLocale] = useState<'en' | 'hi'>('en');
  const [lowData, setLowData] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'works' | 'excavated' | 'completed'>('all');
  
  const [roads, setRoads] = useState<RoadFeature[]>([]);
  const [signals, setSignals] = useState<MultiSourceSignal[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedRoad, setSelectedRoad] = useState<RoadFeature | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MultiSourceSignal | null>(null);

  const [activeLayerFilters, setActiveLayerFilters] = useState({
    officialWorks: true,
    excavations: true,
    newsSocial: true,
    verifiedIntact: true
  });

  useEffect(() => {
    const savedLocale = (localStorage.getItem('app_locale') as 'en' | 'hi') || 'en';
    setLocale(savedLocale);
    setLowData(localStorage.getItem('app_low_data') === 'true');

    fetchDeckData();
  }, []);

  const fetchDeckData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/map/deck');
      if (res.ok) {
        const data = await res.json();
        setRoads(data.roads || []);
        setSignals(data.signals || []);
        setSummary(data.summary || null);

        // Auto-select Outer Ring Road on initial load if available so the user sees the dossier immediately
        if (data.roads && data.roads.length > 0) {
          const defaultRoad = data.roads.find((r: any) => r.name.includes('Outer Ring Road')) || data.roads[0];
          setSelectedRoad(defaultRoad);
        }
      }
    } catch (err) {
      console.error('Failed to load deck telemetry', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFilter = (key: 'officialWorks' | 'excavations' | 'newsSocial' | 'verifiedIntact') => {
    setActiveLayerFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const filteredRoads = roads.filter(road => {
    const matchesSearch = 
      road.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (road.ref && road.ref.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (road.district && road.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (road.works?.[0]?.contractor_name && road.works[0].contractor_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedFilter === 'works') {
      return road.works && road.works.length > 0;
    }
    if (selectedFilter === 'excavated') {
      return road.incidents && road.incidents.length > 0;
    }
    if (selectedFilter === 'completed') {
      return road.works && road.works.some(w => w.official_status === 'officially_completed');
    }

    return true;
  });

  return (
    <div className="flex flex-col flex-1 w-full min-h-[calc(100vh-80px)] bg-slate-950 text-slate-100 relative">
      {/* Top Search & Filter Bar */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Omni-search */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search highway, road, contractor (L&T, KNR) or district..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-700/80 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          {/* Quick Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs font-mono py-1">
            <span className="text-slate-500 text-[11px] hidden lg:inline mr-1">FILTER:</span>
            {[
              { id: 'all', label: 'All Corridors' },
              { id: 'works', label: 'Active Tenders' },
              { id: 'excavated', label: 'Ground Digs' },
              { id: 'completed', label: 'Warranty Active' }
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setSelectedFilter(pill.id as any)}
                className={`px-2.5 py-1 rounded-md border text-[11px] whitespace-nowrap transition-colors ${
                  selectedFilter === pill.id
                    ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* HUD Summary Pill */}
          {summary && (
            <div className="hidden xl:flex items-center gap-3 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <strong className="text-white">{summary.total_roads_indexed}</strong> corridors
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <strong className="text-white">₹{summary.total_spend_tracked_cr} Cr</strong> tracked
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Geospatial Workspace */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Drawer / Corridor Ticker (Desktop) */}
        <div className="hidden lg:flex flex-col w-80 bg-slate-950/90 border-r border-slate-800/80 z-20 overflow-y-auto">
          <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="font-bold text-slate-300">INDEXED CORRIDORS</span>
            <span>({filteredRoads.length})</span>
          </div>

          <div className="divide-y divide-slate-800/60 flex-1">
            {filteredRoads.map((road) => {
              const isSelected = selectedRoad?.id === road.id;
              const hasWorks = road.works && road.works.length > 0;
              const hasIncidents = road.incidents && road.incidents.length > 0;

              return (
                <button
                  key={road.id}
                  onClick={() => {
                    setSelectedRoad(road);
                    setSelectedSignal(null);
                  }}
                  className={`w-full text-left p-3 rounded-md transition-colors flex items-start justify-between gap-2 ${
                    isSelected 
                      ? 'bg-cyan-950/30 ring-1 ring-cyan-500/40 text-white shadow-[inset_0_1px_0_0_rgba(6,182,212,0.15)]' 
                      : 'hover:bg-slate-900/50 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-white">{road.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {road.ref ? `${road.ref} • ` : ''}{road.district}
                    </p>
                    {hasWorks && (
                      <p className="text-[10px] text-cyan-400 font-mono mt-1 truncate max-w-[210px]">
                        Contractor: {road.works?.[0].contractor_name}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {hasIncidents ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold">
                        Excavated
                      </span>
                    ) : hasWorks ? (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                        Work Active
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        Indexed
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {(parseFloat(road.total_length_m || '0') / 1000).toFixed(1)} km
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-3 border-t border-slate-800/80 bg-slate-900/30 text-[10px] text-slate-500 font-mono leading-tight">
            Data sourced from MoRTH, BBMP, PMGSY, and OSM. Tap any row to zoom and inspect the full dossier.
          </div>
        </div>

        {/* Center: Full Geospatial Map Canvas */}
        <div className="flex-1 relative h-full">
          {loading ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 text-cyan-400 font-mono gap-3">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>INITIALIZING GEOSPATIAL OBSERVATORY...</span>
            </div>
          ) : (
            <GeospatialMap
              roads={roads}
              signals={signals}
              selectedRoadId={selectedRoad?.id || null}
              onSelectRoad={(road) => {
                setSelectedRoad(road);
                setSelectedSignal(null);
              }}
              onSelectSignal={(signal) => {
                setSelectedSignal(signal);
                setSelectedRoad(null);
              }}
              activeLayerFilters={activeLayerFilters}
              onToggleFilter={handleToggleFilter}
            />
          )}
        </div>

        {/* Right: Slide-out Public Road Dossier Drawer */}
        <RoadDossierDrawer
          road={selectedRoad}
          signal={selectedSignal}
          onClose={() => {
            setSelectedRoad(null);
            setSelectedSignal(null);
          }}
        />
      </div>
    </div>
  );
}
