import { pool } from '../src/db/client.ts';

async function testCluster() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        rs.id,
        rs.osm_way_id,
        ST_ClusterDBSCAN(ST_Transform(rs.geom, 3857), eps := 500, minpoints := 1) OVER (PARTITION BY rs.road_id) as cluster_id
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE r.name = '1st Cross Road' AND rs.is_active = TRUE;
    `);
    console.log(`Clustered ${res.rows.length} segments of 1st Cross Road:`);
    const clusters = new Map();
    for (const row of res.rows) {
      clusters.set(row.cluster_id, (clusters.get(row.cluster_id) || 0) + 1);
    }
    console.log('Distinct physical clusters found for 1st Cross Road:');
    for (const [cid, count] of clusters.entries()) {
      console.log(`  Cluster ${cid}: ${count} segments`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

testCluster().catch(console.error);
