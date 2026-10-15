import { query } from '../src/db/client.ts';

async function check() {
  const segs = await query(`
    SELECT rs.road_id, rs.osm_way_id, r.name, r.source_feature_id
    FROM road_segments rs
    JOIN roads r ON r.id = rs.road_id
    WHERE r.source_feature_id = 'osm:way:1103099894'
    LIMIT 10;
  `);
  console.log('Sample segments for osm:way:1103099894:');
  console.table(segs.rows);

  const wayCount = await query(`
    SELECT count(DISTINCT rs.osm_way_id) as distinct_ways, count(*) as total_rows
    FROM road_segments rs
    JOIN roads r ON r.id = rs.road_id
    WHERE r.source_feature_id = 'osm:way:1103099894';
  `);
  console.log('Stats:', wayCount.rows[0]);

  process.exit(0);
}

check().catch(console.error);
