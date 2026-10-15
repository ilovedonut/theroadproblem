import { query } from '../src/db/client.ts';

async function runExplain() {
  const planRes = await query(`
    EXPLAIN (FORMAT JSON, ANALYZE)
    SELECT id FROM road_segments
    WHERE is_active = TRUE
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 150);
  `);
  console.log('Query Plan:');
  console.dir(planRes.rows[0]['QUERY PLAN'], { depth: null });
}

runExplain().catch(console.error);
