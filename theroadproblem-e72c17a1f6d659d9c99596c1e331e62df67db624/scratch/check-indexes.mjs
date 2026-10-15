import { query } from '../src/db/client.ts';

async function main() {
  const indexes = await query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'road_segments';
  `);
  console.log('Current road_segments indexes:');
  console.log(indexes.rows);

  const explain = await query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id 
    FROM road_segments rs
    WHERE rs.is_active = TRUE
      AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 150);
  `);
  console.log('\nCurrent query plan:');
  console.log(explain.rows.map(r => r['QUERY PLAN']).join('\n'));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
