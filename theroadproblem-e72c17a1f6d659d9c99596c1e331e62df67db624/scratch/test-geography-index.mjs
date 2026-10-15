import { query } from '../src/db/client.ts';

async function main() {
  console.log('Creating GIST index on ((geom)::geography)...');
  await query(`
    CREATE INDEX IF NOT EXISTS idx_road_segments_geography 
    ON road_segments USING GIST (((geom)::geography));
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_road_segments_geog_active 
    ON road_segments USING GIST (((geom)::geography)) 
    WHERE is_active = TRUE;
  `);

  console.log('Running EXPLAIN (ANALYZE, BUFFERS)...');
  const explain = await query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id 
    FROM road_segments rs
    WHERE rs.is_active = TRUE
      AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 150);
  `);
  console.log('\nNew query plan:');
  console.log(explain.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Also test the full query used in route.ts:
  const explainFull = await query(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH ranked_candidates AS (
      SELECT 
        rs.id as segment_id,
        rs.road_id,
        r.name as road_name,
        r.ref as road_ref,
        COALESCE(rs.road_class, r.road_class) as road_class,
        r.authority_name,
        rs.district,
        COALESCE(rs.layer, 0) as layer,
        rs.bridge,
        rs.tunnel,
        rs.service,
        COALESCE(rs.is_service, FALSE) as is_service,
        rs.osm_way_id,
        rs.osm_tags,
        ROUND(ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography)::numeric, 1) as distance_m,
        ROW_NUMBER() OVER (
          PARTITION BY rs.road_id, COALESCE(rs.layer, 0), COALESCE(rs.is_service, FALSE)
          ORDER BY ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography) ASC
        ) as rank_per_carriageway
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.is_active = TRUE
        AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 150)
    )
    SELECT *
    FROM ranked_candidates
    WHERE rank_per_carriageway = 1
    ORDER BY distance_m ASC
    LIMIT 8;
  `);
  console.log('\nFull query plan:');
  console.log(explainFull.rows.map(r => r['QUERY PLAN']).join('\n'));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
