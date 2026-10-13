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
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full overflow-hidden">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="h-full w-full overflow-hidden bg-slate-950 flex flex-col text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950">
        <Navigation />
        <main className="flex-1 w-full relative overflow-hidden flex flex-col">{children}</main>
      </body>
    </html>
  );
}
