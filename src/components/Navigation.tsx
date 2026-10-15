'use client';

import React from 'react';
import Link from 'next/link';
import { Radio, Database, PlusCircle, UserRound } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';

export function Navigation() {
  return (
    <header className="min-h-14 bg-canvas border-b border-line px-2 sm:px-5 flex flex-wrap gap-x-1 sm:gap-x-4 gap-y-2 py-2 items-center justify-between text-ink z-50 select-none flex-shrink-0">
      {/* Branding */}
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-1.5 max-[380px]:gap-1 sm:gap-2 group">
          <div className="w-6 h-6 max-[380px]:w-5 max-[380px]:h-5 sm:w-7 sm:h-7 rounded-full bg-emerald-200 flex items-center justify-center text-[#02492a] transition-colors">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs max-[380px]:text-[11px] sm:text-sm tracking-tight text-ink group-hover:text-information transition-colors">
              theroadproblem<span className="text-positive">.quest</span>
            </span>
            <span className="hidden sm:inline text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-information border border-cyan-800/60 font-semibold tracking-wider">
              3D Globe
            </span>
          </div>
        </Link>
      </div>

      <div className="order-last w-full lg:order-none lg:flex-1 lg:max-w-xl"><GlobalSearch /></div>

      {/* Right Controls */}
      <div className="flex items-center gap-1 sm:gap-2.5 text-xs">
        <Link href="/account" aria-label="Account" title="Account" className="inline-flex min-w-11 items-center justify-center px-2 py-2 text-muted hover:text-information"><UserRound className="w-4 h-4 md:hidden" /><span className="hidden md:inline">Account</span></Link>
        <Link
          href="/attributions"
          className="inline-flex min-w-11 items-center justify-center gap-1 px-2 py-1.5 rounded-full text-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors font-mono text-[11px]"
          aria-label="Data sources and provenance"
          title="Data Sources & Licensing Provenance"
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Provenance</span>
        </Link>

        <ThemeToggle />
        {/* Action Button: Add Evidence */}
        <Link
          href="/report"
          aria-label="Add evidence"
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs transition-colors whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">+ Add Evidence</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </div>
    </header>
  );
}
