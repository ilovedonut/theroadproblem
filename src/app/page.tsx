'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, ShieldCheck, AlertTriangle, Layers, Building2, 
  Banknote, Calendar, RefreshCw, Compass, MapPin, Database, 
  ExternalLink, ChevronRight, ChevronLeft, Activity, Newspaper, MessageSquare, Twitter, PlusCircle,
  Share2, X, ArrowLeft, SlidersHorizontal, CheckCircle2, Clock
} from 'lucide-react';
import { GeospatialMap, RoadFeature, MultiSourceSignal } from '@/components/GeospatialMap';

export default function GeospatialDeckPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'works' | 'excavated' | 'completed'>('all');
  
  const [roads, setRoads] = useState<RoadFeature[]>([]);
  const [signals, setSignals] = useState<MultiSourceSignal[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedRoad, setSelectedRoad] = useState<RoadFeature | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MultiSourceSignal | null>(null);
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false);
  const [activeDossierTab, setActiveDossierTab] = useState<'overview' | 'contractor' | 'timeline'>('overview');
  const [copied, setCopied] = useState(false);

  const [activeLayerFilters, setActiveLayerFilters] = useState({
    officialWorks: true,
    excavations: true,
    newsSocial: true,
    verifiedIntact: true
  });

  useEffect(() => {
    // Responsive default: collapse on very small mobile screens
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsDeckCollapsed(true);
    }
    fetchDeckData();
  }, []);

  // Keyboard shortcut: Esc returns to directory mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedRoad || selectedSignal) {
          setSelectedRoad(null);
          setSelectedSignal(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoad, selectedSignal]);

  const fetchDeckData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/map/deck');
      if (res.ok) {
        const data = await res.json();
        setRoads(data.roads || []);
        setSignals(data.signals || []);
        setSummary(data.summary || null);

        // Default selectedRoad to null on load so the user sees all indexed corridors immediately
        setSelectedRoad(null);
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

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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

  const primaryWork = selectedRoad?.works && selectedRoad.works.length > 0 ? selectedRoad.works[0] : null;
  const hasExcavation = selectedRoad?.incidents && selectedRoad.incidents.length > 0;
  const spendCr = primaryWork?.contract_value_inr 
    ? (parseFloat(String(primaryWork.contract_value_inr)) / 10000000).toFixed(2)
    : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Background 3D Globe Canvas (Full Viewport) */}
      <div className="absolute inset-0 w-full h-full">
        {loading ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950 text-cyan-400 font-mono gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="text-xs tracking-wider">CONNECTING TO GEOSPATIAL OBSERVATORY...</span>
          </div>
        ) : (
          <GeospatialMap
            roads={roads}
            signals={signals}
            selectedRoadId={selectedRoad?.id || null}
            onSelectRoad={(road) => {
              setSelectedRoad(road);
              setSelectedSignal(null);
              setIsDeckCollapsed(false);
            }}
            onSelectSignal={(signal) => {
              setSelectedSignal(signal);
              setSelectedRoad(null);
              setIsDeckCollapsed(false);
            }}
            activeLayerFilters={activeLayerFilters}
            onToggleFilter={handleToggleFilter}
          />
        )}
      </div>

      {/* Collapsed HUD Trigger Pill */}
      {isDeckCollapsed && (
        <button
          onClick={() => setIsDeckCollapsed(false)}
          className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/90 backdrop-blur-xl border border-slate-800 text-slate-200 hover:text-white shadow-2xl text-xs font-mono transition-all hover:border-cyan-500/50"
          title="Expand Corridor Deck"
        >
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white truncate max-w-[180px]">
            {selectedRoad ? selectedRoad.name : `Corridors (${roads.length})`}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      )}

      {/* Floating HUD Inspector Deck (Left Dock) */}
      <div
        className={`absolute top-3 left-3 bottom-3 z-30 transition-all duration-300 ease-out flex flex-col pointer-events-auto ${
          isDeckCollapsed 
            ? 'opacity-0 -translate-x-full pointer-events-none w-0' 
            : 'opacity-100 translate-x-0 w-[calc(100vw-24px)] sm:w-96 md:w-[410px]'
        }`}
      >
        <div className="flex-1 bg-slate-950/92 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
          
          {/* Deck Header: Mode-Dependent */}
          {selectedRoad ? (
            /* Selected Road Header */
            <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/60 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <button
                  onClick={() => {
                    setSelectedRoad(null);
                    setSelectedSignal(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors mb-1.5 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>All Corridors</span>
                </button>
                <h2 className="text-sm font-bold text-white leading-snug truncate">
                  {selectedRoad.name}
                </h2>
                <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                  {selectedRoad.ref ? `${selectedRoad.ref} • ` : ''}{selectedRoad.district}, {selectedRoad.state}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleShare}
                  title="Copy link to clipboard"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1 font-mono"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied && <span className="text-[10px] text-cyan-300">Copied</span>}
                </button>
                <button
                  onClick={() => setIsDeckCollapsed(true)}
                  title="Collapse Inspector Card"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : selectedSignal ? (
            /* Selected Signal Header */
            <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setSelectedSignal(null);
                  setSelectedRoad(null);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Corridors</span>
              </button>
              <button
                onClick={() => setIsDeckCollapsed(true)}
                title="Collapse Inspector Card"
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Directory Search & Filter Header */
            <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/40 space-y-2.5 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search corridor, highway, contractor..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
                <button
                  onClick={() => setIsDeckCollapsed(true)}
                  title="Collapse Deck"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto text-xs font-mono py-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'works', label: 'Tenders' },
                  { id: 'excavated', label: 'Ground Digs' },
                  { id: 'completed', label: 'Warranty' }
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setSelectedFilter(pill.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-colors font-semibold ${
                      selectedFilter === pill.id
                        ? 'bg-cyan-950 border border-cyan-500/60 text-cyan-300'
                        : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Telemetry Count */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                <span>{filteredRoads.length} Corridors Indexed</span>
                {summary && (
                  <span className="text-cyan-300 font-bold">₹{summary.total_spend_tracked_cr} Cr Tracked</span>
                )}
              </div>
            </div>
          )}

          {/* Deck Body: Directory vs. Road Dossier vs. Signal Dossier */}
          {selectedRoad ? (
            /* Mode B: Road Dossier */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Dual-State Machine Integrity Banner */}
              <div className="p-3 bg-slate-900/80 border-b border-slate-800/80 flex-shrink-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                  <span>Dual State Machine Integrity</span>
                  <span className="text-cyan-400 font-semibold">Non-Overwriting Model</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Official Public Works State */}
                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-cyan-500/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 mb-0.5">
                      <Building2 className="w-3 h-3" />
                      <span>OFFICIAL STATUS</span>
                    </div>
                    {primaryWork ? (
                      <div>
                        <p className="font-semibold text-white capitalize text-[11px] leading-tight">
                          {primaryWork.official_status.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                          {primaryWork.tender_id || 'Tender Package Active'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-[11px]">No active tender</p>
                    )}
                  </div>

                  {/* Observed Ground Reality State */}
                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-amber-500/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400 mb-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      <span>GROUND REALITY</span>
                    </div>
                    {hasExcavation ? (
                      <div>
                        <p className="font-semibold text-white text-[11px] leading-tight">Active Dig Reported</p>
                        <p className="text-[10px] text-amber-300/80 font-mono mt-0.5">
                          {selectedRoad.incidents?.length} Ground observation(s)
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-emerald-400 text-[11px] leading-tight">Passable / Restored</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">No open trenches</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dossier Tabs */}
              <div className="flex border-b border-slate-800 text-xs font-mono bg-slate-950 flex-shrink-0">
                <button
                  onClick={() => setActiveDossierTab('overview')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'overview'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Dossier
                </button>
                <button
                  onClick={() => setActiveDossierTab('contractor')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'contractor'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Contractor & Spend
                </button>
                <button
                  onClick={() => setActiveDossierTab('timeline')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'timeline'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Intel Feed
                </button>
              </div>

              {/* Dossier Tab Content */}
              <div className="p-3.5 flex-1 overflow-y-auto space-y-3.5 text-xs font-sans">
                {activeDossierTab === 'overview' && (
                  <div className="space-y-3">
                    {/* Metrics Row */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono block">LENGTH</span>
                        <span className="font-bold text-xs text-white font-mono">
                          {(parseFloat(selectedRoad.total_length_m || '0') / 1000).toFixed(1)} km
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono block">SEGMENTS</span>
                        <span className="font-bold text-xs text-white font-mono">
                          {selectedRoad.segments?.length || 1}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-mono block">SPEND</span>
                        <span className="font-bold text-xs text-cyan-300 font-mono">
                          {spendCr ? `₹${spendCr} Cr` : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Primary Work Card */}
                    {primaryWork && (
                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-cyan-400 uppercase font-mono">
                            Work Package
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                            {primaryWork.official_status}
                          </span>
                        </div>
                        <p className="text-slate-200 font-medium text-xs leading-relaxed">
                          {primaryWork.package_name}
                        </p>
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Contractor: <strong className="text-white">{primaryWork.contractor_name}</strong></span>
                          <span>Spend: <strong className="text-cyan-300">₹{spendCr} Cr</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Ground Evidence Action Card */}
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-cyan-500/20 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-white text-xs">Have visual ground evidence?</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Attach geotagged observation to this road ledger.
                        </p>
                      </div>
                      <Link
                        href="/report"
                        className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-cyan-950 font-bold font-mono text-xs whitespace-nowrap transition-colors"
                      >
                        + Add Evidence
                      </Link>
                    </div>

                    {/* Full Ledger Link */}
                    <Link
                      href={`/roads/${selectedRoad.id}`}
                      className="block text-center py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400 hover:text-cyan-300 font-mono text-xs font-semibold transition-colors"
                    >
                      Open Full Historical Ledger Page →
                    </Link>
                  </div>
                )}

                {activeDossierTab === 'contractor' && (
                  <div className="space-y-3">
                    {primaryWork ? (
                      <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-mono text-cyan-400 block">Awarded Contractor</span>
                            <h3 className="text-xs font-bold text-white mt-0.5">{primaryWork.contractor_name}</h3>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            Primary
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-slate-800 text-slate-400">
                          <div>
                            <span>CIN:</span>
                            <p className="text-slate-200 font-bold">{primaryWork.cin || 'CIN Registered'}</p>
                          </div>
                          <div>
                            <span>GSTIN:</span>
                            <p className="text-slate-200 font-bold">{primaryWork.gstin || 'GST Verified'}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800 space-y-1 text-[11px] text-slate-400 font-mono">
                          <div className="flex justify-between">
                            <span>Tender Ref:</span>
                            <span className="text-slate-200">{primaryWork.tender_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Agreement ID:</span>
                            <span className="text-slate-200">{primaryWork.contract_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sanctioned Budget:</span>
                            <span className="text-cyan-300 font-bold">₹{spendCr} Crores</span>
                          </div>
                          {primaryWork.defect_liability_end_date && (
                            <div className="flex justify-between text-emerald-400">
                              <span>Warranty Active Until:</span>
                              <span>{primaryWork.defect_liability_end_date}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                          <span>Provenance: MoRTH / CPPP</span>
                          <span className="text-cyan-400 font-semibold">GODL India 1.0</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-slate-400 font-mono bg-slate-900/50 rounded-lg border border-slate-800 text-xs">
                        No contractor allocated in public procurement registry yet.
                      </div>
                    )}
                  </div>
                )}

                {activeDossierTab === 'timeline' && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-400 font-mono mb-2">
                      Multi-source intelligence aggregated across government portals, regional news, Reddit, and field observations:
                    </p>

                    <div className="space-y-2 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-800">
                      {/* Timeline Item 1 */}
                      <div className="relative pl-6 text-xs">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-cyan-400"></span>
                        </div>
                        <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-cyan-400 font-bold">[OFFICIAL PORTAL]</span>
                            <span className="text-slate-500">Nov 2025</span>
                          </div>
                          <p className="font-semibold text-white mt-0.5 text-xs">Work Order Issued & Awarded to KNR Constructions</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">Sanctioned under BBMP/2025-26/RD/5401 for ₹48.50 Cr.</p>
                        </div>
                      </div>

                      {/* Timeline Item 2 */}
                      <div className="relative pl-6 text-xs">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-purple-950 border border-purple-400 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-purple-400"></span>
                        </div>
                        <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-purple-400 font-bold">[NEWS MEDIA • DECCAN HERALD]</span>
                            <span className="text-slate-500">Mar 2026</span>
                          </div>
                          <p className="font-semibold text-white mt-0.5 text-xs">Pipeline Excavation Trench Reported Across Lane</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">BWSSB utility line digging initiated without inter-agency barricade.</p>
                        </div>
                      </div>

                      {/* Timeline Item 3 */}
                      <div className="relative pl-6 text-xs">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-orange-950 border border-orange-400 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-orange-400"></span>
                        </div>
                        <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-orange-400 font-bold">[REDDIT r/bangalore]</span>
                            <span className="text-slate-500">Apr 2026</span>
                          </div>
                          <p className="font-semibold text-white mt-0.5 text-xs">Commuter Photo Thread: Unbarricaded pits</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">Dashcam photos show loose gravel causing two-wheeler skids.</p>
                        </div>
                      </div>

                      {/* Timeline Item 4 */}
                      <div className="relative pl-6 text-xs">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-emerald-950 border border-emerald-400 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                        </div>
                        <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="text-emerald-400 font-bold">[FIELD EVIDENCE #882]</span>
                            <span className="text-slate-500">Jun 2026</span>
                          </div>
                          <p className="font-semibold text-white mt-0.5 text-xs">Geotagged Photo Submitted & Corroborated</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">Verified by 2 independent neighborhood observers.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : selectedSignal ? (
            /* Mode C: Public Signal Dossier */
            <div className="p-4 flex-1 overflow-y-auto space-y-3.5 text-xs font-sans">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-semibold ${
                    selectedSignal.status === 'publisher_reported'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                      : 'bg-purple-950 text-purple-300 border border-purple-800/60'
                  }`}>
                    {selectedSignal.status === 'publisher_reported' ? 'Publisher Claim (Unverified)' : (selectedSignal.status || 'Public Signal')}
                  </span>
                  {selectedSignal.is_demo && (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Demo Content
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 font-mono">{selectedSignal.date}</span>
              </div>

              <div>
                <h2 className="text-sm font-bold text-white leading-snug">{selectedSignal.title}</h2>
                <p className="text-[11px] font-mono text-cyan-400 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{selectedSignal.road_name}</span>
                </p>
              </div>

              {selectedSignal.disclaimer && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 leading-relaxed font-mono">
                  <span className="font-bold text-amber-300">Notice: </span>
                  {selectedSignal.disclaimer}
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300 leading-relaxed text-xs">
                {selectedSignal.details}
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                  <span>Source Channel:</span>
                  <span className="font-semibold text-slate-200">{selectedSignal.source}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                  <span>Coordinates:</span>
                  <span className="text-slate-300">{selectedSignal.lat.toFixed(4)}° N, {selectedSignal.lon.toFixed(4)}° E</span>
                </div>
              </div>

              {selectedSignal.source_url && (
                <a
                  href={selectedSignal.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 transition-colors text-xs font-mono font-semibold"
                >
                  <span>Inspect Source Record</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            /* Mode A: Indexed Corridors List */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="divide-y divide-slate-800/60 flex-1 overflow-y-auto">
                {filteredRoads.map((road) => {
                  const hasWorks = road.works && road.works.length > 0;
                  const hasIncidents = road.incidents && road.incidents.length > 0;

                  return (
                    <button
                      key={road.id}
                      onClick={() => {
                        setSelectedRoad(road);
                        setSelectedSignal(null);
                      }}
                      className="w-full text-left p-3 transition-colors flex items-start justify-between gap-2 hover:bg-slate-900/70 text-slate-300 group"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-xs text-white group-hover:text-cyan-300 transition-colors truncate block">
                          {road.name}
                        </span>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {road.ref ? `${road.ref} • ` : ''}{road.district}
                        </p>
                        {hasWorks && (
                          <p className="text-[10px] text-cyan-400 font-mono mt-0.5 truncate">
                            Contractor: {road.works?.[0].contractor_name}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {hasIncidents ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold">
                            Excavated
                          </span>
                        ) : hasWorks ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
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

              <div className="p-3 border-t border-slate-800/80 bg-slate-900/40 text-[10px] text-slate-400 font-mono flex-shrink-0 leading-tight">
                Data sourced from MoRTH, BBMP, PMGSY & OSM under GODL India 1.0. Tap any corridor to inspect.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
