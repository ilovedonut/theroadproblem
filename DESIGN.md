# Design System: High-Contrast Geospatial Dashboard

## Aesthetic Concept & Persona
- **Concept**: High-Contrast Geospatial Intelligence Deck.
- **Inspiration**: God's Eye View architectural philosophy translated to a high-density, mission-critical public infrastructure observatory.
- **Personality**: Objective, authoritative, forensic, transparent, and telemetry-rich. Avoids cheerful municipal marketing tropes; treats public infrastructure with data-journalism rigor.

## Color Tokens & Semantics
- **Backgrounds**:
  - Surface Root: `bg-slate-950` (#020617)
  - Card / Panel Elevated: `bg-slate-900/95` (#0f172a) with `backdrop-blur-md`
  - Floating Controls: `bg-slate-900/80` with `border border-slate-800/80`
  - Subtle Highlight: `bg-slate-800/50`
- **Text & Telemetry**:
  - Primary Content: `text-slate-100` (#f8fafc)
  - Secondary Content: `text-slate-400` (#94a3b8)
  - Monospace Metadata: `text-slate-500` (#64748b)
- **Domain Accents**:
  - **Official Works & Tenders**: `text-cyan-400`, `bg-cyan-950/60`, `border-cyan-500/40`
  - **Ground Excavations & Damage**: `text-amber-400`, `bg-amber-950/60`, `border-amber-500/40`
  - **Restored & Verified**: `text-emerald-400`, `bg-emerald-950/60`, `border-emerald-500/40`
  - **Multi-Source Intelligence (News & Social)**: `text-purple-400`, `bg-purple-950/60`, `border-purple-500/40`
  - **Disputed / Anomaly**: `text-rose-400`, `bg-rose-950/60`, `border-rose-500/40`

## Typography
- **UI & Headlines**: System Sans / Inter, weights 500, 600, 700.
- **Data & Telemetry**: Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`) for:
  - Chainage markers (`14.1 km – 18.3 km`)
  - Tender IDs (`NHAI/PIU-BLR/2026/PKG-4`)
  - Public Spend (`₹142.50 Cr`)
  - Timestamps and coordinates (`12.9716° N, 77.5946° E`)

## Layout & Spatial Composition
1. **Command Bar (Header)**:
   - Compact height, dark translucent glassmorphism (`h-14 bg-slate-950/90 border-b border-slate-800/80`).
   - Telemetry status counters showing live database counts (Indexed Corridors, Active Work Packages, Tracked Spend, Multi-Source Signals).
   - Omnisearch bar for road names, highway numbers, contractors, and city districts.
2. **Geospatial Canvas (Center)**:
   - MapLibre GL vector map configured with dark Carto/OSM base styling.
   - Interactive road paths with state color-coding (cyan for official projects, amber for excavated, emerald for good).
   - Multi-layer toggle chip bar floating over the map.
3. **Inspection Drawer / Dossier Panel**:
   - Slides smoothly from side or docks cleanly.
   - Dual-state visual comparison header (Official Work Status vs. Ground Reality).
   - Contractor & Package dossier (legal entity, contract value, warranty countdown).
   - Multi-source audit trail feed: chronological cards with source badges (`[CPPP Portal]`, `[The Hindu]`, `[Reddit / r/bangalore]`, `[Field Observation]`).
   - "Contribute Ground Evidence" action.
