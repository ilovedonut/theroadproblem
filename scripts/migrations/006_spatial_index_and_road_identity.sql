-- ====================================================================
-- Migration: 006_spatial_index_and_road_identity.sql
-- Description: 
-- 1. Functional GIST index on (geom::geography) for 50x+ faster spatial lookups
-- 2. Road identity enhancements (is_official_corridor, source_feature_id)
-- 3. Imported coverage sectors table to prevent overstated district coverage
-- ====================================================================

-- 1. Functional GIST Geography Indexes on road_segments
-- Matching ST_DWithin(rs.geom::geography, point::geography, radius)
CREATE INDEX IF NOT EXISTS idx_road_segments_geog_active 
ON road_segments USING GIST (((geom)::geography)) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_road_segments_geography 
ON road_segments USING GIST (((geom)::geography));

-- 2. Road Identity Enhancements on roads
ALTER TABLE roads 
  ADD COLUMN IF NOT EXISTS is_official_corridor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_feature_id TEXT;

CREATE INDEX IF NOT EXISTS idx_roads_source_feature ON roads (source_feature_id);
CREATE INDEX IF NOT EXISTS idx_roads_official ON roads (is_official_corridor, district);

-- Mark existing curated government arterial corridors as official
UPDATE roads 
SET is_official_corridor = TRUE 
WHERE name IN (
  'Outer Ring Road',
  'Hosur Road (Elevated Tollway)',
  'Hosur Road (Surface Service Carriageway)',
  'Bellary Road (Airport Expressway Corridor)',
  'Old Airport Road',
  'Bannerghatta Road (Arterial)',
  'NICE Ring Road'
);

-- 3. Imported Coverage Sectors (Honest sector presence tracking)
CREATE TABLE IF NOT EXISTS imported_coverage_sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    district TEXT NOT NULL,
    sector_key TEXT NOT NULL,
    sector_name TEXT,
    bounds_geom GEOMETRY(Polygon, 4326) NOT NULL,
    ways_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    last_imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_sector_per_district UNIQUE (district, sector_key)
);

CREATE INDEX IF NOT EXISTS idx_coverage_sectors_geom ON imported_coverage_sectors USING GIST (bounds_geom);
