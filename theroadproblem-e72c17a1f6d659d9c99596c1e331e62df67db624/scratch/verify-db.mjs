import { query } from '../src/db/client.ts';

async function check() {
  const r = await query(`
    SELECT 
      count(*) as total_roads, 
      count(*) FILTER (WHERE source_feature_id IS NOT NULL) as with_source_feature, 
      count(*) FILTER (WHERE is_official_corridor = true) as official 
    FROM roads;
  `);
  console.log('roads stats:', r.rows[0]);

  const unnamed = await query(`
    SELECT r.name, r.source_feature_id, count(rs.id) as seg_count 
    FROM roads r 
    JOIN road_segments rs ON rs.road_id = r.id 
    WHERE r.name LIKE 'Unnamed%' 
    GROUP BY r.id, r.name, r.source_feature_id 
    ORDER BY seg_count DESC 
    LIMIT 5;
  `);
  console.log('unnamed roads segment counts (should be 1 each):', unnamed.rows);

  const officialCheck = await query(`
    SELECT r.name, count(rs.id) as seg_count
    FROM roads r
    JOIN road_segments rs ON rs.road_id = r.id
    WHERE r.is_official_corridor = TRUE
    GROUP BY r.id, r.name
    ORDER BY seg_count DESC;
  `);
  console.log('official corridor segment counts:', officialCheck.rows);

  process.exit(0);
}

check().catch(console.error);
