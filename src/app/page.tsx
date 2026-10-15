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

import { AreaOverview } from '@/components/AreaOverview';
import type { MapBounds } from '@/lib/map-bounds';

export default function GeospatialDeckPage() {
  const [mapBounds,setMapBounds]=useState<MapBounds|null>(null);
  
  const [roads, setRoads] = useState<RoadFeature[]>([]);
  const [signals, setSignals] = useState<MultiSourceSignal[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedRoad, setSelectedRoad] = useState<RoadFeature | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MultiSourceSignal | null>(null);
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false);
  const [activeDossierTab, setActiveDossierTab] = useState<'overview' | 'contractor' | 'timeline'>('overview');
  const [copied, setCopied] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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
      const res = await fetch(`/api/v1/map/deck?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRoads(data.roads || []);
        setSignals(data.signals || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Failed to load deck telemetry', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSources = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/v1/ingest/refresh', { method: 'POST' });
      if (res.ok) {
        await fetchDeckData();
      }
    } catch (err) {
      console.error('Failed to sync sources', err);
    } finally {
      setIsSyncing(false);
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

  const primaryWork = selectedRoad?.works && selectedRoad.works.length > 0 ? selectedRoad.works[0] : null;
  const hasExcavation = selectedRoad?.incidents && selectedRoad.incidents.length > 0;
  const spendCr = primaryWork?.contract_value_inr 
    ? (parseFloat(String(primaryWork.contract_value_inr)) / 10000000).toFixed(2)
    : null;

  // Dynamic multi-source timeline aggregated for the selected corridor
  const roadTimelineEvents = React.useMemo(() => {
    if (!selectedRoad) return [];

    const events: Array<{
      id: string;
      date: string;
      timestamp: number;
      sourceBadge: string;
      badgeStyle: 'cyan' | 'purple' | 'orange' | 'emerald' | 'amber';
      title: string;
      description: string;
      url?: string;
    }> = [];

    // 1. Works events (official tenders & contracts)
    if (selectedRoad.works && selectedRoad.works.length > 0) {
      for (const w of selectedRoad.works) {
        const startDate = w.start_date ? new Date(w.start_date) : null;
        events.push({
          id: `work-award-${w.work_id}`,
          date: startDate && !isNaN(startDate.getTime())
            ? startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'Awarded',
          timestamp: startDate && !isNaN(startDate.getTime()) ? startDate.getTime() : 0,
          sourceBadge: `[OFFICIAL PORTAL • ${(w.authority_name || 'Procurement').toUpperCase()}]`,
          badgeStyle: 'cyan',
          title: `Work Sanctioned: ${w.contractor_name}`,
          description: `Sanctioned under ${w.tender_id || w.contract_id || 'Tender'} for ₹${(Number(w.contract_value_inr || 0) / 10000000).toFixed(2)} Cr. ${w.package_name}`
        });

        if (w.defect_liability_end_date) {
          const dlDate = new Date(w.defect_liability_end_date);
          events.push({
            id: `work-warranty-${w.work_id}`,
            date: dlDate && !isNaN(dlDate.getTime())
              ? dlDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : 'Statutory Warranty',
            timestamp: dlDate && !isNaN(dlDate.getTime()) ? dlDate.getTime() : Date.now(),
            sourceBadge: '[STATUTORY WARRANTY]',
            badgeStyle: 'emerald',
            title: 'Defect Liability Period Enforced',
            description: `Mandatory contractor maintenance liability legally enforced through ${w.defect_liability_end_date}.`
          });
        }
      }
    }

    // 2. Multi-source signals matching this road
    const rNameLower = selectedRoad.name.toLowerCase();
    const rRefLower = selectedRoad.ref?.toLowerCase();
    const matchingSignals = signals.filter((sig) => {
      if (!sig.road_name) return false;
      const sLower = sig.road_name.toLowerCase();
      return (
        sLower.includes(rNameLower) ||
        rNameLower.includes(sLower) ||
        (rRefLower && sLower.includes(rRefLower))
      );
    });

    for (const sig of matchingSignals) {
      const sigDate = sig.date ? new Date(sig.date) : null;
      const isNews = sig.type === 'news' || sig.status === 'publisher_reported';
      const isSocial = sig.type === 'social' || sig.type === 'citizen';
      events.push({
        id: `sig-${sig.id}`,
        date: sigDate && !isNaN(sigDate.getTime())
          ? sigDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : 'Reported',
        timestamp: sigDate && !isNaN(sigDate.getTime()) ? sigDate.getTime() : 0,
        sourceBadge: isNews
          ? `[NEWS • ${(sig.source || 'Media').toUpperCase()}]`
          : isSocial
          ? `[COMMUNITY • ${(sig.source || 'Civic').toUpperCase()}]`
          : `[SIGNAL • ${(sig.source || 'Feed').toUpperCase()}]`,
        badgeStyle: isNews ? 'purple' : isSocial ? 'orange' : 'cyan',
        title: sig.title,
        description: sig.details,
        url: sig.source_url
      });
    }

    // 3. Incidents / Ground observations
    if (selectedRoad.incidents && selectedRoad.incidents.length > 0) {
      for (const inc of selectedRoad.incidents) {
        const incDate = inc.last_observed_at ? new Date(inc.last_observed_at) : null;
        events.push({
          id: `inc-${inc.incident_id}`,
          date: incDate && !isNaN(incDate.getTime())
            ? incDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'Field Report',
          timestamp: incDate && !isNaN(incDate.getTime()) ? incDate.getTime() : 0,
          sourceBadge: `[FIELD OBSERVATION • ${inc.verification_state.toUpperCase()}]`,
          badgeStyle: inc.verification_state === 'corroborated' ? 'emerald' : 'amber',
          title: `Excavation / Defect Reported: ${inc.category.replace(/_/g, ' ')}`,
          description: `Lifecycle status: ${inc.lifecycle_status}. Corroboration state: ${inc.verification_state}.`
        });
      }
    }

    // Sort newest first
    events.sort((a, b) => b.timestamp - a.timestamp);
    return events;
  }, [selectedRoad, signals]);

  const getTimelineBadgeClasses = (style: 'cyan' | 'purple' | 'orange' | 'emerald' | 'amber') => {
    switch (style) {
      case 'cyan':
        return { dotBg: 'bg-cyan-950 border-cyan-400', dotFill: 'bg-cyan-400', text: 'text-information' };
      case 'purple':
        return { dotBg: 'bg-purple-950 border-purple-400', dotFill: 'bg-purple-400', text: 'text-source' };
      case 'orange':
        return { dotBg: 'bg-orange-950 border-orange-400', dotFill: 'bg-orange-400', text: 'text-warning' };
      case 'emerald':
        return { dotBg: 'bg-emerald-950 border-emerald-400', dotFill: 'bg-emerald-400', text: 'text-positive' };
      case 'amber':
      default:
        return { dotBg: 'bg-amber-950 border-amber-400', dotFill: 'bg-amber-400', text: 'text-warning' };
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-canvas text-ink select-none">
      {/* Background 3D Globe Canvas (Full Viewport) */}
      <div className="absolute inset-0 w-full h-full">
        {loading ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-canvas text-information font-mono gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <span className="text-xs tracking-wider">CONNECTING TO GEOSPATIAL OBSERVATORY...</span>
          </div>
        ) : (
          <GeospatialMap
            onViewportChange={setMapBounds}
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
          className="absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-canvas/90 backdrop-blur-xl border border-line text-ink hover:text-ink shadow-2xl text-xs font-mono transition-all hover:border-cyan-500/50"
          title="Expand Corridor Deck"
        >
          <Layers className="w-4 h-4 text-information" />
          <span className="font-semibold text-ink truncate max-w-[180px]">
            {selectedRoad ? selectedRoad.name : 'Area overview'}
          </span>
          <ChevronRight className="w-4 h-4 text-muted" />
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
        <div className="flex-1 bg-surface/95 backdrop-blur-xl border border-line/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-ink">
          
          {/* Deck Header: Mode-Dependent */}
          {selectedRoad ? (
            /* Selected Road Header */
            <div className="p-3.5 border-b border-line/80 bg-surface/60 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <button
                  onClick={() => {
                    setSelectedRoad(null);
                    setSelectedSignal(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-information hover:text-information transition-colors mb-1.5 font-semibold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Area overview</span>
                </button>
                <h2 className="text-sm font-bold text-ink leading-snug truncate">
                  {selectedRoad.name}
                </h2>
                <p className="text-[11px] text-muted font-mono truncate mt-0.5">
                  {selectedRoad.ref ? `${selectedRoad.ref} • ` : ''}{selectedRoad.district}, {selectedRoad.state}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={handleShare}
                  title="Copy link to clipboard"
                  className="p-1.5 rounded-lg hover:bg-soft text-muted hover:text-ink transition-colors text-xs flex items-center gap-1 font-mono"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied && <span className="text-[10px] text-information">Copied</span>}
                </button>
                <button
                  onClick={() => setIsDeckCollapsed(true)}
                  title="Collapse Inspector Card"
                  className="p-1.5 rounded-lg hover:bg-soft text-muted hover:text-ink transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : selectedSignal ? (
            /* Selected Signal Header */
            <div className="p-3.5 border-b border-line/80 bg-surface/60 flex items-center justify-between gap-2 flex-shrink-0">
              <button
                onClick={() => {
                  setSelectedSignal(null);
                  setSelectedRoad(null);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono text-information hover:text-information transition-colors font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Area overview</span>
              </button>
              <button
                onClick={() => setIsDeckCollapsed(true)}
                title="Collapse Inspector Card"
                className="p-1.5 rounded-lg hover:bg-soft text-muted hover:text-ink transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-4 border-b border-line flex items-center justify-between"><h2 className="font-semibold text-lg">Area overview</h2><button aria-label="Collapse area overview" onClick={()=>setIsDeckCollapsed(true)} className="p-2 hover:bg-soft rounded-lg"><ChevronLeft className="w-4 h-4"/></button></div>
          )}

          {/* Deck Body: Directory vs. Road Dossier vs. Signal Dossier */}
          {selectedRoad ? (
            /* Mode B: Road Dossier */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Dual-State Machine Integrity Banner */}
              <div className="p-3 bg-surface/80 border-b border-line/80 flex-shrink-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2 flex items-center justify-between">
                  <span>Dual State Machine Integrity</span>
                  <span className="text-information font-semibold">Non-Overwriting Model</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Official Public Works State */}
                  <div className="p-2.5 rounded-lg bg-canvas/90 border border-cyan-500/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-information mb-0.5">
                      <Building2 className="w-3 h-3" />
                      <span>OFFICIAL STATUS</span>
                    </div>
                    {primaryWork ? (
                      <div>
                        <p className="font-semibold text-ink capitalize text-[11px] leading-tight">
                          {primaryWork.official_status.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-muted font-mono mt-0.5 truncate">
                          {primaryWork.tender_id || 'Tender Package Active'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted text-[11px]">No active tender</p>
                    )}
                  </div>

                  {/* Observed Ground Reality State */}
                  <div className="p-2.5 rounded-lg bg-canvas/90 border border-amber-500/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-warning mb-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      <span>GROUND REALITY</span>
                    </div>
                    {hasExcavation ? (
                      <div>
                        <p className="font-semibold text-ink text-[11px] leading-tight">Active Dig Reported</p>
                        <p className="text-[10px] text-warning/80 font-mono mt-0.5">
                          {selectedRoad.incidents?.length} Ground observation(s)
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-positive text-[11px] leading-tight">Passable / Restored</p>
                        <p className="text-[10px] text-muted font-mono mt-0.5">No open trenches</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dossier Tabs */}
              <div className="flex border-b border-line text-xs font-mono bg-canvas flex-shrink-0">
                <button
                  onClick={() => setActiveDossierTab('overview')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'overview'
                      ? 'border-cyan-400 text-information'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Dossier
                </button>
                <button
                  onClick={() => setActiveDossierTab('contractor')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'contractor'
                      ? 'border-cyan-400 text-information'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Contractor & Spend
                </button>
                <button
                  onClick={() => setActiveDossierTab('timeline')}
                  className={`flex-1 py-2 text-center font-semibold border-b-2 transition-colors ${
                    activeDossierTab === 'timeline'
                      ? 'border-cyan-400 text-information'
                      : 'border-transparent text-muted hover:text-ink'
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
                      <div className="p-2 rounded-lg bg-surface border border-line">
                        <span className="text-[10px] text-muted font-mono block">LENGTH</span>
                        <span className="font-bold text-xs text-ink font-mono">
                          {(parseFloat(selectedRoad.total_length_m || '0') / 1000).toFixed(1)} km
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-surface border border-line">
                        <span className="text-[10px] text-muted font-mono block">SEGMENTS</span>
                        <span className="font-bold text-xs text-ink font-mono">
                          {selectedRoad.segments?.length || 1}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-surface border border-line">
                        <span className="text-[10px] text-muted font-mono block">SPEND</span>
                        <span className="font-bold text-xs text-information font-mono">
                          {spendCr ? `₹${spendCr} Cr` : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Primary Work Card */}
                    {primaryWork && (
                      <div className="p-3 rounded-lg bg-surface/90 border border-line space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-information uppercase font-mono">
                            Work Package
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-information border border-cyan-800/60">
                            {primaryWork.official_status}
                          </span>
                        </div>
                        <p className="text-ink font-medium text-xs leading-relaxed">
                          {primaryWork.package_name}
                        </p>
                        <div className="pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-muted font-mono">
                          <span>Contractor: <strong className="text-ink">{primaryWork.contractor_name}</strong></span>
                          <span>Spend: <strong className="text-information">₹{spendCr} Cr</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Ground Evidence Action Card */}
                    <div className="p-3 rounded-lg bg-surface/60 border border-cyan-500/20 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-ink text-xs">Have visual ground evidence?</p>
                        <p className="text-[11px] text-muted mt-0.5">
                          Attach geotagged observation to this road ledger.
                        </p>
                      </div>
                      <Link
                        href="/report"
                        className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-bold font-mono text-xs whitespace-nowrap transition-colors"
                      >
                        + Add Evidence
                      </Link>
                    </div>

                    {/* Full Ledger Link */}
                    <Link
                      href={`/roads/${selectedRoad.id}`}
                      className="block text-center py-2 px-3 rounded-lg bg-surface border border-line text-information hover:text-information font-mono text-xs font-semibold transition-colors"
                    >
                      Open Full Historical Ledger Page →
                    </Link>
                  </div>
                )}

                {activeDossierTab === 'contractor' && (
                  <div className="space-y-3">
                    {primaryWork ? (
                      <div className="p-3 rounded-lg bg-surface border border-line space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-mono text-information block">Awarded Contractor</span>
                            <h3 className="text-xs font-bold text-ink mt-0.5">{primaryWork.contractor_name}</h3>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-soft text-muted">
                            Primary
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-line text-muted">
                          <div>
                            <span>CIN:</span>
                            <p className="text-ink font-bold">{primaryWork.cin || 'CIN Registered'}</p>
                          </div>
                          <div>
                            <span>GSTIN:</span>
                            <p className="text-ink font-bold">{primaryWork.gstin || 'GST Verified'}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-line space-y-1 text-[11px] text-muted font-mono">
                          <div className="flex justify-between">
                            <span>Tender Ref:</span>
                            <span className="text-ink">{primaryWork.tender_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Agreement ID:</span>
                            <span className="text-ink">{primaryWork.contract_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sanctioned Budget:</span>
                            <span className="text-information font-bold">₹{spendCr} Crores</span>
                          </div>
                          {primaryWork.defect_liability_end_date && (
                            <div className="flex justify-between text-positive">
                              <span>Warranty Active Until:</span>
                              <span>{primaryWork.defect_liability_end_date}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-line/80 text-[10px] text-quiet font-mono flex items-center justify-between">
                          <span>Provenance: {primaryWork.authority_name || 'MoRTH / CPPP'}</span>
                          <span className="text-information font-semibold">GODL India 1.0</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted font-mono bg-surface/50 rounded-lg border border-line text-xs">
                        No contractor allocated in public procurement registry yet.
                      </div>
                    )}
                  </div>
                )}

                {activeDossierTab === 'timeline' && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-muted font-mono mb-2">
                      Multi-source intelligence aggregated across government portals, regional news, community feeds, and field observations:
                    </p>

                    {roadTimelineEvents.length === 0 ? (
                      <div className="p-4 text-center text-muted font-mono bg-surface/50 rounded-lg border border-line text-xs">
                        No multi-source intelligence reports recorded for this corridor yet.
                      </div>
                    ) : (
                      <div className="space-y-2 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-soft">
                        {roadTimelineEvents.map((evt) => {
                          const cls = getTimelineBadgeClasses(evt.badgeStyle);
                          return (
                            <div key={evt.id} className="relative pl-6 text-xs">
                              <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full ${cls.dotBg} border flex items-center justify-center`}>
                                <span className={`w-1 h-1 rounded-full ${cls.dotFill}`}></span>
                              </div>
                              <div className="p-2.5 rounded bg-surface/90 border border-line space-y-1">
                                <div className="flex items-center justify-between font-mono text-[10px]">
                                  <span className={`${cls.text} font-bold`}>{evt.sourceBadge}</span>
                                  <span className="text-quiet">{evt.date}</span>
                                </div>
                                <p className="font-semibold text-ink text-xs">{evt.title}</p>
                                <p className="text-muted text-[11px] leading-relaxed">{evt.description}</p>
                                {evt.url && (
                                  <a
                                    href={evt.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-information hover:text-information font-mono pt-0.5"
                                  >
                                    <span>Source Record</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                      ? 'bg-amber-950/80 text-warning border border-amber-800/60'
                      : 'bg-purple-950 text-source border border-purple-800/60'
                  }`}>
                    {selectedSignal.status === 'publisher_reported' ? 'Publisher Claim (Unverified)' : (selectedSignal.status || 'Public Signal')}
                  </span>
                  {selectedSignal.is_demo && (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-soft text-muted border border-line">
                      Demo Content
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted font-mono">{selectedSignal.date}</span>
              </div>

              <div>
                <h2 className="text-sm font-bold text-ink leading-snug">{selectedSignal.title}</h2>
                <p className="text-[11px] font-mono text-information mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{selectedSignal.road_name}</span>
                </p>
              </div>

              {selectedSignal.disclaimer && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[11px] text-warning/90 leading-relaxed font-mono">
                  <span className="font-bold text-warning">Notice: </span>
                  {selectedSignal.disclaimer}
                </div>
              )}

              <div className="p-3 rounded-lg bg-surface/90 border border-line text-muted leading-relaxed text-xs">
                {selectedSignal.details}
              </div>

              <div className="pt-2 border-t border-line space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-muted font-mono text-[11px]">
                  <span>Source Channel:</span>
                  <span className="font-semibold text-ink">{selectedSignal.source}</span>
                </div>
                <div className="flex items-center justify-between text-muted font-mono text-[11px]">
                  <span>Coordinates:</span>
                  <span className="text-muted">{selectedSignal.lat.toFixed(4)}° N, {selectedSignal.lon.toFixed(4)}° E</span>
                </div>
              </div>

              {selectedSignal.source_url && (
                <a
                  href={selectedSignal.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-500/50 text-information hover:bg-cyan-900 transition-colors text-xs font-mono font-semibold"
                >
                  <span>Inspect Source Record</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto"><AreaOverview bounds={mapBounds}/></div>
          )}

        </div>
      </div>
    </div>
  );
}
