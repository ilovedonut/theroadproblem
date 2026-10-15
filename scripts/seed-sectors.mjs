import { pool } from '../src/db/client.ts';
import { BENGALURU_URBAN_SECTORS } from '../src/lib/osm/collector.ts';

async function seedInitialSectors() {
  const client = await pool.connect();
  try {
    console.log('Registering already imported sectors (bengaluru_cbd, bengaluru_south_hosur)...');
    for (const key of ['bengaluru_cbd', 'bengaluru_south_hosur']) {
      const sector = BENGALURU_URBAN_SECTORS.find((s) => s.sector_key === key);
      if (!sector) continue;
      const [minLon, minLat, maxLon, maxLat] = sector.bbox;

      // Count active ways in this bbox
      const wayCountRes = await client.query(`
        SELECT count(*)
        FROM road_segments
        WHERE is_active = TRUE
          AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326));
      `, [minLon, minLat, maxLon, maxLat]);

      const waysCount = parseInt(wayCountRes.rows[0].count, 10);

      await client.query(`
        INSERT INTO imported_coverage_sectors (
          district, sector_key, sector_name, bounds_geom, ways_count, status, last_imported_at
        ) VALUES (
          $1, $2, $3,
          ST_MakeEnvelope($4, $5, $6, $7, 4326),
          $8, 'completed', NOW()
        )
        ON CONFLICT (district, sector_key) DO UPDATE
        SET bounds_geom = EXCLUDED.bounds_geom,
            ways_count = EXCLUDED.ways_count,
            status = 'completed',
            last_imported_at = NOW();
      `, [
        sector.district,
        sector.sector_key,
        sector.sector_name,
        minLon,
        minLat,
        maxLon,
        maxLat,
        waysCount
      ]);

      console.log(`  ✓ Registered sector ${sector.sector_key}: ${waysCount} active segments`);
    }

    const allSectors = await client.query(`
      SELECT sector_key, sector_name, ways_count, status, last_imported_at
      FROM imported_coverage_sectors
      WHERE district = 'Bengaluru Urban';
    `);
    console.table(allSectors.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

seedInitialSectors().catch(console.error);
