import { pool } from '../src/db/client.ts';
import { importOsmRoads } from '../src/lib/osm/importer.ts';
import assert from 'node:assert/strict';

async function test8() {
  const client = await pool.connect();
  try {
    console.log('Testing 8a: rerun idempotency...');
    const rerunSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      sourceFilePath: 'scripts/data/bengaluru_roads_osm_sample.json',
      limit: 20,
    });
    console.log('Rerun summary:', rerunSummary);
    assert.equal(rerunSummary.new_inserted, 0);
    assert.equal(rerunSummary.updated_versions, 0);
    assert.equal(rerunSummary.unchanged_skipped, 20);

    console.log('Testing 8b: changed geometry...');
    await client.query('BEGIN');
    const sampleWayId = 23029710; // Vittal Mallya Road
    const beforeRes = await client.query(`
      SELECT id, geom, osm_version FROM road_segments WHERE osm_way_id = $1 AND is_active = TRUE LIMIT 1;
    `, [sampleWayId]);

    console.log('beforeRes:', beforeRes.rows[0]);

    const payload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'OpenStreetMap Test Reimport',
      license: 'Open Database License (ODbL) 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [{
        type: 'way',
        id: sampleWayId,
        version: (beforeRes.rows[0].osm_version || 1) + 1,
        tags: { highway: 'tertiary', name: 'Vittal Mallya Road (Updated Alignment)' },
        geometry: [
          { lon: 77.597754, lat: 12.971204 },
          { lon: 77.597587, lat: 12.971153 },
          { lon: 77.595000, lat: 12.971700 }
        ]
      }]
    };

    const updateSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload,
    });
    console.log('updateSummary:', updateSummary);

    await client.query('ROLLBACK');
    console.log('Test 8 passed!');
  } catch (err) {
    console.error('Test 8 failed with error:', err);
    try { await client.query('ROLLBACK'); } catch {}
  } finally {
    client.release();
    await pool.end();
  }
}

test8();
