-- ====================================================================
-- Migration: 007_separate_unnamed_and_disconnected_roads.sql
-- Description:
-- 1. Separates unnamed roads so each OSM way has its own distinct road entity
-- 2. Clusters disconnected roads sharing a generic local name (>500m apart)
--    into distinct physical road entities while preserving official corridors
-- 3. Ensures every imported road has a unique source_feature_id
-- ====================================================================

-- 1. Separate Unnamed Lumped Roads
WITH unnamed_ways AS (
  SELECT DISTINCT rs.osm_way_id, rs.state, rs.district, COALESCE(rs.road_class, 'road') as road_class, r.name
  FROM road_segments rs
  JOIN roads r ON r.id = rs.road_id
  WHERE r.is_official_corridor = FALSE
    AND (r.name LIKE 'Unnamed%' OR r.name LIKE 'Unnamed %')
    AND rs.osm_way_id IS NOT NULL
),
inserted_roads AS (
  INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
  SELECT 
    uw.name,
    uw.road_class,
    'Local Public Authority',
    uw.state,
    uw.district,
    'osm:way:' || uw.osm_way_id::text,
    FALSE
  FROM unnamed_ways uw
  ON CONFLICT DO NOTHING
  RETURNING id, source_feature_id
)
UPDATE road_segments rs
SET road_id = ins.id, updated_at = NOW()
FROM inserted_roads ins
WHERE ins.source_feature_id = 'osm:way:' || rs.osm_way_id::text
  AND rs.road_id != ins.id;

-- Delete empty lumped unnamed roads
DELETE FROM roads r
WHERE r.is_official_corridor = FALSE
  AND r.name LIKE 'Unnamed%'
  AND NOT EXISTS (SELECT 1 FROM road_segments rs WHERE rs.road_id = r.id);

-- 2. Cluster Disconnected Named Unofficial Roads (>500m apart)
WITH cluster_step1 AS (
  SELECT 
    rs.id as segment_id,
    rs.road_id as orig_road_id,
    rs.osm_way_id,
    rs.road_class,
    rs.state,
    rs.district,
    r.name as road_name,
    r.authority_name,
    ST_ClusterDBSCAN(ST_Transform(rs.geom, 3857), eps := 500, minpoints := 1) OVER (PARTITION BY rs.road_id) as cluster_id
  FROM road_segments rs
  JOIN roads r ON r.id = rs.road_id
  WHERE r.is_official_corridor = FALSE
    AND rs.is_active = TRUE
    AND rs.osm_way_id IS NOT NULL
),
cluster_step2 AS (
  SELECT 
    *,
    FIRST_VALUE(osm_way_id) OVER (
      PARTITION BY orig_road_id, cluster_id
      ORDER BY segment_id
    ) as cluster_anchor_way_id
  FROM cluster_step1
),
distinct_subroads AS (
  SELECT DISTINCT ON (orig_road_id, cluster_id)
    orig_road_id,
    cluster_id,
    road_name,
    road_class,
    authority_name,
    state,
    district,
    'osm:way:' || cluster_anchor_way_id::text as source_feature_id
  FROM cluster_step2
  WHERE cluster_id > 0
),
inserted_subroads AS (
  INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
  SELECT 
    road_name,
    road_class,
    authority_name,
    state,
    district,
    source_feature_id,
    FALSE
  FROM distinct_subroads
  ON CONFLICT DO NOTHING
  RETURNING id, source_feature_id
)
UPDATE road_segments rs
SET road_id = r.id, updated_at = NOW()
FROM cluster_step2 c
JOIN roads r ON r.source_feature_id = 'osm:way:' || c.cluster_anchor_way_id::text
WHERE rs.id = c.segment_id
  AND c.cluster_id > 0
  AND rs.road_id != r.id;

-- 3. Anchor Cluster 0 roads with source_feature_id
UPDATE roads r
SET source_feature_id = 'osm:way:' || rs.osm_way_id::text
FROM (
  SELECT DISTINCT ON (road_id) road_id, osm_way_id
  FROM road_segments
  WHERE osm_way_id IS NOT NULL
  ORDER BY road_id, id
) rs
WHERE r.id = rs.road_id AND r.source_feature_id IS NULL AND r.is_official_corridor = FALSE;
