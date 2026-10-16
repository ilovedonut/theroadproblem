-- Public map summaries only need roads with a recorded responsible authority.
-- Keep that lookup independent of the size of the full OSM road index.
CREATE INDEX IF NOT EXISTS idx_roads_recorded_authority
  ON public.roads (authority_name, id)
  WHERE authority_name IS NOT NULL AND authority_name <> 'Local Public Authority';

-- Identify city-zoom candidates (including legacy NULL class fallback) without
-- scanning every segment or fetching geometry just to discover eligible IDs.
CREATE INDEX IF NOT EXISTS idx_road_segments_active_class
  ON public.road_segments (road_class, road_id, id) WHERE is_active;
