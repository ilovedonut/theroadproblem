import { pool } from '../src/db/client.ts';

async function testSeparation() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find lumped unnamed segments
    const lumpedSegs = await client.query(`
      SELECT rs.id as segment_id, rs.osm_way_id, rs.road_class, rs.state, rs.district, r.name as road_name
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE r.is_official_corridor = FALSE
        AND r.name LIKE 'Unnamed%'
        AND rs.osm_way_id IS NOT NULL;
    `);

    console.log(`Found ${lumpedSegs.rows.length} segments attached to lumped unnamed roads.`);

    // Test creating individual roads and reassigning
    // We can do this with a single set-based SQL query:
    const reassignRes = await client.query(`
      WITH new_roads AS (
        INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
        SELECT 
          r.name,
          COALESCE(rs.road_class, r.road_class),
          'Local Public Authority',
          rs.state,
          rs.district,
          'osm:way:' || rs.osm_way_id::text,
          FALSE
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE r.is_official_corridor = FALSE
          AND r.name LIKE 'Unnamed%'
          AND rs.osm_way_id IS NOT NULL
        ON CONFLICT DO NOTHING
        RETURNING id, source_feature_id
      )
      SELECT count(*) FROM new_roads;
    `);

    console.log('Inserted new distinct roads:', reassignRes.rows[0].count);

    // Update road_id on road_segments
    const updateSegsRes = await client.query(`
      UPDATE road_segments rs
      SET road_id = r.id, updated_at = NOW()
      FROM roads r
      WHERE r.source_feature_id = 'osm:way:' || rs.osm_way_id::text
        AND rs.osm_way_id IS NOT NULL;
    `);

    console.log('Updated road_segments road_id count:', updateSegsRes.rowCount);

    // Delete unused lumped roads
    const delRes = await client.query(`
      DELETE FROM roads r
      WHERE r.is_official_corridor = FALSE
        AND r.name LIKE 'Unnamed%'
        AND r.source_feature_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM road_segments rs WHERE rs.road_id = r.id);
    `);
    console.log('Cleaned up empty lumped roads:', delRes.rowCount);

    // Verify top segment counts on roads
    const checkRes = await client.query(`
      SELECT r.name, r.is_official_corridor, count(rs.id) as seg_count
      FROM roads r
      JOIN road_segments rs ON rs.road_id = r.id
      GROUP BY r.id, r.name, r.is_official_corridor
      ORDER BY seg_count DESC
      LIMIT 10;
    `);
    console.log('Top roads after separation:');
    console.table(checkRes.rows);

    await client.query('ROLLBACK');
    console.log('Tested cleanly in transaction and rolled back.');
  } finally {
    client.release();
    await pool.end();
  }
}

testSeparation().catch(console.error);
