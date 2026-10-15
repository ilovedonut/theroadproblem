# Bengaluru Urban Road-Index Implementation, Manifest & Rollback Runbook

## 1. Coverage Scope & Boundary Provenance

| Attribute | Value |
| :--- | :--- |
| **Coverage Name** | Bengaluru Urban |
| **Boundary Type** | Administrative District (`administrative_district`, `admin_level=5`, Karnataka) |
| **Scope Distinction** | Covers the full Bengaluru Urban administrative district (`2,191.56 km²`), explicitly distinguished from the smaller BBMP municipal corporation limits and the wider BMRDA metropolitan area |
| **OSM Relation ID** | `2020589` (`https://www.openstreetmap.org/relation/2020589`) |
| **Boundary File** | `scripts/data/bengaluru_urban_boundary.geojson` |
| **Boundary Version** | `osm-rel-2020589-15668d7397e1` |
| **Source Version / Retrieval** | `2026-10-13` (`2026-10-13T18:55:36.835Z`) |
| **SHA-256 Checksum** | `15668d7397e1da5016019bf7256ce84e08a3172861f62c56d53b5ef68afb203b` |
| **CRS** | `EPSG:4326` (WGS 84) |
| **Bounding Box** | `[77.32553, 12.658009, 77.836964, 13.234676]` |
| **Geometry Validation** | `is_valid = true`, `is_simple = true`, 1 closed exterior ring (`6,177` vertices), `2,191.56 km²` geodesic area, `342.18 km` perimeter; zero topological repairs required |

### Boundary-Crossing Road Policy
Roads intersecting the Bengaluru Urban polygon are retained using `clipWayToBoundary` (`src/lib/osm/boundary.ts`) and PostGIS `ST_Intersection`:
- **Original Geometry & Identity Preserved**: The full source OSM way geometry (`road_segments.source_geom`), full source length (`road_segments.source_length_m`), `osm_way_id`, `osm_version`, and topological `node_ids` are stored intact.
- **Interior Portion Indexed**: `road_segments.geom` and `road_segments.within_boundary_length_m` store the `LineString` clipped strictly to the Bengaluru Urban polygon with `crosses_boundary = true`.

## 2. Explicit Inclusion & Classification Rules (`src/lib/osm/classification.ts`)

| Category (`usage_category`) | OSM `highway` / `access` Criteria | Indexed in Motor Network? |
| :--- | :--- | :--- |
| **`public_motor`** | `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `unclassified`, `residential`, `service`, `living_street`, `*_link`, `road` where access is `public`, `unknown`, or `destination` | Yes |
| **`restricted_motor`** | Motor highway classes above where `access`, `motor_vehicle`, or `vehicle` is `private`, `no`, `military`, `restricted`, `customers`, `delivery`, `permit`, `agricultural`, or `forestry` | Yes (flagged `access_status = 'private'` or `'restricted'`) |
| **`construction_proposed`** | `highway=construction` or `highway=proposed` | No (excluded by default; optional via `--include-construction`, never counted as active motor roads) |
| **`non_motor`** | `footway`, `cycleway`, `pedestrian`, `steps`, `track`, `path`, `bridleway`, `corridor` | No (excluded by default; optional via `--include-non-motor`, excluded from motor-road length and vehicle snapping) |
| **`excluded`** | Non-highway ways, point features, or geometries with `< 2` distinct vertices | No |

- **Missing Access Tags**: Recorded as `access = 'unknown'` and `access_status = 'unknown'` (fixing the prior bug where missing access defaulted to `'yes'`).
- **Unnamed Roads**: Never discarded. Each unnamed way keeps a distinct `roads` entity keyed by `source_feature_id = 'osm:way:<id>'` with `has_official_name = false` and an explicit fallback label (e.g., `Unnamed residential road`, `Unnamed service road (parking aisle)`).
- **Responsible Authority**: Never inferred from road name or `highway` class alone; `authority_name` is set only when an explicit OSM `operator` tag or official procurement record exists (`NULL` otherwise).

## 3. Reproducible Offline Extract & Import Commands

### Step A: Extract Bengaluru Urban from Geofabrik Regional `.osm.pbf`
```bash
# 1. Download dated/checksummed Southern Zone extract from Geofabrik:
#    https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf

# 2. Extract Bengaluru Urban polygon and filter highway ways into checksummed JSON:
npm run osm:extract:bengaluru -- \
  --regional-pbf /path/to/southern-zone-latest.osm.pbf \
  --boundary scripts/data/bengaluru_urban_boundary.geojson \
  --output scripts/data/bengaluru_urban_roads.osm.json
```

### Step B: Run Database Migrations & Seed Boundary Provenance
```bash
npm run db:migrate
npm run db:seed:boundaries
```

### Step C: Execute Dry-Run Inspection Before Publication
```bash
npm run osm:import:bengaluru:dry-run -- \
  --input scripts/data/bengaluru_urban_roads.osm.json \
  --output-report docs/evidence/stage-02/bengaluru-road-index-dry-run.json
```

### Step D: Execute Production / Staging Import (Resumable & Atomic per Batch)
```bash
npm run osm:import:bengaluru -- \
  --input scripts/data/bengaluru_urban_roads.osm.json \
  --output-report docs/evidence/stage-02/bengaluru-road-index-live.json

# If interrupted, resume from last committed checkpoint_offset:
node --experimental-strip-types scripts/import-osm-roads.mjs \
  --district "Bengaluru Urban" \
  --input scripts/data/bengaluru_urban_roads.osm.json \
  --resume-offset <checkpoint_offset>
```

## 4. Rollback & Recovery Procedure

1. **Automatic Chunk Rollback on Failure**:
   - Each batch of 60 ways runs inside its own transaction (`BEGIN ... COMMIT` or `SAVEPOINT chunk_sp_N`). If any database or validation error occurs mid-run, the in-flight batch rolls back immediately, leaving previously active segments untouched, and `osm_imports.status` is marked `'failed'` with `checkpoint_offset` preserved.
2. **Pre-Publication Anomaly Gate (`validateStagedImport`)**:
   - Before any deletions are applied, the importer verifies that the input is a complete extract (`isCompleteExtract = true`) and that proposed deactivations do not exceed `15%` of active segments. Partial extracts are blocked from deactivating any segments.
3. **Manual Rollback of a Completed Run (`<run_id>`)**:
   ```sql
   BEGIN;

   -- 1. Reactivate parent segments that were superseded during the target import window
   UPDATE road_segments parent
   SET is_active = TRUE,
       deactivated_at = NULL,
       deactivation_reason = NULL,
       updated_at = NOW()
   FROM road_segment_lineage rsl
   JOIN road_segments child ON child.id = rsl.segment_id
   JOIN osm_imports oi ON oi.id = '<run_id>'::uuid
   WHERE rsl.parent_segment_id = parent.id
     AND child.created_at >= oi.started_at
     AND child.created_at <= COALESCE(oi.completed_at, NOW());

   -- 2. Deactivate child segments created in that run
   UPDATE road_segments child
   SET is_active = FALSE,
       deactivated_at = NOW(),
       deactivation_reason = 'manual_import_rollback:<run_id>'
   FROM osm_imports oi
   WHERE oi.id = '<run_id>'::uuid
     AND child.district = oi.district
     AND child.created_at >= oi.started_at
     AND child.created_at <= COALESCE(oi.completed_at, NOW());

   -- 3. Mark the import run as rolled_back
   UPDATE osm_imports
   SET status = 'rolled_back'
   WHERE id = '<run_id>'::uuid;

   COMMIT;
   ```
