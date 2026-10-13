'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, AlertCircle, FileText, Shield, Globe, WifiOff } from 'lucide-react';
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
    localStorage.setItem('app_low_data', String(nextLowData));
    window.dispatchEvent(new Event('low_data_changed'));
  };

  const t = locale === 'en' ? enMessages : hiMessages;

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 text-brand-600 font-bold text-lg tracking-tight">
          <MapPin className="w-5 h-5 text-brand-600" />
          <span>{t.brand}</span>
        </Link>

        {/* Primary Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-4 text-sm font-medium text-slate-700">
          <Link
            href="/"
            className="px-2.5 py-1.5 rounded-md hover:bg-slate-100 hover:text-brand-600 transition-colors"
          >
            {t.nav.explore}
          </Link>
          <Link
            href="/report"
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors font-semibold"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{t.nav.report}</span>
          </Link>
          <Link
            href="/drafts"
            className="px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            {t.nav.drafts}
          </Link>
          <Link
            href="/mod"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600 text-xs"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{t.nav.moderate}</span>
          </Link>
          <Link
            href="/attributions"
            className="hidden md:inline-flex px-2.5 py-1.5 rounded-md hover:bg-slate-100 text-slate-600 text-xs"
          >
            {t.nav.attributions}
          </Link>
        </nav>

        {/* Accessibility & Mode Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLowData}
            title={t.nav.lowData}
            aria-label={t.nav.lowData}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors ${
              lowData ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{lowData ? 'Low-Data ON' : 'Low-Data'}</span>
          </button>

          <button
            onClick={toggleLocale}
            aria-label="Toggle language between English and Hindi"
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors font-medium"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500" />
            <span>{locale === 'en' ? 'हिन्दी' : 'English'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
