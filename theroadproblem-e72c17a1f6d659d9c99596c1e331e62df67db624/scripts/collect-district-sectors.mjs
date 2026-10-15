import { pool } from '../src/db/client.ts';
import { BENGALURU_URBAN_SECTORS, collectAndImportSector } from '../src/lib/osm/collector.ts';

async function main() {
  console.log('='.repeat(75));
  console.log(' THE ROAD PROBLEM: DISTRICT SECTOR OVERPASS COLLECTOR & INDEXER');
  console.log('='.repeat(75));

  const client = await pool.connect();
  try {
    for (const sector of BENGALURU_URBAN_SECTORS) {
      console.log(`\n--> Processing Sector: [${sector.sector_key}] - ${sector.sector_name}`);
      console.log(`    BBox: [${sector.bbox.join(', ')}]`);

      try {
        const summary = await collectAndImportSector(client, sector, {
          // If running full collection script, limit can be set or omitted
          limit: 100
        });

        console.log(`    ✓ Status: Success`);
        console.log(`      Valid Ways:     ${summary.valid_ways}`);
        console.log(`      New Inserted:   ${summary.new_inserted}`);
        console.log(`      Updated:        ${summary.updated_versions}`);
        console.log(`      Skipped:        ${summary.unchanged_skipped}`);
      } catch (secErr: any) {
        console.error(`    ✗ Error in sector ${sector.sector_key}:`, secErr.message);
      }
    }

    // Display summary of imported coverage sectors in DB
    const secRes = await client.query(`
      SELECT sector_key, sector_name, ways_count, status, last_imported_at
      FROM imported_coverage_sectors
      WHERE district = 'Bengaluru Urban'
      ORDER BY last_imported_at DESC;
    `);

    console.log('\n[Imported Coverage Sectors in Database]');
    console.table(secRes.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal collector error:', err);
  process.exit(1);
});
