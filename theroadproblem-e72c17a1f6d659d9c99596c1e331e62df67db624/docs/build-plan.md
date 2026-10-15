# Implementation Build Plan: theroadproblem.quest

Date: 13 October 2026  
Execution Model: Autonomous One-Shot Implementation  

---

## 1. Architecture & Runtime Decisions

### Core Technology Stack
- **Framework & Runtime**: Next.js (App Router, Server Actions, Route Handlers, TypeScript).
- **Styling & UI**: Tailwind CSS, Mobile-first responsive design (tested down to 360px viewport).
- **Cartography & GIS**: MapLibre GL JS, PostGIS spatial queries (GiST indexing, `ST_DWithin`, `ST_Distance_Sphere`, `ST_ClosestPoint`).
- **Database**: PostgreSQL with PostGIS extension. Run locally on WSL2 PostgreSQL (`localhost:5432`) during development with automated migrations; ready for Supabase PostgreSQL in hosted staging.
- **Authentication**: JWT-based session architecture compatible with Supabase Auth claims (`sub`, `role`, `app_metadata`).
- **Object Storage & Media**: Dual-driver media pipeline supporting local filesystem quarantine/derivatives in development and Cloudflare R2 in cloud staging. Server-side Sharp-based image optimization, EXIF stripping, and quarantine review.
- **Localization**: Bilingual English and Hindi dictionary catalogs (`messages/en.json`, `messages/hi.json`).
- **Offline / PWA**: Web App Manifest, Service Worker caching app shell, and IndexedDB draft queue with foreground sync.

---

## 2. Requirement-to-Stage Mapping & Task Queue

| Stage | Focus Area | Addressed Gates | Key Deliverables |
|---|---|---|---|
| **Stage 00** | Feasibility, Source Verification & Spec | Planning / Baseline | `docs/00-feasibility.md`, `docs/source-registry.md`, verified sample boundaries |
| **Stage 01** | Foundation, Schema & Data Contract | R11, R12 | Next.js setup, PostgreSQL/PostGIS migrations, domain entities, RLS policies, atomic mutations, concurrency suite |
| **Stage 02** | Real Roads, Identity & Capacity | R01, R08 | Bounded urban (Bengaluru) and rural (Karnataka) OSM road imports, spatial indices, lineage tracking, national capacity measurement |
| **Stage 03** | Explore & Detail Interface | R01, R03 | Responsive map & list views, road selection, search by locality/ref, shareable stable URLs, loading/error fallbacks |
| **Stage 04** | Citizen Reporting & Private Evidence | R02, R12, R13 | Location picker, category selection, duplicate warning, signed photo upload, metadata stripping, quarantine pipeline |
| **Stage 05** | Trust, Repair History & Moderation | R04, R05, R07, R11 | Corroboration state machine, anti-inflation invariants, dispute/appeals, moderation queue, repair & recurrence tracking |
| **Stage 06** | Real Official Loop & Provenance | R06, R09, R10 | OGD/CPPP ingestion adapter, checksum versioning, contractor award linkage, coexistence timeline |
| **Stage 07** | Inclusion, Low-Data & Offline Recovery | R14, R15 | English/Hindi UI, 360px mobile optimization, low-data mode, PWA service worker, IndexedDB draft queue |
| **Stage 08** | National Coverage & Capacity | R01, R08 | Multi-state coverage checks, spatial performance validation, capacity calculation |
| **Stage 09** | Deployment, Security & Recovery | R16, R17, R18 | Backup & clean restore rehearsal, kill-switches, rate-limiting, security headers, operator contacts |
| **Stage 10** | Final Adversarial Audit & Release Gate | R19, R20 | Comprehensive test runs, adversarial review passes, defect fixes, `docs/final-review.md` |

---

## 3. Four-Pass Execution Protocol per Task
Every substantial implementation task strictly follows:
1. **Pass A — Complete Implementation**: Full UI, API routes, database schema, permissions, error recovery.
2. **Pass B — Targeted Verification**: Direct test runs against active Postgres/PostGIS service.
3. **Pass C — Adversarial Review**: Independent critic passes checking permissions, security, GIS precision, and user edge cases.
4. **Pass D — Repair & Reverify**: Explicit defect recording, targeted repairs, regression re-testing before advancing.
