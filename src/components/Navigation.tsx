'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Radio, Layers, Database, ShieldAlert, Globe, WifiOff, PlusCircle } from 'lucide-react';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

export function Navigation() {
  const [locale, setLocale] = useState<'en' | 'hi'>('en');
  const [lowData, setLowData] = useState<boolean>(false);

  useEffect(() => {
    const savedLocale = localStorage.getItem('app_locale') as 'en' | 'hi';
    if (savedLocale) setLocale(savedLocale);

    const savedLowData = localStorage.getItem('app_low_data') === 'true';
    setLowData(savedLowData);
  }, []);

  const toggleLocale = () => {
    const nextLocale = locale === 'en' ? 'hi' : 'en';
    setLocale(nextLocale);
    localStorage.setItem('app_locale', nextLocale);
    window.dispatchEvent(new Event('locale_changed'));
  };

  const toggleLowData = () => {
    const nextLowData = !lowData;
    setLowData(nextLowData);
    localStorage.setItem('app_locale', String(nextLowData));
    window.dispatchEvent(new Event('low_data_changed'));
  };

  const t = locale === 'en' ? enMessages : hiMessages;

  return (
    <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg text-slate-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Branding & Mission Badge */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400 transition-colors shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-base tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                  theroadproblem<span className="text-cyan-400">.quest</span>
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold tracking-wider">
                  Observatory
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                National Public Works Ledger & Road History
              </p>
            </div>
          </Link>
        </div>

        {/* Center: Live Telemetry Ticker */}
        <div className="hidden lg:flex items-center gap-4 text-xs font-mono py-1 px-3 rounded-full bg-slate-900/80 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-slate-400">DATA STREAM:</span>
            <span className="text-emerald-400 font-bold">ONLINE</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">TRACKED SPEND:</span>
            <span className="text-cyan-300 font-bold">₹121.95 Cr</span>
          </div>
          <span className="text-slate-700">•</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-slate-400">SOURCES:</span>
            <span className="text-purple-300 font-bold">Portals + News + Social</span>
          </div>
        </div>

        {/* Navigation Actions & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          <Link
            href="/attributions"
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors font-mono"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Provenance</span>
          </Link>

          <Link
            href="/report"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.3)] hover:shadow-[0_0_16px_rgba(6,182,212,0.5)]"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Evidence</span>
          </Link>

          {/* Low-data toggle */}
          <button
            onClick={toggleLowData}
            title={t.nav.lowData}
            aria-label={t.nav.lowData}
            className={`flex items-center gap-1 px-2 py-1.5 rounded border text-[11px] font-mono transition-colors ${
              lowData
                ? 'bg-amber-950/80 border-amber-500/60 text-amber-300 font-bold'
                : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <WifiOff className="w-3 h-3" />
            <span className="hidden sm:inline">{lowData ? 'Low-Data' : 'Normal'}</span>
          </button>

          {/* Locale switcher */}
          <button
            onClick={toggleLocale}
            aria-label="Toggle language between English and Hindi"
            className="flex items-center gap-1 px-2 py-1.5 rounded border border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white transition-colors text-[11px] font-mono"
          >
            <Globe className="w-3 h-3 text-slate-400" />
            <span>{locale === 'en' ? 'हिन्दी' : 'English'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
