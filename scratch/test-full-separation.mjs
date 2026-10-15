import { pool } from '../src/db/client.ts';

async function testFullSeparation() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Separate unnamed roads
    console.log('1. Separating unnamed lumped roads...');
    const unnamedRes = await client.query(`
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
    console.log(`Created ${unnamedRes.rows[0].count} individual unnamed roads.`);

    const updateUnnamedSegs = await client.query(`
      UPDATE road_segments rs
      SET road_id = r.id, updated_at = NOW()
      FROM roads r
      WHERE r.source_feature_id = 'osm:way:' || rs.osm_way_id::text
        AND rs.osm_way_id IS NOT NULL
        AND rs.road_id != r.id;
    `);
    console.log(`Updated ${updateUnnamedSegs.rowCount} unnamed segments to point to their own road.`);

    const delEmptyUnnamed = await client.query(`
      DELETE FROM roads r
      WHERE r.is_official_corridor = FALSE
        AND r.name LIKE 'Unnamed%'
        AND r.source_feature_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM road_segments rs WHERE rs.road_id = r.id);
    `);
    console.log(`Deleted ${delEmptyUnnamed.rowCount} empty lumped unnamed roads.`);

    // 2. Separate disconnected clusters for named unofficial roads
    console.log('2. Clustered separation for named unofficial roads...');
    const clusterRes = await client.query(`
      WITH cluster_step1 AS (
        SELECT 
          rs.id as segment_id,
          rs.road_id as orig_road_id,
          rs.osm_way_id,
          rs.road_class,
          rs.state,
          rs.district,
          r.name as road_name,
          r.authority_name,
          ST_ClusterDBSCAN(ST_Transform(rs.geom, 3857), eps := 500, minpoints := 1) OVER (PARTITION BY rs.road_id) as cluster_id
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE r.is_official_corridor = FALSE
          AND rs.is_active = TRUE
          AND rs.osm_way_id IS NOT NULL
      ),
      cluster_step2 AS (
        SELECT 
          *,
          FIRST_VALUE(osm_way_id) OVER (
            PARTITION BY orig_road_id, cluster_id
            ORDER BY segment_id
          ) as cluster_anchor_way_id
        FROM cluster_step1
      ),
      distinct_subroads AS (
        SELECT DISTINCT ON (orig_road_id, cluster_id)
          orig_road_id,
          cluster_id,
          road_name,
          road_class,
          authority_name,
          state,
          district,
          'osm:way:' || cluster_anchor_way_id::text as source_feature_id
        FROM cluster_step2
        WHERE cluster_id > 0
      ),
      inserted_subroads AS (
        INSERT INTO roads (name, road_class, authority_name, state, district, source_feature_id, is_official_corridor)
        SELECT 
          road_name,
          road_class,
          authority_name,
          state,
          district,
          source_feature_id,
          FALSE
        FROM distinct_subroads
        ON CONFLICT DO NOTHING
        RETURNING id, source_feature_id
      )
      SELECT count(*) FROM inserted_subroads;
    `);
    console.log(`Created ${clusterRes.rows[0].count} distinct sub-roads for disconnected clusters.`);

    // Reassign segments for cluster_id > 0
    const reassignClusteredSegs = await client.query(`
      WITH cluster_step1 AS (
        SELECT 
          rs.id as segment_id,
          rs.road_id as orig_road_id,
          rs.osm_way_id,
          ST_ClusterDBSCAN(ST_Transform(rs.geom, 3857), eps := 500, minpoints := 1) OVER (PARTITION BY rs.road_id) as cluster_id
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE r.is_official_corridor = FALSE
          AND rs.is_active = TRUE
          AND rs.osm_way_id IS NOT NULL
      ),
      cluster_step2 AS (
        SELECT 
          *,
          FIRST_VALUE(osm_way_id) OVER (
            PARTITION BY orig_road_id, cluster_id
            ORDER BY segment_id
          ) as cluster_anchor_way_id
        FROM cluster_step1
      )
      UPDATE road_segments rs
      SET road_id = r.id, updated_at = NOW()
      FROM cluster_step2 c
      JOIN roads r ON r.source_feature_id = 'osm:way:' || c.cluster_anchor_way_id::text
      WHERE rs.id = c.segment_id
        AND c.cluster_id > 0
        AND rs.road_id != r.id;
    `);
    console.log(`Reassigned ${reassignClusteredSegs.rowCount} segments to their proper physical cluster roads.`);

    // 3. Set source_feature_id for the remaining cluster 0 roads
    const anchorRes = await client.query(`
      UPDATE roads r
      SET source_feature_id = 'osm:way:' || rs.osm_way_id::text
      FROM (
        SELECT DISTINCT ON (road_id) road_id, osm_way_id
        FROM road_segments
        WHERE osm_way_id IS NOT NULL
        ORDER BY road_id, id
      ) rs
      WHERE r.id = rs.road_id AND r.source_feature_id IS NULL AND r.is_official_corridor = FALSE;
    `);
    console.log(`Anchored ${anchorRes.rowCount} cluster 0 roads with source_feature_id.`);

    // Verification check
    const check1stCross = await client.query(`
      SELECT r.id, r.name, r.source_feature_id, count(rs.id) as seg_count
      FROM roads r
      JOIN road_segments rs ON rs.road_id = r.id
      WHERE r.name = '1st Cross Road'
      GROUP BY r.id, r.name, r.source_feature_id
      ORDER BY seg_count DESC;
    `);
    console.log('1st Cross Road entities after clustering:');
    console.table(check1stCross.rows);

    await client.query('ROLLBACK');
    console.log('Test completed successfully and rolled back.');
  } finally {
    client.release();
    await pool.end();
  }
}

testFullSeparation().catch(console.error);
