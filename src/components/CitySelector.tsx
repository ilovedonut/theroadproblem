'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, ChevronDown, ChevronRight, MapPin, 
  Layers, Check, X, AlertCircle, Compass, Info,
  SlidersHorizontal, CheckCircle2, AlertTriangle, ArrowRight
} from 'lucide-react';
import { 
  getAllCities, 
  getCityById, 
  searchCities, 
  getCitiesByMetro,
  CityEntry, 
  MetroGroup 
} from '@/lib/city-catalogue';

export interface CityScheme {
  id?: string;
  scheme_id?: string;
  name: string;
  units_count?: number;
  status?: string;
  levels?: string[];
  [key: string]: any;
}

export interface CitySelectorProps {
  selectedCityId: string | null;
  selectedScheme: string | null;
  selectedJurisdictionUnit: string | null;
  onSelectCity: (cityId: string | null) => void;
  onSelectScheme?: (schemeId: string) => void;
  onSelectJurisdictionUnit?: (unitId: string | null) => void;
  availableSchemes?: CityScheme[];
  jurisdictionUnits?: Array<{ id: string; name: string; number?: number | string }>;
  className?: string;
}

const METRO_GROUPS: Array<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All Cities (36)' },
  { id: 'NCR', label: 'NCR (6)' },
  { id: 'MMR', label: 'MMR (3)' },
  { id: 'Tricity', label: 'Tricity (1)' },
];

export const CITY_DEFAULT_SCHEMES: Record<string, CityScheme[]> = {
  chennai: [
    { id: 'zones', name: 'Zones (15)', units_count: 15, status: 'verified' },
    { id: 'regions', name: 'Regions (3)', units_count: 3, status: 'verified' },
    { id: 'wards', name: 'Wards (200)', units_count: 200, status: 'verified' },
  ],
  mumbai: [
    { id: 'wards', name: 'Administrative Wards (24)', units_count: 24, status: 'verified' },
    { id: 'prabhags', name: 'Electoral Prabhags', status: 'verified' },
  ],
  delhi: [
    { id: 'zones', name: 'MCD Zones (12)', units_count: 12, status: 'verified' },
    { id: 'divisions', name: 'Civil Divisions / NDMC', status: 'verified' },
  ],
  noida: [
    { id: 'sectors', name: 'Authority Sectors', status: 'verified' },
    { id: 'circles', name: 'Work Circles', status: 'verified' },
  ],
  bengaluru: [
    { id: 'corporations', name: 'GBA Five Corporations', units_count: 5, status: 'pending_delimitation' },
  ],
};

export function getCapabilityBadge(city: CityEntry) {
  if (city.capabilities.road_coverage === 'indexed') {
    return {
      label: 'Roads Indexed',
      variant: 'indexed' as const,
      badgeClass: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60',
      dotClass: 'bg-emerald-400',
    };
  }
  if (city.capabilities.jurisdiction === 'verified') {
    return {
      label: 'Boundaries Ready',
      variant: 'boundaries' as const,
      badgeClass: 'bg-cyan-950/80 text-cyan-400 border border-cyan-800/60',
      dotClass: 'bg-cyan-400',
    };
  }
  if (city.capabilities.navigation === 'marker_only') {
    return {
      label: 'Marker Only',
      variant: 'marker' as const,
      badgeClass: 'bg-surface text-muted border border-line',
      dotClass: 'bg-muted',
    };
  }
  return {
    label: 'Boundary Pending',
    variant: 'pending' as const,
    badgeClass: 'bg-amber-950/80 text-amber-400 border border-amber-800/60',
    dotClass: 'bg-amber-400',
  };
}

export function CitySelector({
  selectedCityId,
  selectedScheme,
  selectedJurisdictionUnit,
  onSelectCity,
  onSelectScheme,
  onSelectJurisdictionUnit,
  availableSchemes,
  jurisdictionUnits,
  className = '',
}: CitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMetro, setSelectedMetro] = useState<string>('ALL');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [showNoticeCard, setShowNoticeCard] = useState(true);
  const [isSchemeDropdownOpen, setIsSchemeDropdownOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const schemeDropdownRef = useRef<HTMLDivElement>(null);

  const currentCity = useMemo(() => {
    return selectedCityId ? getCityById(selectedCityId) : null;
  }, [selectedCityId]);

  const activeSchemes = useMemo(() => {
    const rawList = (availableSchemes && availableSchemes.length > 0)
      ? availableSchemes
      : (selectedCityId && CITY_DEFAULT_SCHEMES[selectedCityId])
        ? CITY_DEFAULT_SCHEMES[selectedCityId]
        : [];

    return rawList.map((s: any) => {
      const schemeId = String(s.id || s.scheme_id || '');
      return {
        ...s,
        id: schemeId,
        scheme_id: s.scheme_id || schemeId,
      };
    });
  }, [availableSchemes, selectedCityId]);

  const currentSchemeObj = useMemo(() => {
    if (!selectedScheme || activeSchemes.length === 0) return null;
    const target = selectedScheme.toLowerCase().trim();
    return activeSchemes.find((s) => {
      const sId = String(s.id || s.scheme_id || '').toLowerCase().trim();
      return sId === target || sId.includes(target) || target.includes(sId);
    }) || null;
  }, [selectedScheme, activeSchemes]);

  // Filtered city list based on search and metro group
  const filteredCities = useMemo(() => {
    let cities = searchQuery ? searchCities(searchQuery) : getAllCities();
    if (selectedMetro !== 'ALL') {
      cities = cities.filter((c) => c.metro_group === selectedMetro);
    }
    return cities;
  }, [searchQuery, selectedMetro]);

  // Focus trap and auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setFocusedIndex(0);
    } else {
      setSearchQuery('');
      setSelectedMetro('ALL');
    }
  }, [isOpen]);

  // Close scheme dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        schemeDropdownRef.current &&
        !schemeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSchemeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation within the discovery modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < filteredCities.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCities.length - 1
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cityToSelect = filteredCities[focusedIndex];
        if (cityToSelect) {
          onSelectCity(cityToSelect.id);
          setIsOpen(false);
        }
      }
    },
    [isOpen, filteredCities, focusedIndex, onSelectCity]
  );

  // Keep focused item in view when arrow navigating
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeElement = listRef.current.children[focusedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusedIndex, isOpen]);

  return (
    <div className={`relative z-40 select-none ${className}`}>
      {/* Top Discovery Bar: Breadcrumb + Scheme Selector + Notice Card */}
      <div className="flex flex-wrap items-center gap-2 max-w-full">
        {/* Breadcrumb Navigation Pill */}
        <nav 
          aria-label="Geographic Hierarchy Breadcrumb"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas/90 backdrop-blur-xl border border-line text-xs font-mono text-ink shadow-lg transition-all"
        >
          {/* Level 1: India (National Orbit) */}
          <button
            onClick={() => {
              onSelectCity(null);
              onSelectJurisdictionUnit?.(null);
            }}
            title="Zoom out to National India Overview"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface text-muted hover:text-information transition-colors font-semibold"
          >
            <Compass className="w-3.5 h-3.5 text-information" />
            <span>India</span>
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-muted/60 flex-shrink-0" />

          {/* Level 2: City Selector */}
          <button
            onClick={() => setIsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            className={`flex items-center gap-1 px-2 py-0.5 rounded font-bold transition-all ${
              currentCity
                ? 'bg-surface text-ink hover:text-information border border-line'
                : 'text-information hover:bg-surface'
            }`}
          >
            <MapPin className="w-3 h-3 text-information" />
            <span className="truncate max-w-[140px] sm:max-w-[180px]">
              {currentCity ? currentCity.name : 'Select City'}
            </span>
            <ChevronDown className="w-3 h-3 text-muted" />
          </button>

          {/* Level 3: Jurisdiction Scheme or Active Unit */}
          {currentCity && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted/60 flex-shrink-0" />
              {selectedJurisdictionUnit ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/80 text-information border border-cyan-800/60 font-semibold text-[11px]">
                  <span className="truncate max-w-[120px]">
                    {selectedJurisdictionUnit}
                  </span>
                  <button
                    onClick={() => onSelectJurisdictionUnit?.(null)}
                    title="Clear unit filter"
                    className="p-0.5 hover:bg-cyan-900 rounded text-cyan-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="text-muted text-[11px] truncate max-w-[120px] sm:max-w-[150px]">
                  {currentSchemeObj ? currentSchemeObj.name : 'All Jurisdictions'}
                </span>
              )}
            </>
          )}
        </nav>

        {/* Scheme Selector Dropdown (When city has multiple schemes) */}
        {currentCity && activeSchemes.length > 0 && onSelectScheme && (
          <div ref={schemeDropdownRef} className="relative">
            <button
              onClick={() => setIsSchemeDropdownOpen(!isSchemeDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-canvas/90 backdrop-blur-xl border border-line text-xs font-mono text-ink shadow-lg hover:border-cyan-500/50 transition-all"
              title="Switch Jurisdiction Boundary Scheme"
            >
              <Layers className="w-3.5 h-3.5 text-information" />
              <span className="font-semibold text-[11px]">
                {currentSchemeObj ? currentSchemeObj.name : 'Select Scheme'}
              </span>
              <ChevronDown className="w-3 h-3 text-muted" />
            </button>

            {isSchemeDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 rounded-xl bg-surface border border-line shadow-2xl p-1.5 z-50 text-xs font-mono">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted border-b border-line mb-1">
                  Jurisdiction Schemes
                </div>
                <div className="space-y-0.5">
                  {activeSchemes.map((scheme, idx) => {
                    const schemeKey = scheme.id || scheme.scheme_id || `scheme-${idx}`;
                    const isSelected = selectedScheme?.toLowerCase().trim() === schemeKey.toLowerCase().trim();
                    return (
                      <button
                        key={schemeKey}
                        onClick={() => {
                          onSelectScheme(schemeKey);
                          onSelectJurisdictionUnit?.(null);
                          setIsSchemeDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/80 text-information font-bold border border-cyan-800/60'
                            : 'hover:bg-soft text-ink'
                        }`}
                      >
                        <div>
                          <div className="text-xs">{scheme.name}</div>
                          {scheme.units_count && (
                            <div className="text-[10px] text-muted">
                              {scheme.units_count} units
                            </div>
                          )}
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-information" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Honest Notice Pill / Toggle for selected city */}
        {currentCity && currentCity.notice && showNoticeCard && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/40 text-warning text-xs font-mono backdrop-blur-xl shadow-lg max-w-md truncate">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate text-[11px] leading-tight" title={currentCity.notice}>
              {currentCity.notice}
            </span>
            <button
              onClick={() => setShowNoticeCard(false)}
              className="p-0.5 hover:bg-amber-900/50 rounded text-warning/70 hover:text-warning ml-auto"
              title="Dismiss banner"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Discovery Modal / Drawer */}
      {isOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-label="City Discovery and Selection"
          onKeyDown={handleKeyDown}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden text-ink font-sans">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-line bg-surface/80 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-ink">
                    Discover India Cities
                  </h2>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-information border border-cyan-800/60 font-semibold">
                    36 Cities Scoped
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 font-mono">
                  Explore indexed street networks, municipal corporations, zones, wards, and statutory warranties.
                </p>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-soft text-muted hover:text-ink transition-colors"
                title="Close modal (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input & Metro Group Filters */}
            <div className="p-3 sm:p-4 border-b border-line bg-canvas space-y-3">
              <div className="relative flex items-center">
                <Search className="absolute left-3 w-4 h-4 text-muted pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFocusedIndex(0);
                  }}
                  placeholder="Search by city, local script, or alias (e.g. Bangalore, Gurgaon, Bombay, சென்னை)..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-surface border border-line text-xs sm:text-sm text-ink placeholder:text-muted focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 p-1 rounded-md text-muted hover:text-ink"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Metro Group Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono uppercase text-muted mr-1">
                  Metro Filter:
                </span>
                {METRO_GROUPS.map((metro) => (
                  <button
                    key={metro.id}
                    onClick={() => {
                      setSelectedMetro(metro.id);
                      setFocusedIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                      selectedMetro === metro.id
                        ? 'bg-cyan-950 text-information font-bold border border-cyan-700/60'
                        : 'bg-surface text-muted hover:text-ink border border-line'
                    }`}
                  >
                    {metro.label}
                  </button>
                ))}
              </div>
            </div>

            {/* City Cards Listbox */}
            <div 
              ref={listRef}
              role="listbox"
              tabIndex={0}
              aria-label="City list"
              className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 focus:outline-none"
            >
              {filteredCities.length === 0 ? (
                <div className="p-8 text-center text-muted font-mono text-xs">
                  No cities found matching &quot;{searchQuery}&quot;. Try searching for an alias or state.
                </div>
              ) : (
                filteredCities.map((city, idx) => {
                  const isSelected = selectedCityId ? selectedCityId.toLowerCase().trim() === city.id.toLowerCase().trim() : false;
                  const isFocused = idx === focusedIndex;
                  const capability = getCapabilityBadge(city);

                  return (
                    <div
                      key={city.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onSelectCity(city.id);
                        setIsOpen(false);
                      }}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md'
                          : isFocused
                          ? 'bg-soft border-line/80'
                          : 'bg-surface/80 border-line hover:border-line/80'
                      }`}
                    >
                      {/* City Names & State */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-ink">
                            {city.name}
                          </span>
                          <span className="text-xs text-muted font-mono">
                            {city.local_name}
                          </span>
                          {city.metro_group && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-800/60">
                              {city.metro_group}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted font-mono mt-0.5">
                          {city.state} • {city.structure_summary}
                        </p>
                      </div>

                      {/* Capabilities Indicator & Selection status */}
                      <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${capability.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${capability.dotClass}`} />
                          <span>{capability.label}</span>
                        </span>

                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-information flex items-center justify-center">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted/40" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Preview: Notice of focused or selected city */}
            {filteredCities[focusedIndex] && (
              <div className="p-3 border-t border-line bg-canvas/80 text-xs font-mono flex items-start gap-2 text-muted">
                <Info className="w-4 h-4 text-information flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-ink font-semibold">
                    {filteredCities[focusedIndex].name} Notice:{' '}
                  </span>
                  <span className="text-muted leading-relaxed">
                    {filteredCities[focusedIndex].notice}
                  </span>
                </div>
              </div>
            )}

            {/* Keyboard shortcut helper bar */}
            <div className="px-4 py-2 bg-surface/50 border-t border-line text-[11px] font-mono text-muted flex items-center justify-between">
              <span className="hidden sm:inline">
                Navigation: <kbd className="px-1 py-0.5 rounded bg-surface border border-line">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-surface border border-line">↓</kbd> to move, <kbd className="px-1 py-0.5 rounded bg-surface border border-line">Enter</kbd> to select
              </span>
              <span>
                <kbd className="px-1 py-0.5 rounded bg-surface border border-line">Esc</kbd> to close
              </span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
