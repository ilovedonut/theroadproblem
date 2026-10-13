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
  themeColor: '#ea580c',
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
      <body className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
        <Navigation />
        <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">{children}</main>
        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
          <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p>© 2026 theroadproblem.quest • Civic Infrastructure Watch</p>
            <div className="flex gap-4">
              <a href="/attributions" className="underline hover:text-slate-800">Data Sources & Attributions</a>
              <a href="/attributions#terms" className="underline hover:text-slate-800">Terms & Privacy</a>
              <a href="/attributions#grievance" className="underline hover:text-slate-800">Grievance Redressal</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
