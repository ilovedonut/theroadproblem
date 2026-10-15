import { pool } from '../src/db/client.ts';

async function checkClusters() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT rs.id, rs.osm_way_id, ST_AsText(ST_Centroid(rs.geom)) as center
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE r.name = '1st Cross Road' AND rs.is_active = TRUE
      LIMIT 10;
    `);
    console.log('1st Cross Road segments:');
    for (const row of res.rows) {
      console.log(`  Way ${row.osm_way_id} at ${row.center}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkClusters().catch(console.error);
