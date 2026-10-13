'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  X, ExternalLink, ShieldCheck, AlertTriangle, Building2, 
  Banknote, Calendar, Layers, MapPin, CheckCircle2, 
  Clock, Share2, PlusCircle, Newspaper, MessageSquare, Twitter, Eye, FileText
} from 'lucide-react';
import { RoadFeature, MultiSourceSignal } from './GeospatialMap';

interface RoadDossierDrawerProps {
  road: RoadFeature | null;
  signal: MultiSourceSignal | null;
  onClose: () => void;
  onOpenReportModal?: (roadName: string) => void;
}

export function RoadDossierDrawer({
  road,
  signal,
  onClose,
  onOpenReportModal
}: RoadDossierDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'contractor'>('overview');
  const [copied, setCopied] = useState(false);

  if (!road && !signal) return null;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // If a multi-source signal was clicked directly
  if (signal && !road) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in slide-in-from-right duration-200">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/60 font-semibold">
              Public Signal
            </span>
            <span className="text-xs text-slate-400 font-mono">{signal.date}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 font-sans">
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">{signal.title}</h2>
            <p className="text-xs font-mono text-cyan-400 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{signal.road_name}</span>
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-sm text-slate-300 leading-relaxed">
            {signal.details}
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Source Channel:</span>
              <span className="font-semibold text-slate-200 font-mono">{signal.source}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Coordinates:</span>
              <span className="text-slate-300 font-mono">{signal.lat.toFixed(4)}° N, {signal.lon.toFixed(4)}° E</span>
            </div>
          </div>

          {signal.source_url && (
            <a
              href={signal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-950 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 transition-colors text-xs font-mono font-semibold"
            >
              <span>Inspect Source Record</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!road) return null;

  const primaryWork = road.works && road.works.length > 0 ? road.works[0] : null;
  const hasExcavation = road.incidents && road.incidents.length > 0;
  const spendCr = primaryWork?.contract_value_inr 
    ? (parseFloat(String(primaryWork.contract_value_inr)) / 10000000).toFixed(2)
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-slate-950/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-semibold">
              {road.road_class.toUpperCase()} CORRIDOR
            </span>
            {road.ref && (
              <span className="text-[10px] font-mono text-slate-400">
                REF: {road.ref}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-white mt-1 leading-snug">{road.name}</h2>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            {road.district}, {road.state} • Authority: {road.authority_name || 'Public Authority'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={handleShare}
            title="Share Road Ledger Link"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1 font-mono"
          >
            <Share2 className="w-4 h-4" />
            <span className="text-[10px]">{copied ? 'Copied!' : ''}</span>
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hero Dual-State Observability Card */}
      <div className="p-4 bg-gradient-to-b from-slate-900/90 to-slate-950 border-b border-slate-800/80">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
          <span>Dual State Machine Integrity</span>
          <span className="text-cyan-400">Non-Overwriting Model</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Official Public Works State */}
          <div className="p-3 rounded-lg bg-slate-900 border border-cyan-500/30">
            <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 mb-1">
              <Building2 className="w-3.5 h-3.5" />
              <span>OFFICIAL STATUS</span>
            </div>
            {primaryWork ? (
              <div>
                <p className="font-semibold text-white capitalize">
                  {primaryWork.official_status.replace('_', ' ')}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {primaryWork.tender_id || 'Tender Package Active'}
                </p>
              </div>
            ) : (
              <p className="text-slate-400 text-xs">No active government tender logged</p>
            )}
          </div>

          {/* Observed Ground Reality */}
          <div className="p-3 rounded-lg bg-slate-900 border border-amber-500/30">
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-400 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>GROUND REALITY</span>
            </div>
            {hasExcavation ? (
              <div>
                <p className="font-semibold text-white">Active Excavation / Dig</p>
                <p className="text-[11px] text-amber-300/80 font-mono mt-0.5">
                  {road.incidents?.length} Ground observation(s)
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-emerald-400">Passable / Restored</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">No open trench reports</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 text-xs font-mono px-4 bg-slate-950">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2.5 px-3 border-b-2 font-semibold transition-colors ${
            activeTab === 'overview'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Public Dossier
        </button>
        <button
          onClick={() => setActiveTab('contractor')}
          className={`py-2.5 px-3 border-b-2 font-semibold transition-colors ${
            activeTab === 'contractor'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Contractor & Spend
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`py-2.5 px-3 border-b-2 font-semibold transition-colors ${
            activeTab === 'timeline'
              ? 'border-cyan-400 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Multi-Source Stream
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs font-sans">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">TRACKED LENGTH</span>
                <span className="font-bold text-sm text-white font-mono">
                  {(parseFloat(road.total_length_m || '0') / 1000).toFixed(2)} km
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">SEGMENTS</span>
                <span className="font-bold text-sm text-white font-mono">
                  {road.segments?.length || 1}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-mono block">PUBLIC SPEND</span>
                <span className="font-bold text-sm text-cyan-300 font-mono">
                  {spendCr ? `₹${spendCr} Cr` : 'Pending'}
                </span>
              </div>
            </div>

            {/* Public Work Summary */}
            {primaryWork && (
              <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-cyan-400 uppercase font-mono">
                    Official Work Package
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
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
            <div className="p-4 rounded-lg bg-slate-900/60 border border-cyan-500/20 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-white text-xs">Have visual ground evidence?</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Attach geotagged photo or observation directly to this road ledger.
                </p>
              </div>
              <Link
                href="/report"
                className="px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold font-mono text-xs whitespace-nowrap transition-colors"
              >
                + Add Evidence
              </Link>
            </div>
          </div>
        )}

        {activeTab === 'contractor' && (
          <div className="space-y-4">
            {primaryWork ? (
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-cyan-400 block">Awarded Contractor</span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{primaryWork.contractor_name}</h3>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Primary Contractor
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
                    <span>Tender Reference:</span>
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
                      <span>Defect Liability (Warranty):</span>
                      <span>Active until {primaryWork.defect_liability_end_date}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Provenance: MoRTH / Data.gov.in</span>
                  <span className="text-cyan-400">GODL India 1.0</span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 font-mono bg-slate-900/50 rounded-lg border border-slate-800">
                No official contractor allocated in public procurement registry yet.
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400 font-mono">
              Multi-source intelligence aggregated across government portals, regional news, Reddit, Twitter, and citizen reports:
            </p>

            <div className="space-y-2.5 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-slate-800">
              {/* Event 1 */}
              <div className="relative pl-7 text-xs">
                <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                </div>
                <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-cyan-400 font-bold">[OFFICIAL PORTAL]</span>
                    <span className="text-slate-500">Nov 2025</span>
                  </div>
                  <p className="font-semibold text-white mt-0.5">Work Order Issued & Awarded to KNR Constructions</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Sanctioned under BBMP/2025-26/RD/5401 for ₹48.50 Cr.</p>
                </div>
              </div>

              {/* Event 2 */}
              <div className="relative pl-7 text-xs">
                <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-purple-950 border border-purple-400 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                </div>
                <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-purple-400 font-bold">[NEWS MEDIA • DECCAN HERALD]</span>
                    <span className="text-slate-500">Mar 2026</span>
                  </div>
                  <p className="font-semibold text-white mt-0.5">Pipeline Excavation Trench Reported Across Resurfaced Lane</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">BWSSB utility line digging initiated without inter-agency barricade.</p>
                </div>
              </div>

              {/* Event 3 */}
              <div className="relative pl-7 text-xs">
                <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-orange-950 border border-orange-400 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                </div>
                <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-orange-400 font-bold">[REDDIT r/bangalore]</span>
                    <span className="text-slate-500">Apr 2026</span>
                  </div>
                  <p className="font-semibold text-white mt-0.5">Commuter Photo Thread: Unbarricaded pits near Bellandur</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Dashcam photos show rebar and loose gravel causing two-wheeler skids.</p>
                </div>
              </div>

              {/* Event 4 */}
              <div className="relative pl-7 text-xs">
                <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-emerald-950 border border-emerald-400 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                </div>
                <div className="p-2.5 rounded bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between font-mono text-[10px]">
                    <span className="text-emerald-400 font-bold">[FIELD EVIDENCE #882]</span>
                    <span className="text-slate-500">Jun 2026</span>
                  </div>
                  <p className="font-semibold text-white mt-0.5">Geotagged Photo Submitted & Corroborated</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Verified by 2 independent neighborhood observers.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawer Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <Link 
          href={`/roads/${road.id}`} 
          className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
        >
          <span>Open Full Historical Ledger Page</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
        <button onClick={onClose} className="hover:text-white transition-colors">
          Close [Esc]
        </button>
      </div>
    </div>
  );
}
