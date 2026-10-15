import { pool } from '../src/db/client.ts';
import { importOsmRoads } from '../src/lib/osm/importer.ts';

async function main() {
  console.log('='.repeat(75));
  console.log(' THE ROAD PROBLEM: REPEATABLE OSM ROAD GEOMETRY INGESTION');
  console.log('='.repeat(75));

  const client = await pool.connect();
  try {
    const summary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      state: 'Karnataka'
    });

    console.log('\n[OSM Ingestion Summary]');
    console.log(`  Run ID:              ${summary.runId}`);
    console.log(`  District:            ${summary.district}`);
    console.log(`  Valid Road Ways:     ${summary.valid_ways}`);
    console.log(`  New Inserted:        ${summary.new_inserted}`);
    console.log(`  Updated Versions:    ${summary.updated_versions}`);
    console.log(`  Unchanged Skipped:   ${summary.unchanged_skipped}`);
    console.log(`  Storage Archived:    ${summary.storage_archived_key}`);
    console.log(`  License:             ${summary.license}`);
    console.log(`  Attribution:         ${summary.attribution}`);

    if (summary.errors.length > 0) {
      console.warn(`  Encountered Errors:`, summary.errors);
    }

    console.log('\n✓ Ingestion cycle completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('FATAL: OSM Road Import failed:', err);
  process.exit(1);
});
