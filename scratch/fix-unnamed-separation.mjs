import { pool } from '../src/db/client.ts';

async function fixUnnamed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find unnamed segments where road has multiple segments or is lumped
    const res = await client.query(`
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
        ON CONFLICT (id) DO NOTHING
        RETURNING id, source_feature_id
      )
      UPDATE road_segments rs
      SET road_id = ins.id, updated_at = NOW()
      FROM inserted_roads ins
      WHERE ins.source_feature_id = 'osm:way:' || rs.osm_way_id::text
        AND rs.road_id != ins.id;
    `);

    console.log('Updated unnamed segments count:', res.rowCount);

    // Delete empty lumped unnamed roads
    const delRes = await client.query(`
      DELETE FROM roads r
      WHERE r.is_official_corridor = FALSE
        AND r.name LIKE 'Unnamed%'
        AND NOT EXISTS (SELECT 1 FROM road_segments rs WHERE rs.road_id = r.id);
    `);
    console.log('Deleted empty lumped unnamed roads:', delRes.rowCount);

    // Check max segments per unnamed road
    const checkMax = await client.query(`
      SELECT r.id, r.name, r.source_feature_id, count(rs.id) as seg_count
      FROM roads r
      JOIN road_segments rs ON rs.road_id = r.id
      WHERE r.name LIKE 'Unnamed%'
      GROUP BY r.id, r.name, r.source_feature_id
      ORDER BY seg_count DESC
      LIMIT 5;
    `);
    console.log('Top unnamed roads by segment count:');
    console.table(checkMax.rows);

    await client.query('COMMIT');
    console.log('Committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

fixUnnamed().catch(console.error);
