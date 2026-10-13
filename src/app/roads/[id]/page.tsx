'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function RoadDetailPage() {
  const params = useParams();
  const roadId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'observations' | 'works' | 'timeline'>('observations');

  useEffect(() => {
    if (!roadId) return;

    fetch(`/api/v1/roads/${roadId}`)
      .then(res => {
        if (!res.ok) throw new Error(`Road query returned HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [roadId]);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="h-32 bg-slate-100 dark:bg-slate-800 rounded"></div>
        </div>
      </main>
    );
  }

  if (error || !data || !data.road) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300">
          <h2 className="font-semibold text-lg">Road Not Found</h2>
          <p className="text-sm mt-1">{error || 'The requested road corridor could not be found.'}</p>
          <Link href="/" className="inline-block mt-4 text-sm font-medium underline">
            Return to Corridors
          </Link>
        </div>
      </main>
    );
  }

  const { road, segments, active_incidents, official_works, timeline, coexistence_alert } = data;

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        <Link href="/" className="hover:underline">Explore</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-slate-700 dark:text-slate-200">{road.name || road.ref}</span>
      </nav>

      {/* Road Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {road.classification}
              </span>
              {road.ref && (
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  {road.ref}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              {road.name || 'Unnamed Corridor'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Authority: <span className="font-medium text-slate-800 dark:text-slate-200">{road.authority_name || 'Public Authority'}</span>
            </p>
          </div>

          <Link
            href={`/report?roadId=${road.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            <span>+</span> Report Observation
          </Link>
        </div>

        {/* Corridor Metric Summary */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <div>
            <div className="text-xl font-bold text-slate-900 dark:text-white">{segments?.length || 0}</div>
            <div className="text-xs text-slate-500">Indexed Segments</div>
          </div>
          <div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{active_incidents?.length || 0}</div>
            <div className="text-xs text-slate-500">Active Observations</div>
          </div>
          <div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{official_works?.length || 0}</div>
            <div className="text-xs text-slate-500">Official Works</div>
          </div>
        </div>
      </div>

      {/* COEXISTENCE ALERT BANNER */}
      {coexistence_alert?.alert && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <div className="text-xl mt-0.5">⚠️</div>
          <div>
            <h2 className="font-bold text-sm uppercase tracking-wide">Status Coexistence Notice</h2>
            <p className="text-xs mt-1 leading-relaxed">
              {coexistence_alert.message} Official records certify completion, but verified ground observations indicate ongoing carriageway deterioration. Neither record overwrites the other.
            </p>
          </div>
        </div>
      )}

      {/* Tab Controls */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('observations')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'observations'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Ground Observations ({active_incidents?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('works')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'works'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Official Public Works ({official_works?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'timeline'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Civic Audit Timeline ({timeline?.length || 0})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'observations' && (
        <section aria-label="Ground Observations" className="space-y-3">
          {active_incidents && active_incidents.length > 0 ? (
            active_incidents.map((inc: any) => (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:border-amber-500 dark:hover:border-amber-500 transition shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 uppercase">
                        {inc.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-slate-500">
                        {inc.verification_state === 'corroborated' ? '✓ Corroborated' : '• Reported'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      First seen: {new Date(inc.first_observed_at).toLocaleDateString()} • Reports: {inc.reports_count} • Corroborations: {inc.corroborations_count}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-amber-600 hover:underline">
                    View & Corroborate →
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500">
              No active surface observations recorded on this road corridor.
            </div>
          )}
        </section>
      )}

      {activeTab === 'works' && (
        <section aria-label="Official Public Works" className="space-y-4">
          {official_works && official_works.length > 0 ? (
            official_works.map((w: any) => (
              <div
                key={w.work_id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 uppercase">
                    {w.work_type.replace('_', ' ')} • {w.official_status.replace('_', ' ')}
                  </span>
                  {w.contract_value_inr && (
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      ₹{(Number(w.contract_value_inr) / 10000000).toFixed(2)} Cr
                    </span>
                  )}
                </div>

                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {w.package_name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tender: {w.tender_id || 'N/A'} • Contract ID: {w.contract_id || 'N/A'}
                </p>

                {/* Contractor Details */}
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Awarded Contractor ({w.contractor_role})
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                    {w.contractor_name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4">
                    {w.cin && <span>CIN: {w.cin}</span>}
                    {w.gstin && <span>GSTIN: {w.gstin}</span>}
                    <span>Match Confidence: {(w.match_confidence * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 italic">
                    Disclaimer: Corporate entity linked via public procurement records. Does not imply sole fault for subsequent third-party utility road cuts.
                  </p>
                </div>

                {/* Provenance Footer */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                  <span>Publisher: {w.publisher || 'Government Authority'} (License: {w.license || 'GODL'})</span>
                  {w.source_uri && (
                    <a
                      href={w.source_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Official Source Record ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500">
              No official procurement work records matched to this corridor.
            </div>
          )}
        </section>
      )}

      {activeTab === 'timeline' && (
        <section aria-label="Civic Audit Timeline" className="space-y-3">
          {timeline && timeline.length > 0 ? (
            timeline.map((ev: any) => (
              <div
                key={ev.id}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
              >
                <div className="flex items-center justify-between font-mono text-slate-400">
                  <span>{new Date(ev.effective_at).toLocaleString()}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300 uppercase">{ev.event_type}</span>
                </div>
                <p className="text-slate-800 dark:text-slate-200 mt-1 font-sans">{ev.reason}</p>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500">
              No event log history available.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
