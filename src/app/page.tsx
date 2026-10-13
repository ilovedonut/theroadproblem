'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, AlertTriangle, ShieldCheck, MapPin, Construction, Layers, RefreshCw } from 'lucide-react';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

interface RoadItem {
  id: string;
  name: string;
  ref: string | null;
  road_class: string;
  authority_name: string | null;
  state: string;
  district: string;
  active_incidents_count: string;
  total_length_m: string;
}

interface IncidentItem {
  id: string;
  category: string;
  lifecycle_status: string;
  verification_state: string;
  road_name: string | null;
  road_ref: string | null;
  last_observed_at: string;
}

export default function ExplorePage() {
  const [locale, setLocale] = useState<'en' | 'hi'>('en');
  const [lowData, setLowData] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [roads, setRoads] = useState<RoadItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedLocale = (localStorage.getItem('app_locale') as 'en' | 'hi') || 'en';
    setLocale(savedLocale);
    setLowData(localStorage.getItem('app_low_data') === 'true');

    const onLocaleChanged = () => {
      setLocale((localStorage.getItem('app_locale') as 'en' | 'hi') || 'en');
    };
    const onLowDataChanged = () => {
      setLowData(localStorage.getItem('app_low_data') === 'true');
    };

    window.addEventListener('locale_changed', onLocaleChanged);
    window.addEventListener('low_data_changed', onLowDataChanged);

    fetchData();

    return () => {
      window.removeEventListener('locale_changed', onLocaleChanged);
      window.removeEventListener('low_data_changed', onLowDataChanged);
    };
  }, []);

  const fetchData = async (search = '') => {
    setLoading(true);
    try {
      const [roadsRes, incRes] = await Promise.all([
        fetch(`/api/v1/roads${search ? `?search=${encodeURIComponent(search)}` : ''}`),
        fetch(`/api/v1/incidents${selectedFilter !== 'all' ? `?category=${selectedFilter}` : ''}`),
      ]);

      if (roadsRes.ok) {
        const data = await roadsRes.json();
        setRoads(data.roads || []);
      }
      if (incRes.ok) {
        const data = await incRes.json();
        setIncidents(data.incidents || []);
      }
    } catch (err) {
      console.error('Failed to load explore data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(searchQuery);
  };

  const t = locale === 'en' ? enMessages : hiMessages;

  return (
    <div className="space-y-6">
      {/* Coverage Boundary Notification */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
        <Layers className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block">{t.explore.coverageNotice}</span>
          <p className="text-amber-800 mt-0.5">
            Independent basemap, canonical PostGIS road network, and official procurement records are separate layers. Unindexed roads use coordinate fallbacks.
          </p>
        </div>
      </div>

      {/* Search Header */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.explore.searchPlaceholder}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors"
        >
          {locale === 'en' ? 'Search' : 'खोजें'}
        </button>
      </form>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'all', label: t.explore.all },
          { id: 'pothole', label: t.explore.pothole },
          { id: 'dug_open', label: t.explore.dug_open },
          { id: 'damaged_surface', label: t.explore.damaged_surface },
          { id: 'flooded', label: t.explore.flooded },
        ].map((pill) => (
          <button
            key={pill.id}
            onClick={() => {
              setSelectedFilter(pill.id);
            }}
            className={`px-3 py-1.5 rounded-full border transition-colors ${
              selectedFilter === pill.id
                ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Main Content Grid: Indexed Roads & Active Incidents */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-600" />
          <span>{locale === 'en' ? 'Loading civic road data...' : 'सड़क डेटा लोड हो रहा है...'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Indexed Canonical Roads */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center justify-between">
              <span>{locale === 'en' ? 'Indexed Canonical Roads' : 'पंजीकृत सड़कें'}</span>
              <span className="text-xs font-normal text-slate-500">({roads.length})</span>
            </h2>

            {roads.length === 0 ? (
              <p className="text-sm text-slate-500 italic p-4 bg-white rounded-lg border border-slate-200">
                {t.explore.noResults}
              </p>
            ) : (
              roads.map((road) => (
                <Link
                  key={road.id}
                  href={`/roads/${road.id}`}
                  className="block p-4 bg-white rounded-lg border border-slate-200 hover:border-brand-500 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900 hover:text-brand-600 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-brand-600 flex-shrink-0" />
                        <span>{road.name}</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {road.ref ? `${road.ref} • ` : ''}{road.district}, {road.state}
                      </p>
                    </div>
                    {parseInt(road.active_incidents_count) > 0 ? (
                      <span className="text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {road.active_incidents_count}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                        {locale === 'en' ? 'No damage reported' : 'कोई समस्या नहीं'}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>{t.road.authority}: {road.authority_name || 'Public Authority'}</span>
                    <span>{Math.round(parseFloat(road.total_length_m))}m</span>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Right Column: Active Community Observations */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center justify-between">
              <span>{locale === 'en' ? 'Recent Community Observations' : 'हाल की नागरिक रिपोर्ट'}</span>
              <span className="text-xs font-normal text-slate-500">({incidents.length})</span>
            </h2>

            {incidents.length === 0 ? (
              <p className="text-sm text-slate-500 italic p-4 bg-white rounded-lg border border-slate-200">
                {t.explore.noResults}
              </p>
            ) : (
              incidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="block p-4 bg-white rounded-lg border border-slate-200 hover:border-brand-500 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800 capitalize">
                        {inc.category.replace('_', ' ')}
                      </span>
                      <h3 className="font-semibold text-slate-900 mt-1 text-sm">
                        {inc.road_name || 'Unmatched Road Location'}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(inc.last_observed_at).toLocaleDateString(locale === 'en' ? 'en-IN' : 'hi-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        inc.verification_state === 'corroborated'
                          ? 'bg-blue-100 text-blue-800'
                          : inc.verification_state === 'resolved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {inc.verification_state === 'corroborated' ? 'Corroborated' : inc.verification_state === 'resolved' ? 'Resolved' : 'Unverified'}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
