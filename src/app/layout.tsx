import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navigation } from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'theroadproblem.quest — India Road History & Public Works Observability',
  description: 'Evidence-backed public road timeline tracking infrastructure damage, repairs, and public works contractors across India.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen bg-slate-950 flex flex-col text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950">
        <Navigation />
        <main className="flex-1 w-full flex flex-col">{children}</main>
        <footer className="bg-slate-950/95 border-t border-slate-900 py-3 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p>© 2026 theroadproblem.quest • Nationwide Public Infrastructure Observability Deck</p>
            <div className="flex gap-4">
              <a href="/attributions" className="underline hover:text-slate-300 transition-colors">Data Sources & Provenance</a>
              <a href="/attributions#terms" className="underline hover:text-slate-300 transition-colors">Terms & Privacy</a>
              <a href="/attributions#grievance" className="underline hover:text-slate-300 transition-colors">Grievance Redressal</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
