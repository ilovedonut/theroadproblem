'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { 
  Building2, AlertTriangle, ShieldCheck, Banknote, Calendar, 
  MapPin, ExternalLink, ArrowLeft, PlusCircle, CheckCircle2, 
  FileText, Database 
} from 'lucide-react';

export default function RoadDetailPage() {
  const params = useParams();
  const roadId = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'works' | 'observations' | 'timeline'>('works');

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
      <main className="max-w-5xl mx-auto px-4 py-8 text-slate-100 font-mono">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-900 border border-slate-800 rounded w-1/2"></div>
          <div className="h-4 bg-slate-900 border border-slate-800 rounded w-1/3"></div>
          <div className="h-48 bg-slate-900 border border-slate-800 rounded"></div>
        </div>
      </main>
    );
  }

  if (error || !data || !data.road) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="p-5 bg-rose-950/40 border border-rose-900 rounded-lg text-rose-300 font-mono text-sm">
          <h2 className="font-bold text-base">Corridor Record Not Found</h2>
          <p className="mt-1">{error || 'The requested road corridor could not be found in the database.'}</p>
          <Link href="/" className="inline-flex items-center gap-1.5 mt-4 text-cyan-400 hover:underline">
            <ArrowLeft className="w-4 h-4" />
            <span>Return to National Map Deck</span>
          </Link>
        </div>
      </main>
    );
  }

  const { road, segments, active_incidents, official_works, timeline, coexistence_alert } = data;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 w-full text-slate-100">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 text-xs font-mono text-slate-400 flex items-center gap-2">
        <Link href="/" className="hover:text-cyan-400 flex items-center gap-1 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Observatory Deck</span>
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-white font-semibold">{road.name || road.ref}</span>
      </nav>

      {/* Hero Corridor Dossier Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 mb-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5 font-mono">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                {road.road_class || 'Corridor'}
              </span>
              {road.ref && (
                <span className="text-xs font-bold text-slate-400">
                  REF: {road.ref}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {road.name || 'Unnamed Corridor'}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Authority: <strong className="text-slate-200">{road.authority_name || 'Public Authority'}</strong> • {road.district}, {road.state}
            </p>
          </div>

          <Link
            href={`/report?roadId=${road.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono rounded-lg transition-colors shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Contribute Evidence</span>
          </Link>
        </div>

        {/* Telemetry Numbers */}
        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-slate-800/80 text-center font-mono">
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-lg font-bold text-white">{segments?.length || 1}</div>
            <div className="text-[10px] text-slate-400 uppercase">Indexed Segments</div>
          </div>
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-lg font-bold text-cyan-400">{official_works?.length || 0}</div>
            <div className="text-[10px] text-slate-400 uppercase">Official Tenders</div>
          </div>
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-lg font-bold text-amber-400">{active_incidents?.length || 0}</div>
            <div className="text-[10px] text-slate-400 uppercase">Ground Observations</div>
          </div>
        </div>
      </div>

      {/* DUAL-STATE COEXISTENCE NOTICE */}
      {coexistence_alert?.alert && (
        <div className="mb-6 p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs">
            <h2 className="font-bold text-sm text-white uppercase tracking-wider font-mono">Dual State Machine Alert</h2>
            <p className="mt-1 leading-relaxed text-amber-200/90 font-sans">
              {coexistence_alert.message} Official records certify project completion, but verified ground observations indicate subsequent carriageway excavation or deterioration. In our public ledger, ground truth does not overwrite official contracts, and official announcements do not erase ground reality.
            </p>
          </div>
        </div>
      )}

      {/* Tab Controls */}
      <div className="flex border-b border-slate-800 mb-6 space-x-6 text-xs font-mono">
        <button
          onClick={() => setActiveTab('works')}
          className={`pb-3 border-b-2 font-bold transition-colors ${
            activeTab === 'works'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Official Public Works ({official_works?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('observations')}
          className={`pb-3 border-b-2 font-bold transition-colors ${
            activeTab === 'observations'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Ground Observations ({active_incidents?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`pb-3 border-b-2 font-bold transition-colors ${
            activeTab === 'timeline'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Audit Ledger History ({timeline?.length || 0})
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'works' && (
        <section aria-label="Official Public Works" className="space-y-4">
          {official_works && official_works.length > 0 ? (
            official_works.map((w: any) => (
              <div
                key={w.work_id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4 font-mono text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2 py-0.5 font-bold rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 uppercase">
                    {w.work_type.replace('_', ' ')} • {w.official_status.replace('_', ' ')}
                  </span>
                  {w.contract_value_inr && (
                    <span className="font-bold text-cyan-300 text-sm">
                      ₹{(Number(w.contract_value_inr) / 10000000).toFixed(2)} Crores
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-base font-bold text-white font-sans">
                    {w.package_name}
                  </h2>
                  <p className="text-slate-400 mt-1">
                    Tender ID: <span className="text-slate-200">{w.tender_id || 'N/A'}</span> • Agreement: <span className="text-slate-200">{w.contract_id || 'N/A'}</span>
                  </p>
                </div>

                {/* Awarded Contractor Card */}
                <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-cyan-400 uppercase font-bold">
                    <span>Awarded Contractor ({w.contractor_role})</span>
                    <span className="text-emerald-400">{(w.match_confidence * 100).toFixed(0)}% Match Confidence</span>
                  </div>
                  <div className="text-sm font-bold text-white font-sans">
                    {w.contractor_name}
                  </div>
                  <div className="text-slate-400 flex flex-wrap gap-x-4 pt-1">
                    {w.cin && <span>CIN: <strong className="text-slate-200">{w.cin}</strong></span>}
                    {w.gstin && <span>GSTIN: <strong className="text-slate-200">{w.gstin}</strong></span>}
                  </div>
                </div>

                {/* Provenance Footer */}
                <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                  <span>Publisher: {w.publisher || 'Government Authority'} (License: {w.license || 'GODL India'})</span>
                  {w.source_uri && (
                    <a
                      href={w.source_uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                    >
                      <span>Official Source Record</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 font-mono text-xs">
              No official procurement work records matched to this corridor.
            </div>
          )}
        </section>
      )}

      {activeTab === 'observations' && (
        <section aria-label="Ground Observations" className="space-y-3 font-mono text-xs">
          {active_incidents && active_incidents.length > 0 ? (
            active_incidents.map((inc: any) => (
              <div
                key={inc.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex items-start justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 uppercase font-bold text-[10px]">
                      {inc.category.replace('_', ' ')}
                    </span>
                    <span className="text-slate-400">
                      {inc.verification_state === 'corroborated' ? '✓ Corroborated' : '• Reported'}
                    </span>
                  </div>
                  <p className="text-slate-400 mt-2 text-[11px]">
                    First seen: {new Date(inc.first_observed_at).toLocaleDateString()} • Reports: {inc.reports_count} • Corroborations: {inc.corroborations_count}
                  </p>
                </div>
                <Link 
                  href={`/incidents/${inc.id}`}
                  className="text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  View Details →
                </Link>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500">
              No active ground damage or excavation recorded on this corridor.
            </div>
          )}
        </section>
      )}

      {activeTab === 'timeline' && (
        <section aria-label="Civic Audit Timeline" className="space-y-3 font-mono text-xs">
          {timeline && timeline.length > 0 ? (
            timeline.map((ev: any) => (
              <div
                key={ev.id}
                className="p-3 bg-slate-900 border border-slate-800 rounded-lg"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span>{new Date(ev.effective_at).toLocaleString()}</span>
                  <span className="font-bold text-cyan-400 uppercase">{ev.event_type}</span>
                </div>
                <p className="text-slate-200 mt-1 font-sans text-xs">{ev.reason}</p>
              </div>
            ))
          ) : (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500">
              No historical event log recorded yet.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
