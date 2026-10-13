# Source Registry: theroadproblem.quest

Date: 13 October 2026
Status: Active Reference
Standard: ODbL 1.0 / GODL India Compliance

This registry catalogs all external data sources, exact access endpoints, license boundaries, retrieval verification, and operational constraints used across development, staging, and production.

---

## 1. Cartographic and Basemap Data

### S01: OpenStreetMap (OSM) Road Network Extracts
- **Identity**: Geofabrik OpenStreetMap India Regional Extract
- **Base URI**: `https://download.geofabrik.de/asia/india.html`
- **Specific License**: Open Database License (ODbL) 1.0
- **License Evidence**: [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright)
- **Attribution Requirement**: "© OpenStreetMap contributors" prominently on map views and `/attributions`.
- **Fields Utilized**: `osm_id`, `highway`, `name`, `ref`, `surface`, `lanes`, `bridge`, `tunnel`, `oneway`, `geometry (LineString / MultiLineString)`.
- **Geographic Coverage**: Nationwide India (36 states & UTs). Sub-extracts: Karnataka (Urban sample: Bengaluru BBMP/BMRDA), Rural sample (Ramanagara / Tumakuru districts).
- **Verification State**: `VERIFIED`
- **Access Limits & Policy**: Bulk automated requests to `tile.openstreetmap.org` or public Overpass instances are strictly avoided in production. Data is ingested into local PostGIS and vector tile archives.

### S02: Protomaps Vector Tile Basemap (PMTiles)
- **Identity**: OSM-derived PMTiles India Basemap Archive
- **Base URI**: `https://build.protomaps.com/` / Self-hosted R2 Object Store (`india-basemap.pmtiles`)
- **Specific License**: Data: ODbL 1.0; Format & Tools: BSD-3-Clause
- **License Evidence**: [Protomaps Docs & Cloud Storage](https://docs.protomaps.com/pmtiles/cloud-storage)
- **Fields Utilized**: Vector tile layers: `roads`, `places`, `water`, `landuse`, `boundaries`, `pois`.
- **Geographic Coverage**: Nationwide India zoom 0–15.
- **Verification State**: `VERIFIED` (HTTP Range Request / CORS compliant).
- **Access Limits**: Cloudflare R2 standard storage with free egress; fallback vector styling for MapLibre GL JS.

---

## 2. Administrative & Locality Reference

### S03: Local Government Directory (LGD) & Census Administrative Hierarchy
- **Identity**: Ministry of Panchayati Raj Local Government Directory (LGD)
- **Base URI**: `https://lgdirectory.gov.in/`
- **Specific License**: Government Open Data License (GODL) India
- **License Evidence**: National Data Sharing and Accessibility Policy (NDSAP) / data.gov.in terms
- **Fields Utilized**: `state_code`, `state_name`, `district_code`, `district_name`, `subdistrict_name`, `local_body_type`, `ward_village_name`, `centroid_lat`, `centroid_lon`.
- **Geographic Coverage**: All States and Union Territories.
- **Verification State**: `VERIFIED`
- **Usage**: Powers search suggestions, administrative filtering, and reverse geocoding fallback when device GPS is unavailable.

---

## 3. Official Public Works & Procurement Sources

### S04: Open Government Data (OGD) Platform India
- **Identity**: data.gov.in Transport & Infrastructure Datasets
- **Base URI**: `https://data.gov.in/`
- **Specific License**: Government Open Data License (GODL) India
- **License Evidence**: [data.gov.in Terms of Use](https://www.data.gov.in/terms-of-use), [GODL Text](https://www.data.gov.in/sites/default/files/NDSAP_OpenDataLicense.pdf)
- **Attribution Requirement**: "Data Source: Open Government Data (OGD) Platform India (data.gov.in), published by Ministry of Road Transport and Highways / respective authorities."
- **Fields Utilized**: `resource_id`, `state_name`, `nh_number`, `chainage_start_km`, `chainage_end_km`, `work_name`, `sanctioned_cost_cr`, `physical_progress_pct`, `target_completion_date`, `actual_completion_date`.
- **Verification State**: `VERIFIED`
- **Ingestion Method**: Automated scheduled pull with SHA-256 checksumming, parser versioning, and immutable snapshot archiving in object storage.

### S05: Central Public Procurement Portal (CPPP) / GePNIC
- **Identity**: Central Public Procurement Portal (eprocure.gov.in) Award Notices
- **Base URI**: `https://eprocure.gov.in/eprocure/app`
- **Specific License**: GODL India / Public Domain official gazette notice
- **Fields Utilized**: `tender_id`, `tender_reference_number`, `work_description`, `organization_chain`, `awarded_contractor_name`, `award_value_inr`, `contract_date`, `completion_period_months`, `defect_liability_period_months`.
- **Verification State**: `VERIFIED`
- **Access Boundaries**: Complies with robots.txt, respects rate limits, never automates around CAPTCHA or authenticated sessions. Award verification requires documented Letter of Award (LoA) or Contract Agreement reference.

### S06: PMGSY / NRIDA (OMMAS & GeoSadak)
- **Identity**: Online Management, Monitoring and Accounting System (OMMAS) & GeoSadak GIS
- **Base URI**: `https://omms.nic.in` & `https://geosadak-pmgsy.nic.in/opendata`
- **Specific License**: Ministry of Rural Development Open Data Release under GODL
- **Fields Utilized**: `package_id`, `road_name`, `sanction_length_km`, `habitation_connected`, `contractor_name`, `contract_amount_lakhs`, `status`, `maintenance_period_years`.
- **Verification State**: `VERIFIED`
- **Usage**: Rural road network work packages and multi-year maintenance contractor tracking.

---

## 4. Source Adapter Compliance Invariants

1. **Immutable Snapshot & Checksum**: Every external retrieval stores the raw payload with SHA-256 checksum and exact retrieval timestamp in `source_records`.
2. **No Silent Overwrites**: When an external source updates, a new `source_record` version is appended and an audit `event` is emitted. Existing citizen observations or historical timelines are never erased.
3. **Attribution Transparency**: Every official work card on the user interface displays:
   - Source publisher and name
   - Source resource ID / URL
   - Retrieval timestamp and publication date
   - Matching confidence score and criteria (e.g. "Matched on NH-48 chainage 14.2–18.5 km")
   - Clear disclaimer that contractor linkage indicates documented public works assignment and does not constitute proven legal liability for community damage observations.
