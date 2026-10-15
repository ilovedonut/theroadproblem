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
  themeColor: '#faf9f7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full overflow-hidden" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('trp-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=d?'#211f1b':'#faf9f7';}catch(e){var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}})();` }} />
      </head>
      <body className="h-full w-full overflow-hidden bg-canvas flex flex-col text-ink antialiased selection:bg-emerald-200 selection:text-[#02492a]">
        <Navigation />
        <main className="flex-1 w-full relative overflow-hidden flex flex-col">{children}</main>
      </body>
    </html>
  );
}
