'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, Layers, Building2, 
  MapPin, ExternalLink, ChevronRight, ChevronLeft,
  Share2, ArrowLeft, Info
} from 'lucide-react';
import { GeospatialMap, RoadFeature, MultiSourceSignal } from '@/components/GeospatialMap';
import { CitySelector, CITY_DEFAULT_SCHEMES } from '@/components/CitySelector';
import { AreaOverview } from '@/components/AreaOverview';
import type { MapBounds } from '@/lib/map-bounds';
import { loadMapDeckPages } from '@/lib/map-deck-loader';
import { getCityById, resolveCityId } from '@/lib/city-catalogue';

export default function GeospatialDeckPage() {
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(10.5);

  // City and Jurisdiction Hierarchy State
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedScheme, setSelectedScheme] = useState<string | null>(null);
  const [selectedJurisdictionUnit, setSelectedJurisdictionUnit] = useState<string | null>(null);
  const [cityManifest, setCityManifest] = useState<any>(null);

  const [roads, setRoads] = useState<RoadFeature[]>([]);
  const [signals, setSignals] = useState<MultiSourceSignal[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [roadLoadError, setRoadLoadError] = useState<string | null>(null);

  const [selectedRoad, setSelectedRoad] = useState<RoadFeature | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<MultiSourceSignal | null>(null);
  const [isDeckCollapsed, setIsDeckCollapsed] = useState(false);
  const [activeDossierTab, setActiveDossierTab] = useState<'overview' | 'contractor' | 'timeline'>('overview');
  const [copied, setCopied] = useState(false);

  const deckAbortRef = useRef<AbortController | null>(null);
  const deckReqIdRef = useRef(0);
  const selectedRoadIdRef = useRef<string | null>(null);
  selectedRoadIdRef.current = selectedRoad?.id || null;

  const [activeLayerFilters, setActiveLayerFilters] = useState({
    officialWorks: true,
    excavations: true,
    newsSocial: true,
    verifiedIntact: true,
  });

  // Read initial city, scheme, unit from URL parameters on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const cityParam = searchParams.get('city');
    const schemeParam = searchParams.get('scheme');
    const unitParam = searchParams.get('unit');

    if (cityParam) {
      const canonicalId = resolveCityId(cityParam) || cityParam.toLowerCase().trim();
      const city = getCityById(canonicalId);
      if (city) {
        setSelectedCityId(city.id);
        const defaultScheme = schemeParam || CITY_DEFAULT_SCHEMES[city.id]?.[0]?.id || 'zones';
        setSelectedScheme(defaultScheme);
        if (unitParam) {
          setSelectedJurisdictionUnit(unitParam);
        }
      }
    }
  }, []);

  // Synchronize URL parameters with replaceState when city/scheme/unit changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (selectedCityId) {
      url.searchParams.set('city', selectedCityId);
    } else {
      url.searchParams.delete('city');
    }

    if (selectedScheme) {
      url.searchParams.set('scheme', selectedScheme);
    } else {
      url.searchParams.delete('scheme');
    }

    if (selectedJurisdictionUnit) {
      url.searchParams.set('unit', selectedJurisdictionUnit);
    } else {
      url.searchParams.delete('unit');
    }

    const nextRelativeUrl = url.pathname + url.search;
    window.history.replaceState({}, '', nextRelativeUrl);
  }, [selectedCityId, selectedScheme, selectedJurisdictionUnit]);

  // Fetch City Manifest when selectedCityId changes
  useEffect(() => {
    if (!selectedCityId) {
      setCityManifest(null);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/v1/regions/${encodeURIComponent(selectedCityId)}/manifest`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data) {
          setCityManifest(data);
          // If no active scheme selected, set first available scheme
          if (!selectedScheme && Array.isArray(data.jurisdiction_schemes) && data.jurisdiction_schemes.length > 0) {
            setSelectedScheme(data.jurisdiction_schemes[0].scheme_id || data.jurisdiction_schemes[0].id);
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('Failed to fetch city manifest:', err);
        }
      });

    return () => controller.abort();
  }, [selectedCityId, selectedScheme]);

  const handleSelectCity = useCallback((cityId: string | null) => {
    setSelectedCityId(cityId);
    setSelectedJurisdictionUnit(null);
    setSelectedRoad(null);
    setSelectedSignal(null);
    if (cityId) {
      const defaultScheme = CITY_DEFAULT_SCHEMES[cityId]?.[0]?.id || 'zones';
      setSelectedScheme(defaultScheme);
    } else {
      setSelectedScheme(null);
      setCityManifest(null);
    }
  }, []);

  const handleSelectScheme = useCallback((schemeId: string) => {
    setSelectedScheme(schemeId);
    setSelectedJurisdictionUnit(null);
  }, []);

  const handleSelectJurisdictionUnit = useCallback((unitId: string | null) => {
    setSelectedJurisdictionUnit(unitId);
  }, []);

  const fetchDeckData = useCallback(async (bounds?: MapBounds | null, zoom?: number) => {
    if (deckAbortRef.current) {
      deckAbortRef.current.abort();
    }
    const controller = new AbortController();
    deckAbortRef.current = controller;
    const reqId = ++deckReqIdRef.current;

    setLoading(true);
    setRoadLoadError(null);

    try {
      const qs = new URLSearchParams();
      qs.set('include_index_stats', 'false');
      if (zoom !== undefined && zoom < 11.5) qs.set('limit', '2500');
      if (bounds) qs.set('bbox', bounds.join(','));
      if (zoom !== undefined && Number.isFinite(zoom)) qs.set('zoom', String(zoom));
      if (selectedRoadIdRef.current) qs.set('selected_road_id', selectedRoadIdRef.current);
      if (selectedCityId) qs.set('city', selectedCityId);
      qs.set('_t', String(Date.now()));

      await loadMapDeckPages<RoadFeature>({
        params: qs,
        signal: controller.signal,
        onPage: (data, nextRoads, complete) => {
          if (reqId !== deckReqIdRef.current) return;
          setRoads(nextRoads);
          if (Array.isArray(data.signals)) setSignals(data.signals);
          setSummary((previous: any) => ({
            ...(data.summary || previous),
            visible_roads_returned: nextRoads.length,
            viewport_complete: complete,
          }));

          // Preserve selectedRoad inspection state when visible map data refreshes
          setSelectedRoad((prev) => {
            if (!prev) return null;
            const updated = nextRoads.find((r) => r.id === prev.id);
            return updated || prev;
          });
        },
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to load deck telemetry', err);
        if (reqId === deckReqIdRef.current) setRoadLoadError('Some roads could not be loaded for this area.');
      }
    } finally {
      if (reqId === deckReqIdRef.current) {
        setLoading(false);
      }
    }
  }, [selectedCityId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsDeckCollapsed(true);
    }
    return () => {
      deckAbortRef.current?.abort();
    };
  }, [fetchDeckData]);

  // Debounced viewport-bounded fetch on map pan/zoom with stale-request cancellation
  useEffect(() => {
    if (!mapBounds) return;
    const timer = setTimeout(() => {
      fetchDeckData(mapBounds, mapZoom);
    }, 250);
    return () => clearTimeout(timer);
  }, [mapBounds, mapZoom, fetchDeckData]);

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

  const handleViewportChange = useCallback((bounds: MapBounds, zoom?: number) => {
    setMapBounds(bounds);
    if (zoom !== undefined) {
      setMapZoom(zoom);
    }
  }, []);

  const handleToggleFilter = (key: 'officialWorks' | 'excavations' | 'newsSocial' | 'verifiedIntact') => {
    setActiveLayerFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentCity = useMemo(() => {
    return selectedCityId ? getCityById(selectedCityId) : null;
  }, [selectedCityId]);

  const primaryWork = selectedRoad?.works && selectedRoad.works.length > 0 ? selectedRoad.works[0] : null;
  const hasExcavation = selectedRoad?.incidents && selectedRoad.incidents.length > 0;
  const spendCr = primaryWork?.contract_value_inr 
    ? (parseFloat(String(primaryWork.contract_value_inr)) / 10000000).toFixed(2)
    : null;

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
          description: `Sanctioned under ${w.tender_id || w.contract_id || 'Tender'} for ₹${(Number(w.contract_value_inr || 0) / 10000000).toFixed(2)} Cr. ${w.package_name}`,
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
            description: `Mandatory contractor maintenance liability legally enforced through ${w.defect_liability_end_date}.`,
          });
        }
      }
    }

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
        url: sig.source_url,
      });
    }

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
          description: `Lifecycle status: ${inc.lifecycle_status}. Corroboration state: ${inc.verification_state}.`,
        });
      }
    }

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
        <GeospatialMap
          onViewportChange={handleViewportChange}
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
          selectedCityId={selectedCityId}
          selectedScheme={selectedScheme}
          selectedJurisdictionUnit={selectedJurisdictionUnit}
          onSelectCity={handleSelectCity}
          onSelectJurisdictionUnit={handleSelectJurisdictionUnit}
          roadVersion="20261016"
        />
        {(loading || roadLoadError || mapZoom < 11.5) && (
          <div role="status" aria-live="polite" className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-2rem)] rounded-xl border border-line bg-surface px-4 py-2 text-sm text-ink shadow-md">
            {roadLoadError ? (
              <>
                {roadLoadError}{' '}
                <button className="min-h-11 underline text-information" onClick={() => fetchDeckData(mapBounds, mapZoom)}>
                  Retry
                </button>
              </>
            ) : loading ? (
              `Loading roads in this area…${roads.length ? ` ${roads.length.toLocaleString()} loaded` : ''}`
            ) : (
              'Major roads shown. Zoom in to see neighbourhood streets.'
            )}
          </div>
        )}
      </div>

      {/* Top Floating Discovery Bar Container */}
      <div className="absolute top-3 left-3 right-3 z-40 flex items-center gap-2 pointer-events-none">
        {/* Collapsed HUD Trigger Pill */}
        {isDeckCollapsed && (
          <button
            onClick={() => setIsDeckCollapsed(false)}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-canvas/90 backdrop-blur-xl border border-line text-ink hover:text-ink shadow-2xl text-xs font-mono transition-all hover:border-cyan-500/50 flex-shrink-0"
            title="Expand Corridor Deck"
          >
            <Layers className="w-4 h-4 text-information" />
            <span className="font-semibold text-ink truncate max-w-[140px]">
              {selectedRoad ? selectedRoad.name : currentCity ? currentCity.name : 'Area overview'}
            </span>
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        )}

        {/* City Discovery Bar & Breadcrumb Navigator */}
        <div className={`pointer-events-auto transition-all duration-300 ${!isDeckCollapsed ? 'md:ml-[425px]' : ''}`}>
          <CitySelector
            selectedCityId={selectedCityId}
            selectedScheme={selectedScheme}
            selectedJurisdictionUnit={selectedJurisdictionUnit}
            onSelectCity={handleSelectCity}
            onSelectScheme={handleSelectScheme}
            onSelectJurisdictionUnit={handleSelectJurisdictionUnit}
            availableSchemes={cityManifest?.jurisdiction_schemes}
          />
        </div>
      </div>

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
                  {selectedRoad.display_name || selectedRoad.name}
                </h2>
                <p className="text-[11px] text-muted font-mono truncate mt-0.5">
                  {selectedRoad.has_official_name === false ? 'Unnamed road • ' : ''}
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
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">
                  {currentCity ? `${currentCity.name} Overview` : 'Area overview'}
                </h2>
                {currentCity && (
                  <p className="text-[11px] text-muted font-mono mt-0.5">
                    {selectedJurisdictionUnit ? `Filter: ${selectedJurisdictionUnit}` : currentCity.structure_summary}
                  </p>
                )}
              </div>
              <button
                aria-label="Collapse area overview"
                onClick={() => setIsDeckCollapsed(true)}
                className="p-2 hover:bg-soft rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Deck Body: Directory vs. Road Dossier vs. Signal Dossier */}
          {selectedRoad ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 bg-surface/80 border-b border-line/80 flex-shrink-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-2 flex items-center justify-between">
                  <span>Dual State Machine Integrity</span>
                  <span className="text-information font-semibold">Non-Overwriting Model</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
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

              <div className="p-3.5 flex-1 overflow-y-auto space-y-3.5 text-xs font-sans">
                {activeDossierTab === 'overview' && (
                  <div className="space-y-3">
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
            <div className="flex-1 overflow-y-auto">
              <AreaOverview bounds={mapBounds} enabled={!loading} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
