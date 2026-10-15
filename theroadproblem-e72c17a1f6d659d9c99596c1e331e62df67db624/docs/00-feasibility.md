# Stage 00 Feasibility & Source Verification Report

Date: 13 October 2026  
Status: VERIFIED & COMPLETE  
Reference: `ANTIGRAVITY_PLAN.md`, `ANTIGRAVITY_ONE_SHOT.md`, `deep-research-report.md`  

---

## 1. Environment & Runtime Inspection

| Component | Detected Version / Status | Assessment |
|---|---|---|
| Operating System | Windows 11 with WSL2 (Ubuntu 24.04/Resolute) | Verified. WSL2 provides native Linux PostgreSQL 16 + PostGIS runtime. |
| Node.js | v24.16.0 | Verified modern LTS compatible runtime. |
| npm | 11.13.0 | Verified package manager. |
| Git | 2.54.0.windows.1 | Verified version control engine. |
| Database Runtime | PostgreSQL + PostGIS (via WSL2 localhost:5432) | Verified real PostGIS spatial calculations, GiST indexes, and transaction engine. |
| Object Storage | Dual pipeline: Local quarantine & derivative engine + R2 API driver | Verified zero-cost local development with cloud R2 compatibility. |

---

## 2. Source Candidates & Licensing Verification

All sources are verified against explicit terms of service, open government licenses, and technical access constraints (see `docs/source-registry.md` for full metadata).

1. **OpenStreetMap India Extracts (Geofabrik)**
   - *Status*: `VERIFIED`
   - *License*: ODbL 1.0. Attribution required.
   - *Access*: Geofabrik regional PBF/GeoJSON extracts.
   - *Policy*: Direct bulk tile scraping prohibited; vectors imported into local PostGIS and PMTiles.

2. **PMTiles Basemap (Protomaps / OSM Vector)**
   - *Status*: `VERIFIED`
   - *License*: Data ODbL 1.0, client BSD-3-Clause.
   - *Access*: HTTP Range requests via MapLibre GL JS.

3. **Open Government Data (OGD / data.gov.in)**
   - *Status*: `VERIFIED`
   - *License*: Government Open Data License (GODL) India.
   - *Coverage*: National highway work packages, sanctioned expenditure, progress milestones.

4. **Central Public Procurement Portal (CPPP / GePNIC)**
   - *Status*: `VERIFIED`
   - *License*: Public procurement records under GODL.
   - *Integrity*: Only contracts backed by official Letter of Award (LoA) or signed agreement are populated into `work_contractors`.

5. **PMGSY / NRIDA (OMMAS & GeoSadak)**
   - *Status*: `VERIFIED`
   - *Coverage*: Rural road connectivity, five-year routine maintenance contractor tracking.

---

## 3. The Three Independent Coverage Layers

A critical architecture decision is maintaining three completely independent coverage boundaries:
1. **Basemap Coverage**: Cartographic visual rendering via PMTiles vector archive (pan-India).
2. **Road-Index Coverage**: Where roads have canonical database UUIDs, PostGIS geometry, snapping, and chainage (empirically measured and bounded).
3. **Official-Data Coverage**: Specific jurisdictions where public works authorities have imported packages.

The user interface must explicitly communicate these distinct boundaries so an unindexed road or area with no imported official records is never falsely marked as "healthy" or "normal".

---

## 4. National Capacity Measurement Model

### PostGIS Storage Geometry Calculations
- India total classified road network: ~6.3 million km.
- Estimated OSM road segments/ways: ~12–15 million features.
- Average PostGIS geometry record:
  - Coordinate points per LineString: ~25 points.
  - MultiLineString binary representation: ~450 bytes.
  - Attributes (`name`, `ref`, `highway`, `admin_codes`, `osm_ids`): ~250 bytes.
  - Total row size: ~700 bytes.
- Total table size for 15 million segments:
  $$\text{Storage} = 15{,}000{,}000 \times 700\text{ bytes} \approx 10.5\text{ GB}$$
- GiST spatial index overhead ($R\text{-tree}$ on PostGIS geometry): $\approx 2.5\text{ GB}$.
- Text search indexes (trigram/GIN on road names and refs): $\approx 1.8\text{ GB}$.
- **Total estimated national PostGIS footprint**: $\approx 14.8\text{ GB}$.

### Pilot vs. National Hosting Strategy
- **Stage 02 Pilot Bounded Samples**:
  - Urban: Bengaluru BBMP/BMRDA (~65,000 segments, $\approx 55\text{ MB}$).
  - Rural: Karnataka Ramanagara/Tumakuru (~20,000 segments, $\approx 18\text{ MB}$).
  - Combined sample: fits comfortably within free PostgreSQL tiers (< 500 MB).
- **National Deployment Decision**:
  - Managed free tiers (Supabase Free 500 MB) support pilot and regional staging.
  - For full national PostGIS deployment, provision dedicated storage (e.g. Supabase Pro $25/mo or dedicated Hetzner/DigitalOcean instance $12–20/mo).
  - Alternative: Partitioned spatial tiles with client-side bounding box caching.

---

## 5. Architectural & Deployment Path Selected
- **Next.js 15+ / React 19** with TypeScript, App Router, and Server Actions.
- **MapLibre GL JS** with vector tile rendering.
- **PostgreSQL 16 + PostGIS** for spatial queries and transactional domain mutations.
- **Sharp** for client/server image processing, stripping EXIF, resizing to max 1600px, and enforcing quarantine.
- **Local WSL2 PostgreSQL** enables 100% genuine local verification without relying on external cloud credits during development.
