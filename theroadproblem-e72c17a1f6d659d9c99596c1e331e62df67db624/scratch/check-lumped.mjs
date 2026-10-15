import { query } from '../src/db/client.ts';

async function run() {
  const lumped = await query(`
    SELECT r.id, r.name, count(rs.id) as seg_count
    FROM roads r
    JOIN road_segments rs ON rs.road_id = r.id
    WHERE r.is_official_corridor = FALSE AND r.name LIKE 'Unnamed%'
    GROUP BY r.id, r.name
    ORDER BY seg_count DESC;
  `);
  console.log('Lumped unnamed roads count:', lumped.rows.length);
  console.log('Top lumped unnamed roads:', lumped.rows.slice(0, 10));

  const totalSegs = await query(`
    SELECT count(*) FROM road_segments WHERE is_active = TRUE;
  `);
  console.log('Total active segments:', totalSegs.rows[0].count);

  process.exit(0);
}

run().catch(console.error);
