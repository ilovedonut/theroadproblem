# Product: theroadproblem.quest

## Purpose
An open, nationwide public infrastructure observability and civic awareness platform for India's road networks. It brings together fragmented government tenders, official contractor allocations, public spend data, news reports, social media signals, and citizen ground observations into a transparent, auditable geospatial ledger.

## Primary User & Jobs
- **Audience**: Citizens, daily commuters, civic activists, journalists, urban researchers, and infrastructure watchdogs.
- **Core Jobs**:
  1. **Investigate Road Accountability**: Search or tap any road segment to instantly know who owns it (NHAI, State PWD, BBMP, PMGSY), which contractor won the work package, how much public money was spent, and when warranty/defect-liability expires.
  2. **Audit Ground Reality vs. Official Claims**: Compare official project milestones (e.g. "Completed 2 Sep 2026") against recent on-the-ground observations (e.g. "Carriageway excavated again 9 Oct 2026").
  3. **Multi-Source Intelligence Synthesis**: Access a comprehensive timeline aggregated from government procurement portals (CPPP, OMMAS, OGD), regional news coverage, public social signals (Twitter/X, Reddit civic forums), and direct verified ground reports.
  4. **Monitor & Corroborate**: Track ongoing road projects and attach verified photo evidence or status updates to existing records.

## Core Mental Model & Differentiator
- **Dual State Machine**: The platform never collapses official claims into a single status field.
  - **Official State**: `tendered` → `awarded` → `under_construction` → `officially_completed` → `defect_liability_active`
  - **Observed Ground State**: `normal` → `excavated_open` → `damaged` → `partially_restored` → `repaired` → `deteriorated`
- **Provable Source Provenance**: Every claim, date, and contractor relationship is stamped with its verifiable source:
  - `[Government Portal / Tender Record]` (Tier A/B)
  - `[News & Investigative Reporting]` (Tier B/C)
  - `[Public Social Intelligence: Twitter/Reddit]` (Tier D)
  - `[Community Field Corroboration]` (Tier D/E)

## Scope & Boundaries
- Not a generic municipal complaint-filing portal (like BBMP Sahaaya or Swachhata).
- An infrastructure intelligence deck and public ledger designed for awareness, accountability, and investigative verification.

## Platform & Stack
- Platform: Web (mobile-first responsive, 360px to 4K desktop).
- UI Framework: Next.js 15 (App Router), React 19, Tailwind CSS, Lucide icons.
- Geospatial: MapLibre GL JS vector map with multi-layer telemetry.
- Database: PostgreSQL + PostGIS with spatial indexing and append-only event sourcing.
