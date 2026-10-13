'use client';

import React from 'react';
import Link from 'next/link';
import { Radio, Database, PlusCircle } from 'lucide-react';

export function Navigation() {
  return (
    <header className="h-13 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 px-3 sm:px-5 flex items-center justify-between text-slate-200 z-50 select-none flex-shrink-0">
      {/* Branding */}
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:border-cyan-300 transition-colors shadow-[0_0_12px_rgba(6,182,212,0.2)]">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              theroadproblem<span className="text-cyan-400">.quest</span>
            </span>
            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold tracking-wider">
              3D Globe
            </span>
          </div>
        </Link>
      </div>

      {/* Center: Live Telemetry HUD Pill */}
      <div className="hidden md:flex items-center gap-3 text-xs font-mono py-1 px-3.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 shadow-inner">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="text-slate-400 text-[11px]">LEDGER:</span>
          <span className="text-emerald-400 font-bold">ONLINE</span>
        </div>
        <span className="text-slate-700">•</span>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-400">PUBLIC SPEND:</span>
          <span className="text-cyan-300 font-bold">₹121.95 Cr</span>
        </div>
        <span className="text-slate-700">•</span>
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-slate-400">PILOT CORRIDORS:</span>
          <span className="text-purple-300 font-bold">6 Indexed</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5 text-xs">
        <Link
          href="/attributions"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors font-mono text-[11px]"
          title="Data Sources & Licensing Provenance"
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Provenance</span>
        </Link>

        {/* Action Button: Add Evidence */}
        <Link
          href="/report"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-cyan-950 font-bold text-xs font-mono transition-all shadow-[0_0_12px_rgba(6,182,212,0.25)] hover:shadow-[0_0_16px_rgba(6,182,212,0.45)] whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>+ Add Evidence</span>
        </Link>
      </div>
    </header>
  );
}
