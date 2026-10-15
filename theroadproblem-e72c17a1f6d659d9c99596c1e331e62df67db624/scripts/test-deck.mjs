import { pool } from '../src/db/client.ts';

async function testDeck() {
  const client = await pool.connect();
  try {
    const roads = await client.query(`
      SELECT r.id, r.name, r.ref, r.district,
             (SELECT COUNT(*) FROM road_segments WHERE road_id = r.id) as segment_count,
             (SELECT COUNT(*) FROM work_segments ws JOIN road_segments rs ON ws.road_segment_id = rs.id WHERE rs.road_id = r.id) as work_count
      FROM roads r
      ORDER BY r.name;
    `);
    console.table(roads.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

testDeck();
