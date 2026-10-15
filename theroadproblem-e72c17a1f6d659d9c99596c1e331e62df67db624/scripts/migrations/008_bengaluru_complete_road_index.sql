-- ====================================================================
-- Migration: 008_bengaluru_complete_road_index.sql
-- Description:
-- 1. Provenance, CRS, checksum, and validity metadata on district_boundaries
-- 2. Explicit road usage_category, access_status ('unknown' default), aliases,
--    and unnamed fallback tracking on roads and road_segments
-- 3. Boundary-crossing geometry preservation (source_geom vs clipped geom,
--    source_length_m vs within_boundary_length_m, crosses_boundary)
-- 4. OSM topological node tracking (start_node_id, end_node_id, node_ids)
--    for split/merge lineage and grade-separated crossing distinction
-- 5. Recoverable import ledger enhancements (dry_run, rejection_breakdown,
--    deactivated_count, review_routed_count, checkpoint_offset, change_summary)
-- ====================================================================

-- 1. Enhance district_boundaries with complete provenance & geometry validation metadata
ALTER TABLE district_boundaries
  ADD COLUMN IF NOT EXISTS boundary_type TEXT NOT NULL DEFAULT 'administrative_district'
    CHECK (boundary_type IN ('administrative_district', 'municipal_corporation', 'metropolitan_region')),
  ADD COLUMN IF NOT EXISTS boundary_version TEXT NOT NULL DEFAULT 'osm-rel-2020589-v1',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_version_date TEXT,
  ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS crs TEXT NOT NULL DEFAULT 'EPSG:4326',
  ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS validity_reason TEXT DEFAULT 'Valid Geometry',
  ADD COLUMN IF NOT EXISTS repair_notes TEXT DEFAULT 'None required',
  ADD COLUMN IF NOT EXISTS area_sq_km NUMERIC;

-- 2. Enhance roads with explicit naming state, aliases, and category separation
ALTER TABLE roads
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS has_official_name BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_category TEXT NOT NULL DEFAULT 'public_motor'
    CHECK (usage_category IN ('public_motor', 'restricted_motor', 'construction_proposed', 'non_motor')),
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (access_status IN ('public', 'restricted', 'private', 'unknown'));

-- Backfill display_name and has_official_name on existing roads
UPDATE roads
SET has_official_name = FALSE,
    display_name = name
WHERE (name LIKE 'Unnamed%' OR name LIKE 'Unnamed %')
  AND is_official_corridor = FALSE;

UPDATE roads
SET display_name = name
WHERE display_name IS NULL;

-- Clear fabricated authority_name ('Local Public Authority') where no authoritative source or operator exists
UPDATE roads
SET authority_name = NULL
WHERE authority_name = 'Local Public Authority'
  AND is_official_corridor = FALSE;

CREATE INDEX IF NOT EXISTS idx_roads_aliases_gin ON roads USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_roads_usage_category ON roads (usage_category, district);

-- 3. Enhance road_segments with honest access default ('unknown'), boundary-clipping, and topology
ALTER TABLE road_segments
  ALTER COLUMN access SET DEFAULT 'unknown';

ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS usage_category TEXT NOT NULL DEFAULT 'public_motor'
    CHECK (usage_category IN ('public_motor', 'restricted_motor', 'construction_proposed', 'non_motor')),
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (access_status IN ('public', 'restricted', 'private', 'unknown')),
  ADD COLUMN IF NOT EXISTS oneway TEXT,
  ADD COLUMN IF NOT EXISTS lanes INT,
  ADD COLUMN IF NOT EXISTS surface TEXT,
  ADD COLUMN IF NOT EXISTS maxspeed TEXT,
  ADD COLUMN IF NOT EXISTS source_geom GEOMETRY(LineString, 4326),
  ADD COLUMN IF NOT EXISTS source_length_m NUMERIC,
  ADD COLUMN IF NOT EXISTS within_boundary_length_m NUMERIC,
  ADD COLUMN IF NOT EXISTS crosses_boundary BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS boundary_version TEXT,
  ADD COLUMN IF NOT EXISTS start_node_id BIGINT,
  ADD COLUMN IF NOT EXISTS end_node_id BIGINT,
  ADD COLUMN IF NOT EXISTS node_ids BIGINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- Correct existing segments where missing OSM access tag was previously defaulted to 'yes'
UPDATE road_segments
SET access = 'unknown',
    access_status = 'unknown'
WHERE access = 'yes'
  AND (osm_tags IS NULL OR NOT (osm_tags ? 'access'));

UPDATE road_segments
SET access_status = CASE
  WHEN access IN ('yes', 'public', 'permissive', 'designated') THEN 'public'
  WHEN access = 'private' THEN 'private'
  WHEN access IN ('no', 'military', 'restricted', 'customers', 'delivery', 'destination', 'agricultural', 'forestry') THEN 'restricted'
  ELSE 'unknown'
END,
usage_category = CASE
  WHEN road_class IN ('footway', 'cycleway', 'pedestrian', 'steps', 'track', 'path', 'bridleway', 'corridor') THEN 'non_motor'
  WHEN road_class IN ('construction', 'proposed') THEN 'construction_proposed'
  WHEN access IN ('private', 'no', 'military', 'restricted', 'customers', 'delivery', 'agricultural', 'forestry') THEN 'restricted_motor'
  ELSE 'public_motor'
END,
within_boundary_length_m = COALESCE(within_boundary_length_m, length_m),
source_length_m = COALESCE(source_length_m, length_m),
source_geom = COALESCE(source_geom, geom);

CREATE INDEX IF NOT EXISTS idx_road_segments_active_motor ON road_segments (is_active, usage_category, road_class);
CREATE INDEX IF NOT EXISTS idx_road_segments_nodes_gin ON road_segments USING GIN (node_ids);

-- 4. Enhance osm_imports for full auditability, dry-run support, and resumable checkpoints
ALTER TABLE osm_imports DROP CONSTRAINT IF EXISTS osm_imports_status_check;
ALTER TABLE osm_imports
  ADD CONSTRAINT osm_imports_status_check
  CHECK (status IN ('running', 'validating', 'completed', 'failed', 'dry_run', 'rolled_back'));

ALTER TABLE osm_imports
  ADD COLUMN IF NOT EXISTS boundary_version TEXT,
  ADD COLUMN IF NOT EXISTS boundary_checksum TEXT,
  ADD COLUMN IF NOT EXISTS source_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT '2.0.0',
  ADD COLUMN IF NOT EXISTS rejected_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deactivated_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_routed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS within_boundary_length_m NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motor_road_length_m NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checkpoint_offset INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 5. Allow events table to record 'road' entity events (e.g. road_renamed)
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_entity_type_check;
ALTER TABLE events
  ADD CONSTRAINT events_entity_type_check
  CHECK (entity_type IN ('incident', 'report', 'work', 'road', 'road_segment', 'contractor', 'corroboration'));
