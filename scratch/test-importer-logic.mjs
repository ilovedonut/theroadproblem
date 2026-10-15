import { pool } from '../src/db/client.ts';

async function testResolution() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Test unnamed way resolution
    const sampleWayId1 = 99990001;
    const sampleWayId2 = 99990002;

    const sourceFeature1 = `osm:way:${sampleWayId1}`;
    const sourceFeature2 = `osm:way:${sampleWayId2}`;

    // Two unnamed residential streets
    const res1 = await client.query(`
      INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
      VALUES ('Unnamed residential street', 'residential', 'Local Public Authority', 'Karnataka', 'Bengaluru Urban', $1::text, FALSE)
      RETURNING id;
    `, [sourceFeature1]);

    const res2 = await client.query(`
      INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
      VALUES ('Unnamed residential street', 'residential', 'Local Public Authority', 'Karnataka', 'Bengaluru Urban', $1::text, FALSE)
      RETURNING id;
    `, [sourceFeature2]);

    console.log('Unnamed road 1 ID:', res1.rows[0].id);
    console.log('Unnamed road 2 ID:', res2.rows[0].id);
    console.log('Are unnamed road IDs distinct?', res1.rows[0].id !== res2.rows[0].id);

    // Test official corridor resolution (Outer Ring Road)
    const orrRes = await client.query(`
      SELECT id, name, is_official_corridor
      FROM roads
      WHERE is_official_corridor = TRUE AND district = 'Bengaluru Urban' AND name = 'Outer Ring Road';
    `);
    console.log('Official ORR:', orrRes.rows[0]);

    await client.query('ROLLBACK');
    console.log('Verified cleanly and rolled back.');
  } finally {
    client.release();
    await pool.end();
  }
}

testResolution().catch(console.error);
