# External Dependencies & Mitigation Matrix

Date: 13 October 2026  
Status: Active  

This document tracks all external cloud and third-party dependencies, identifying their local development alternatives, affected gates, required owner actions, and the large volume of independent work that proceeds autonomously.

---

| Dependency | Purpose | Affected Gates | Local / Self-Contained Alternative | Independent Tasks Continuing | Precise Owner Action Required |
|---|---|---|---|---|---|
| **PostgreSQL 14+ with PostGIS** | Primary relational and spatial store; RLS; GiST indexes; transaction engine | R01, R04, R05, R07, R08, R11, R17 | Dedicated PostgreSQL + PostGIS running locally via WSL2 (`localhost:5432`) with full psql/pg_dump capabilities | Schema design, migrations, transactional domain mutations, spatial snapping, role checks, event projections | None for local testing; provide remote connection string (`DATABASE_URL`) for hosted staging/production |
| **Supabase Auth / Platform** | User JWT authentication, role management, session revocation | R02, R11, R12 | Local session/JWT authentication layer adhering to Supabase-compatible JWT claims (`sub`, `role`, `app_metadata`) and Supabase client headers | Full citizen reporting flow, moderation role authorization, negative escalation tests | Supply `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when publishing to Supabase hosted cloud |
| **Cloudflare R2 (Object Storage)** | Storing raw quarantined photos, processed derivatives, and basemap PMTiles | R12, R13, R17 | Local disk-backed object storage and buffer processing pipeline with metadata stripping and quarantine separation | Client upload UX, image re-encoding, EXIF sanitation, thumbnail generation, moderation approval queue | Provide `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` for cloud staging |
| **Protomaps / OSM Vector Basemap CDN** | Rendering pan-India vector tiles with MapLibre | R01, R03 | Local PMTiles reader, standalone vector styles, and GeoJSON overlay for urban (Bengaluru) and rural (Karnataka) samples | Map navigation, road selection, pin dropping, responsive UI, low-data map-free list mode | Provide custom PMTiles CDN endpoint or R2 public bucket URL if hosted custom tile server is needed |
| **Official Open Data Portals (data.gov.in / CPPP / GeoSadak)** | Live API feeds for road tenders, work status, and contractor awards | R06, R09, R10 | High-fidelity archived real source responses from data.gov.in and CPPP, verified against live gazettes and contracts | Ingestion parser, checksum versioning, work package normalization, contractor linkage, coexistence timeline | Verify live API key if querying restricted real-time data.gov.in endpoints |
| **Hosting Platform (Netlify / Vercel / Node)** | Public web hosting and serverless SSR/API runtime | R19, R20 | Next.js production server (`npm run build && npm start`) on local port 3000 | All UI development, API endpoints, PWA caching, offline synchronization, mobile testing | Authorize publication and connect custom domain `theroadproblem.quest` |

---

## Autonomous Execution Rules for Dependencies
1. **Never Block Independent Code on Cloud Credentials**: If hosted cloud secrets are absent, full end-to-end functionality is implemented, verified, and certified against real local runtimes (Postgres/PostGIS in WSL2, local object store, local auth).
2. **Never Simulate Services as Success**: Test suites run against the real active Postgres instance. If a remote cloud check cannot run, it is explicitly flagged `BLOCKED (Remote Cloud Action Required)` in the ledger, never falsely marked `PASS`.
3. **Graceful Degradation**: The application runtime automatically detects whether cloud storage/auth or local services are configured and operates cleanly in both modes.
