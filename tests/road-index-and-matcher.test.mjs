import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool, query } from '../src/db/client.ts';
import { generateInformativeLabel, importOsmRoads } from '../src/lib/osm/importer.ts';
import { matchRoadPrecisely, linkWorkSegmentsWithPrecision } from '../src/lib/matcher.ts';
import { GET as getNearestRoads } from '../src/app/api/v1/roads/nearest/route.ts';

test('1. Administrative District Boundary Coverage Check', async () => {
  // Test 1a: Coordinate inside Bengaluru Urban (MG Road)
  const insideRes = await query(`
    SELECT district, state
    FROM district_boundaries
    WHERE ST_Contains(boundary_geom, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326))
    LIMIT 1;
  `);
  assert.equal(insideRes.rows.length, 1, 'MG Road should fall inside Bengaluru Urban');
  assert.equal(insideRes.rows[0].district, 'Bengaluru Urban');

  // Test 1b: Coordinate outside pilot boundary (New Delhi)
  const outsideRes = await query(`
    SELECT district, state
    FROM district_boundaries
    WHERE ST_Contains(boundary_geom, ST_SetSRID(ST_MakePoint(77.2090, 28.6139), 4326))
    LIMIT 1;
  `);
  assert.equal(outsideRes.rows.length, 0, 'New Delhi coordinate should fall outside pilot boundary');

  // Test 1c: Verify nearest road API endpoint behaves according to boundary
  const insideReq = new Request('http://localhost/api/v1/roads/nearest?lon=77.5946&lat=12.9716&radius=150');
  const insideApi = await (await getNearestRoads(insideReq)).json();
  assert.equal(insideApi.in_coverage, true);
  assert.equal(insideApi.coverage_area, 'Bengaluru Urban');
  assert.ok(insideApi.candidates.length > 0);

  const outsideReq = new Request('http://localhost/api/v1/roads/nearest?lon=77.2090&lat=28.6139&radius=150');
  const outsideApi = await (await getNearestRoads(outsideReq)).json();
  assert.equal(outsideApi.in_coverage, false);
  assert.equal(outsideApi.coverage_status, 'outside_pilot_coverage');
  assert.equal(outsideApi.candidates.length, 0);
  assert.equal(outsideApi.fallback_available, true);
});

test('2. Candidate Carriageway Diversity & Grade Partitioning', async () => {
  // Near Silk Board / Hosur Road intersection where elevated tollway, surface carriageway, and cross roads coexist
  const req = new Request('http://localhost/api/v1/roads/nearest?lon=77.625546&lat=12.917216&radius=150');
  const apiRes = await (await getNearestRoads(req)).json();
  assert.equal(apiRes.in_coverage, true);
  assert.ok(apiRes.candidates.length >= 2, 'Should return multiple distinct candidates');

  const elevated = apiRes.candidates.filter(c => c.is_elevated || c.layer > 0);
  const surface = apiRes.candidates.filter(c => !c.is_elevated && c.layer === 0);

  assert.ok(elevated.length >= 1, 'Should include at least one elevated candidate');
  assert.ok(surface.length >= 1, 'Should include surface carriageway or cross street candidates');

  // Verify candidate segments have valid geometries
  for (const c of apiRes.candidates) {
    assert.ok(c.segment_id, 'Candidate must have segment_id');
    assert.ok(c.display_label, 'Candidate must have display_label');
    assert.ok(c.geom_geojson, 'Candidate must have GeoJSON string');
    const parsed = JSON.parse(c.geom_geojson);
    assert.equal(parsed.type, 'LineString');
    assert.ok(parsed.coordinates.length >= 2);
  }
});

test('3. Informative Labels for Unnamed & Service Roads', () => {
  assert.equal(
    generateInformativeLabel({ highway: 'service', service: 'parking_aisle' }),
    'Unnamed service road (parking aisle)'
  );
  assert.equal(
    generateInformativeLabel({ highway: 'secondary_link' }),
    'Unnamed secondary connector'
  );
  assert.equal(
    generateInformativeLabel({ highway: 'residential' }),
    'Unnamed residential street'
  );
  assert.equal(
    generateInformativeLabel({ highway: 'primary', bridge: 'yes' }),
    'Unnamed primary road [Elevated]'
  );
  assert.equal(
    generateInformativeLabel({ highway: 'motorway_link', bridge: 'yes' }),
    'Unnamed motorway connector [Elevated]'
  );
});

test('4. Safe Ingestion Matcher - Unit Normalization without Magnitude Guessing', async () => {
  const client = await pool.connect();
  try {
    // 4a: Explicit km chainage matching
    const resKm = await matchRoadPrecisely(client, {
      tender_id: 'TEST-KM-01',
      package_name: 'Test ORR Rehabilitation',
      district: 'Bengaluru Urban',
      road_name_hint: 'Outer Ring Road',
      chainage_start: 0.0,
      chainage_end: 8.5,
      chainage_unit: 'km',
    });
    assert.equal(resKm.is_ambiguous, false);
    assert.equal(resKm.review_status, 'approved');
    assert.ok(resKm.matched_segment_ids.length > 0);

    // 4b: Explicit meter chainage matching (converted to km without guessing)
    const resM = await matchRoadPrecisely(client, {
      tender_id: 'TEST-M-01',
      package_name: 'Test ORR Rehabilitation Meters',
      district: 'Bengaluru Urban',
      road_name_hint: 'Outer Ring Road',
      chainage_start: 0,
      chainage_end: 8500,
      chainage_unit: 'm',
    });
    assert.equal(resM.is_ambiguous, false);
    assert.equal(resM.review_status, 'approved');
    assert.deepEqual(resM.matched_segment_ids, resKm.matched_segment_ids, 'Explicit m and km should resolve to identical segment set');

    // 4c: Ambiguous numbers without explicit unit must REFUSE magnitude guessing
    const resNoUnit = await matchRoadPrecisely(client, {
      tender_id: 'TEST-NO-UNIT-01',
      package_name: 'Test Ambiguous Unit Tender',
      district: 'Bengaluru Urban',
      road_name_hint: 'Outer Ring Road',
      chainage_start: 120, // would have been mistakenly divided by 1000 under old magnitude guessing
      chainage_end: 350,
      chainage_unit: null, // No explicit unit
    });
    // Since unit was omitted and road has multiple segments, it must be routed for review to prevent misattribution
    assert.equal(resNoUnit.is_ambiguous, true);
    assert.equal(resNoUnit.review_status, 'needs_review');
    assert.equal(resNoUnit.matched_segment_ids.length, 0);
  } finally {
    client.release();
  }
});

test('5. Multi-Segment Road Misattribution Protection & Queue Routing', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create a temporary test work record
    const workRes = await client.query(`
      INSERT INTO works (
        tender_id, contract_id, package_name, authority_name, work_type, official_status
      ) VALUES ('TEST-TENDER-MULTI', 'CONTRACT-MULTI-999', 'Repaving Tender with Name Alone', 'BBMP', 'Asphalt', 'awarded')
      RETURNING id;
    `);
    const workId = workRes.rows[0].id;

    // Call precision linking with only a road name on Outer Ring Road (which has 4+ segments)
    const matchResult = await linkWorkSegmentsWithPrecision(client, workId, {
      tender_id: 'TEST-TENDER-MULTI',
      package_name: 'Repaving Tender with Name Alone',
      district: 'Bengaluru Urban',
      road_name_hint: 'Outer Ring Road',
    });

    // Verify it is flagged as ambiguous and routed for review
    assert.equal(matchResult.is_ambiguous, true);
    assert.equal(matchResult.review_status, 'needs_review');
    assert.equal(matchResult.matched_segment_ids.length, 0, 'Must NOT attach to all segments on name alone');
    assert.ok(matchResult.candidate_segment_ids.length > 1, 'Must include candidate segment IDs');
    assert.match(matchResult.ambiguity_reason, /prevent misattribution/i);

    // Verify record in ambiguous_matches_queue
    const queueRes = await client.query(`
      SELECT * FROM ambiguous_matches_queue WHERE work_id = $1;
    `, [workId]);
    assert.equal(queueRes.rows.length, 1);
    assert.equal(queueRes.rows[0].status, 'pending');
    assert.ok(queueRes.rows[0].candidate_segment_ids.length > 1);

    // Verify zero work_segments were inserted
    const wsRes = await client.query(`
      SELECT * FROM work_segments WHERE work_id = $1;
    `, [workId]);
    assert.equal(wsRes.rows.length, 0, 'No work_segments should be inserted for ambiguous match');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

test('6. Preservation of Approved and Manual Verified Associations', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create a work package
    const workRes = await client.query(`
      INSERT INTO works (
        tender_id, contract_id, package_name, authority_name, work_type, official_status
      ) VALUES ('TEST-TENDER-PRESERVE', 'CON-PRESERVE-01', 'Preservation Test Package', 'NHAI', 'Maintenance', 'awarded')
      RETURNING id;
    `);
    const workId = workRes.rows[0].id;

    // Pick an active segment from Outer Ring Road
    const segRes = await query(`
      SELECT rs.id FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE r.name = 'Outer Ring Road' AND rs.is_active = TRUE
      LIMIT 1;
    `);
    const verifiedSegmentId = segRes.rows[0].id;

    // 2. Insert manual_verified association
    await client.query(`
      INSERT INTO work_segments (
        work_id, road_segment_id, matching_confidence, review_status, review_notes
      ) VALUES ($1, $2, 'manual_verified', 'approved', 'Verified by field inspector on-site');
    `, [workId, verifiedSegmentId]);

    // 3. Re-run automated link with different parameters
    await linkWorkSegmentsWithPrecision(client, workId, {
      tender_id: 'TEST-TENDER-PRESERVE',
      package_name: 'Preservation Test Package',
      district: 'Bengaluru Urban',
      road_name_hint: 'Outer Ring Road',
      chainage_start_km: 0.0,
      chainage_end_km: 17.5,
    });

    // 4. Assert the manual_verified segment remains intact
    const checkRes = await client.query(`
      SELECT matching_confidence, review_status, review_notes
      FROM work_segments
      WHERE work_id = $1 AND road_segment_id = $2;
    `, [workId, verifiedSegmentId]);

    assert.equal(checkRes.rows.length, 1);
    assert.equal(checkRes.rows[0].matching_confidence, 'manual_verified', 'Must preserve manual_verified confidence');
    assert.equal(checkRes.rows[0].review_status, 'approved', 'Must preserve approved review_status');
    assert.equal(checkRes.rows[0].review_notes, 'Verified by field inspector on-site', 'Must preserve review notes');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

test('7. Unmatched Reporting Invariant (submit_report_atomic with NULL segment)', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create a mock user
    const userId = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Unmatched Reporter', 'unmatched-reporter@test.internal', 'citizen');
    `, [userId]);

    // Submit report with explicit NULL target segment ID
    const submitRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        $2::double precision,
        $3::double precision,
        'pothole',
        'damaged',
        'Unmatched point pothole in rural boundary area',
        NOW(),
        'TEST-IDEMP-UNMATCHED-01',
        NULL,
        NULL
      ) as result;
    `, [userId, 77.5946, 12.9716]);

    const resObj = submitRes.rows[0].result;
    assert.ok(resObj.report_id, 'Report must be created successfully');
    assert.equal(resObj.road_segment_id, null, 'Unmatched report must NOT be auto-snapped to any segment');
    assert.equal(resObj.snap_distance_m, null, 'Snap distance must be null');

    // Verify reports table
    const repRow = await client.query(`
      SELECT road_segment_id FROM reports WHERE id = $1;
    `, [resObj.report_id]);
    assert.equal(repRow.rows[0].road_segment_id, null, 'Reports table must store NULL road_segment_id');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

test('8. Idempotent Road Import and Lineage on Changed Geometry', async () => {
  const client = await pool.connect();
  try {
    // 8a: Verify rerun idempotency on existing dataset
    const rerunSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      sourceFilePath: 'scripts/data/bengaluru_roads_osm_sample.json',
      limit: 20,
    });
    assert.equal(rerunSummary.new_inserted, 0, 'Zero new insertions on identical rerun');
    assert.equal(rerunSummary.updated_versions, 0, 'Zero updates on identical rerun');
    assert.equal(rerunSummary.unchanged_skipped, 20, 'All 20 ways should be skipped as unchanged via SHA-256 fingerprint');

    // 8b: Changed geometry preservation test
    await client.query('BEGIN');
    const sampleWayId = 23029710; // Vittal Mallya Road
    const beforeRes = await client.query(`
      SELECT id, geom, osm_version FROM road_segments WHERE osm_way_id = $1 AND is_active = TRUE LIMIT 1;
    `, [sampleWayId]);

    if (beforeRes.rows.length > 0) {
      const oldSegId = beforeRes.rows[0].id;
      // Synthesize an updated OSM version with modified geometry
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

      assert.equal(updateSummary.updated_versions, 1, 'Should record 1 updated version');

      // Verify old segment is deactivated and lineage table links old to new
      const lineageRes = await client.query(`
        SELECT segment_id, parent_segment_id, transition_type, reason
        FROM road_segment_lineage
        WHERE parent_segment_id = $1;
      `, [oldSegId]);
      assert.equal(lineageRes.rows.length, 1, 'Lineage record must link deactivated old segment to new segment');
      assert.equal(lineageRes.rows[0].parent_segment_id, oldSegId);
      assert.equal(lineageRes.rows[0].transition_type, 'geometry_update');

      const oldCheck = await client.query(`
        SELECT is_active FROM road_segments WHERE id = $1;
      `, [oldSegId]);
      assert.equal(oldCheck.rows[0].is_active, false, 'Old segment must be deactivated without deletion');
    }
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

test('9. Spatial Geography Index Plan (idx_road_segments_geog_active)', async () => {
  const planRes = await query(`
    EXPLAIN (FORMAT JSON, ANALYZE)
    SELECT id FROM road_segments
    WHERE is_active = TRUE
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 150);
  `);
  const planJson = planRes.rows[0]['QUERY PLAN'][0];
  const planStr = JSON.stringify(planJson);
  assert.ok(
    planStr.includes('idx_road_segments_geog_active') || planStr.includes('idx_road_segments_geography'),
    'Query plan must utilize the spatial geography index'
  );
  assert.ok(planJson.Plan['Total Cost'] < 500, `Execution cost must be low (< 500), got ${planJson.Plan['Total Cost']}`);
});

test('10. Road Identity & Distinct Unnamed Way Preservation', async () => {
  const unnamedRes = await query(`
    SELECT r.id, r.name, r.source_feature_id, count(rs.id) as seg_count
    FROM roads r
    JOIN road_segments rs ON rs.road_id = r.id
    WHERE r.is_official_corridor = FALSE
      AND r.name LIKE 'Unnamed%'
    GROUP BY r.id, r.name, r.source_feature_id
    LIMIT 20;
  `);

  assert.ok(unnamedRes.rows.length >= 2, 'Must have multiple distinct unnamed roads');
  const ids = new Set(unnamedRes.rows.map(r => r.id));
  assert.equal(ids.size, unnamedRes.rows.length, 'Every unnamed road must have a distinct UUID');

  for (const row of unnamedRes.rows) {
    assert.ok(row.source_feature_id && row.source_feature_id.startsWith('osm:way:'), 'Unnamed road must preserve osm:way source_feature_id');
    assert.equal(Number(row.seg_count), 1, 'Unnamed road must not lump multiple ways into one entity');
  }
});

test('11. Batch Atomic Transaction Safety (Zero Orphaned Deactivations)', async () => {
  const client = await pool.connect();
  try {
    const activeBefore = await client.query(`
      SELECT count(*) FROM road_segments WHERE is_active = TRUE;
    `);

    // Run identical rerun which must touch nothing
    const rerunSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      sourceFilePath: 'scripts/data/bengaluru_roads_osm_sample.json',
      limit: 10,
    });
    assert.equal(rerunSummary.new_inserted, 0);

    const activeAfter = await client.query(`
      SELECT count(*) FROM road_segments WHERE is_active = TRUE;
    `);
    assert.equal(activeBefore.rows[0].count, activeAfter.rows[0].count, 'Active segment count must remain intact');
  } finally {
    client.release();
  }
});

test('12. Advisory Lock Concurrency Protection', async () => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    const lockKey = 'osm_import:Bengaluru Urban';
    const lock1 = await client1.query('SELECT pg_try_advisory_lock(hashtext($1)) as locked;', [lockKey]);
    assert.equal(lock1.rows[0].locked, true, 'First client acquires advisory lock');

    const lock2 = await client2.query('SELECT pg_try_advisory_lock(hashtext($1)) as locked;', [lockKey]);
    assert.equal(lock2.rows[0].locked, false, 'Second client must be rejected with lock = false');

    await client1.query('SELECT pg_advisory_unlock(hashtext($1));', [lockKey]);

    const lock2After = await client2.query('SELECT pg_try_advisory_lock(hashtext($1)) as locked;', [lockKey]);
    assert.equal(lock2After.rows[0].locked, true, 'Second client can acquire lock after release');
    await client2.query('SELECT pg_advisory_unlock(hashtext($1));', [lockKey]);
  } finally {
    client1.release();
    client2.release();
  }
});

test('13. Honest Sector Coverage Verification in Nearest Road API', async () => {
  // 13a: Within Bengaluru Urban and within indexed CBD sector
  const cbdReq = new Request('http://localhost/api/v1/roads/nearest?lon=77.5946&lat=12.9716&radius=150');
  const cbdApi = await (await getNearestRoads(cbdReq)).json();
  assert.equal(cbdApi.in_coverage, true);
  assert.equal(cbdApi.coverage_status, 'indexed_active');
  assert.equal(cbdApi.sector_key, 'bengaluru_cbd');
  assert.ok(cbdApi.candidates.length > 0);

  // 13b: Within Bengaluru Urban but unindexed sector (Yelahanka / North)
  const northReq = new Request('http://localhost/api/v1/roads/nearest?lon=77.5963&lat=13.1007&radius=150');
  const northApi = await (await getNearestRoads(northReq)).json();
  assert.equal(northApi.in_coverage, false);
  assert.equal(northApi.coverage_status, 'unindexed_sector');
  assert.equal(northApi.coverage_area, 'Bengaluru Urban');
  assert.equal(northApi.fallback_available, true);
  assert.ok(northApi.message.includes('sector has not yet been indexed'));

  // 13c: Outside Bengaluru Urban entirely
  const outsideReq = new Request('http://localhost/api/v1/roads/nearest?lon=77.2090&lat=28.6139&radius=150');
  const outsideApi = await (await getNearestRoads(outsideReq)).json();
  assert.equal(outsideApi.in_coverage, false);
  assert.equal(outsideApi.coverage_status, 'outside_pilot_coverage');
});

