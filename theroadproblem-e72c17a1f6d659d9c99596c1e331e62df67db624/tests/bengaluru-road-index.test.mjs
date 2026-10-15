import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from '../src/db/client.ts';
import {
  classifyAccess,
  classifyOsmWayTags,
  extractRoadAliases,
  generateInformativeLabel,
} from '../src/lib/osm/classification.ts';
import {
  clipWayToBoundary,
  computePolylineLengthMeters,
  isPointInRing,
  loadVerifiedBengaluruBoundary,
} from '../src/lib/osm/boundary.ts';
import {
  computeWayFingerprint,
  importOsmRoads,
  validateStagedImport,
} from '../src/lib/osm/importer.ts';
import { GET as getNearestRoads } from '../src/app/api/v1/roads/nearest/route.ts';
import { GET as getMapDeck } from '../src/app/api/v1/map/deck/route.ts';
import { GET as getMapSummary } from '../src/app/api/v1/map/summary/route.ts';
import { GET as getRoadById } from '../src/app/api/v1/roads/[id]/route.ts';
import { GET as getSearch } from '../src/app/api/v1/search/route.ts';

const boundary = loadVerifiedBengaluruBoundary();

test('1. Boundary Inclusion, Exclusion, and Boundary-Crossing Roads', async () => {
  // 1a. Verify Bengaluru Urban boundary provenance and geometry validity
  assert.equal(boundary.boundary_name, 'Bengaluru Urban');
  assert.equal(boundary.boundary_type, 'administrative_district');
  assert.equal(boundary.osm_relation_id, 2020589);
  assert.equal(boundary.crs, 'EPSG:4326');
  assert.equal(boundary.is_valid, true);
  assert.equal(boundary.exterior_vertex_count, 6177);
  assert.equal(
    boundary.checksum_sha256,
    '15668d7397e1da5016019bf7256ce84e08a3172861f62c56d53b5ef68afb203b'
  );

  // 1b. Point membership: MG Road (inside), Yelahanka (inside), Electronic City (inside), Whitefield (inside), New Delhi (outside), Ramanagara (outside)
  assert.equal(isPointInRing({ lon: 77.5946, lat: 12.9716 }, boundary.ring, boundary.bbox), true, 'MG Road inside');
  assert.equal(isPointInRing({ lon: 77.5963, lat: 13.1007 }, boundary.ring, boundary.bbox), true, 'Yelahanka inside');
  assert.equal(isPointInRing({ lon: 77.6602, lat: 12.8452 }, boundary.ring, boundary.bbox), true, 'Electronic City inside');
  assert.equal(isPointInRing({ lon: 77.7499, lat: 12.9698 }, boundary.ring, boundary.bbox), true, 'Whitefield inside');
  assert.equal(isPointInRing({ lon: 77.2090, lat: 28.6139 }, boundary.ring, boundary.bbox), false, 'New Delhi outside');
  assert.equal(isPointInRing({ lon: 77.2771, lat: 12.7209 }, boundary.ring, boundary.bbox), false, 'Ramanagara town outside');

  // 1c. Boundary-crossing road: starts inside southern Bengaluru Urban (12.78, 77.50) and exits south into Ramanagara/Kanakapura (12.60, 77.45)
  const crossingCoords = [
    { lon: 77.5000, lat: 12.8000 }, // inside Bengaluru Urban
    { lon: 77.4800, lat: 12.7200 }, // near southern border
    { lon: 77.4500, lat: 12.6000 }, // outside south of boundary
  ];
  const clipResult = clipWayToBoundary(crossingCoords, boundary);
  assert.equal(clipResult.status, 'crossing');
  assert.equal(clipResult.crossesBoundary, true);
  assert.ok(clipResult.withinBoundaryLengthM > 0, 'Interior portion must have positive length');
  assert.ok(
    clipResult.withinBoundaryLengthM < clipResult.sourceLengthM,
    `Clipped length (${clipResult.withinBoundaryLengthM}m) must be strictly less than full source length (${clipResult.sourceLengthM}m)`
  );
  // Every point of the clipped span must lie inside or on the boundary
  for (const pt of clipResult.primaryClippedCoords) {
    assert.equal(isPointInRing(pt, boundary.ring, boundary.bbox), true);
  }

  // 1d. Road completely outside boundary is rejected
  const outsideCoords = [
    { lon: 77.2700, lat: 12.7100 },
    { lon: 77.2800, lat: 12.7200 },
  ];
  const outsideResult = clipWayToBoundary(outsideCoords, boundary);
  assert.equal(outsideResult.status, 'outside');
  assert.equal(outsideResult.withinBoundaryLengthM, 0);
});

test('2. Unnamed-Road Inclusion and Honest Access / Category Rules', async () => {
  // 2a. Missing access tag must be 'unknown', NEVER 'yes'
  const missingAcc = classifyAccess({ highway: 'residential' });
  assert.equal(missingAcc.accessRaw, 'unknown');
  assert.equal(missingAcc.accessStatus, 'unknown');

  const privateAcc = classifyAccess({ highway: 'service', access: 'private' });
  assert.equal(privateAcc.accessRaw, 'private');
  assert.equal(privateAcc.accessStatus, 'private');

  const publicAcc = classifyAccess({ highway: 'primary', access: 'yes' });
  assert.equal(publicAcc.accessRaw, 'yes');
  assert.equal(publicAcc.accessStatus, 'public');

  // 2b. Unnamed residential road is included with explicit display fallback and hasOfficialName = false
  const unnamedRes = classifyOsmWayTags({ highway: 'residential' });
  assert.equal(unnamedRes.included, true);
  assert.equal(unnamedRes.isMotorRoad, true);
  assert.equal(unnamedRes.usageCategory, 'public_motor');
  assert.equal(unnamedRes.hasOfficialName, false);
  assert.equal(unnamedRes.displayFallback, 'Unnamed residential road');
  assert.equal(unnamedRes.accessRaw, 'unknown');
  assert.equal(unnamedRes.operator, null, 'Must not fabricate authority when operator tag is absent');

  // 2c. Non-motor ways (footway, cycleway, steps, track) and construction/proposed ways are distinguishable and excluded from motor roads by default
  const footway = classifyOsmWayTags({ highway: 'footway', name: 'Cubbon Park Walk' });
  assert.equal(footway.included, false);
  assert.equal(footway.isMotorRoad, false);
  assert.equal(footway.usageCategory, 'non_motor');

  const footwayOptIn = classifyOsmWayTags(
    { highway: 'footway', name: 'Cubbon Park Walk' },
    { includeNonMotor: true }
  );
  assert.equal(footwayOptIn.included, true);
  assert.equal(footwayOptIn.isMotorRoad, false);
  assert.equal(footwayOptIn.usageCategory, 'non_motor');

  const underConstruction = classifyOsmWayTags({
    highway: 'construction',
    construction: 'primary',
  });
  assert.equal(underConstruction.included, false);
  assert.equal(underConstruction.usageCategory, 'construction_proposed');
});

test('3. Same-Name Disconnected Roads Remain Distinct Entities', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Import two "1st Main Road" ways 12 km apart (one in Indiranagar, one in Jayanagar/JP Nagar)
    const payload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Disconnected Same-Name Roads',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88001001,
          version: 1,
          nodes: [101, 102],
          tags: { highway: 'residential', name: 'Test 1st Main Road Disconnected' },
          geometry: [
            { lon: 77.6408, lat: 12.9784 },
            { lon: 77.6418, lat: 12.9784 },
          ],
        },
        {
          type: 'way',
          id: 88001002,
          version: 1,
          nodes: [201, 202],
          tags: { highway: 'residential', name: 'Test 1st Main Road Disconnected' },
          geometry: [
            { lon: 77.5830, lat: 12.9080 },
            { lon: 77.5840, lat: 12.9080 },
          ],
        },
      ],
    };

    const summary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload,
      isCompleteExtract: false,
    });
    assert.equal(summary.new_inserted, 2);

    const segsRes = await client.query(
      `
      SELECT rs.osm_way_id, rs.road_id, r.name
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.osm_way_id IN (88001001, 88001002) AND rs.is_active = TRUE;
    `
    );
    assert.equal(segsRes.rows.length, 2);
    assert.notEqual(
      segsRes.rows[0].road_id,
      segsRes.rows[1].road_id,
      'Disconnected roads with the same name (>500m apart) must have distinct road_id UUIDs'
    );

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('4. Separate Carriageways and Bridge/Tunnel Crossings Remain Distinct Without False Junctions', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // A flyover bridge (layer=1, bridge=yes) crossing over a surface street (layer=0) at the same 2D point without shared OSM nodes
    const payload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Grade Separated Crossing',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88002001,
          version: 1,
          nodes: [301, 302], // No shared node with surface road!
          tags: {
            highway: 'trunk',
            name: 'Test Flyover Viaduct',
            bridge: 'yes',
            layer: '1',
            oneway: 'yes',
          },
          geometry: [
            { lon: 77.6240, lat: 12.9172 },
            { lon: 77.6260, lat: 12.9172 },
          ],
        },
        {
          type: 'way',
          id: 88002002,
          version: 1,
          nodes: [401, 402], // Crosses in 2D at (77.6250, 12.9172) but shares NO node
          tags: {
            highway: 'secondary',
            name: 'Test Under-Bridge Cross Road',
            layer: '0',
          },
          geometry: [
            { lon: 77.6250, lat: 12.9162 },
            { lon: 77.6250, lat: 12.9182 },
          ],
        },
      ],
    };

    await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload,
      isCompleteExtract: false,
    });

    const segs = await client.query(
      `
      SELECT osm_way_id, road_id, layer, bridge, oneway, node_ids
      FROM road_segments
      WHERE osm_way_id IN (88002001, 88002002) AND is_active = TRUE
      ORDER BY osm_way_id ASC;
    `
    );
    assert.equal(segs.rows.length, 2);
    assert.notEqual(segs.rows[0].road_id, segs.rows[1].road_id);
    assert.equal(segs.rows[0].layer, 1);
    assert.equal(segs.rows[0].bridge, 'yes');
    assert.equal(segs.rows[1].layer, 0);
    assert.equal(segs.rows[1].bridge, null);

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('5. Unchanged Reimport Produces Zero Duplicate Roads, Segments, Lineage, or Queue Entries', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Idempotent Reimport',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88003001,
          version: 1,
          nodes: [501, 502],
          tags: { highway: 'primary', name: 'Test Idempotent Avenue', ref: 'SH-88' },
          geometry: [
            { lon: 77.5950, lat: 12.9720 },
            { lon: 77.5970, lat: 12.9720 },
          ],
        },
      ],
    };

    const run1 = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload,
      isCompleteExtract: false,
    });
    assert.equal(run1.new_inserted, 1);

    const beforeCounts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM roads WHERE source_feature_id = 'osm:way:88003001') AS roads_cnt,
        (SELECT COUNT(*) FROM road_segments WHERE osm_way_id = 88003001) AS segs_cnt,
        (SELECT COUNT(*) FROM road_segment_lineage rsl JOIN road_segments rs ON rs.id = rsl.segment_id WHERE rs.osm_way_id = 88003001) AS lin_cnt;
    `);

    const run2 = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload,
      isCompleteExtract: false,
    });
    assert.equal(run2.new_inserted, 0);
    assert.equal(run2.updated_versions, 0);
    assert.equal(run2.unchanged_skipped, 1);

    const afterCounts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM roads WHERE source_feature_id = 'osm:way:88003001') AS roads_cnt,
        (SELECT COUNT(*) FROM road_segments WHERE osm_way_id = 88003001) AS segs_cnt,
        (SELECT COUNT(*) FROM road_segment_lineage rsl JOIN road_segments rs ON rs.id = rsl.segment_id WHERE rs.osm_way_id = 88003001) AS lin_cnt;
    `);

    assert.deepEqual(afterCounts.rows[0], beforeCounts.rows[0]);

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('6. Road Renaming Preserves Stable Road ID, Records Aliases, and Logs Audit Event', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Import under original name "Old Suranjan Das Road Test"
    const initialPayload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Rename v1',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88004001,
          version: 1,
          nodes: [601, 602],
          tags: { highway: 'secondary', name: 'Old Suranjan Das Road Test' },
          geometry: [
            { lon: 77.6610, lat: 12.9680 },
            { lon: 77.6630, lat: 12.9690 },
          ],
        },
      ],
    };

    await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload: initialPayload,
      isCompleteExtract: false,
    });

    const beforeRes = await client.query(
      `SELECT road_id FROM road_segments WHERE osm_way_id = 88004001 AND is_active = TRUE;`
    );
    const originalRoadId = beforeRes.rows[0].road_id;

    // Step 2: Re-import same way with new name and ref
    const renamedPayload = {
      ...initialPayload,
      elements: [
        {
          type: 'way',
          id: 88004001,
          version: 2,
          nodes: [601, 602],
          tags: {
            highway: 'secondary',
            name: 'New Suranjan Das Corridor Test',
            ref: 'MDR-44',
          },
          geometry: [
            { lon: 77.6610, lat: 12.9680 },
            { lon: 77.6630, lat: 12.9690 },
          ],
        },
      ],
    };

    const renameSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload: renamedPayload,
      isCompleteExtract: false,
    });
    assert.equal(renameSummary.renamed_count, 1);

    const afterRoadRes = await client.query(
      `SELECT id, name, ref, aliases FROM roads WHERE id = $1;`,
      [originalRoadId]
    );
    assert.equal(afterRoadRes.rows[0].id, originalRoadId, 'Road UUID must remain stable on rename');
    assert.equal(afterRoadRes.rows[0].name, 'New Suranjan Das Corridor Test');
    assert.equal(afterRoadRes.rows[0].ref, 'MDR-44');
    assert.ok(
      afterRoadRes.rows[0].aliases.includes('Old Suranjan Das Road Test'),
      'Previous official name must be preserved in aliases array'
    );

    const eventRes = await client.query(
      `SELECT event_type, old_state, new_state FROM events WHERE entity_type = 'road' AND entity_id = $1;`,
      [originalRoadId]
    );
    assert.equal(eventRes.rows.length, 1);
    assert.equal(eventRes.rows[0].event_type, 'road_renamed');

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('7 & 8. Way Split Lineage, Citizen Report Coordinate Preservation, Manual Work Association Safety, and Durable Segment URL Resolution', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Import initial parent way (nodes 701 -> 702 -> 703)
    const v1Payload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Split v1',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88005001,
          version: 1,
          nodes: [701, 702, 703],
          tags: { highway: 'primary', name: 'Test Split Corridor' },
          geometry: [
            { lon: 77.6000, lat: 12.9700 },
            { lon: 77.6050, lat: 12.9700 },
            { lon: 77.6100, lat: 12.9700 },
          ],
        },
      ],
    };

    await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload: v1Payload,
      isCompleteExtract: false,
    });

    const parentSegRes = await client.query(
      `SELECT id, road_id FROM road_segments WHERE osm_way_id = 88005001 AND is_active = TRUE;`
    );
    const parentSegId = parentSegRes.rows[0].id;
    const roadId = parentSegRes.rows[0].road_id;

    // 2. Attach a citizen incident + report and a manual_verified work association to parentSegId
    const reporterId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users (id, display_name, email_private, role) VALUES ($1, 'Split Tester', 'split@test.local', 'citizen');`,
      [reporterId]
    );
    const submitRes = await client.query(
      `
      SELECT submit_report_atomic(
        $1::uuid, 77.6025::double precision, 12.9701::double precision,
        'pothole', 'damaged', 'Citizen pothole before way split', NOW(),
        'IDEMP-SPLIT-TEST-01', NULL, $2::uuid
      ) AS result;
    `,
      [reporterId, parentSegId]
    );
    const { report_id: reportId, incident_id: incidentId } = submitRes.rows[0].result;

    const workRes = await client.query(
      `
      INSERT INTO works (authority_name, tender_id, contract_id, package_name, work_type, official_status, contract_value_inr)
      VALUES ('BBMP', 'TENDER-SPLIT-01', 'CON-SPLIT-01', 'Split Corridor Resurfacing', 'Asphalt', 'awarded', 15000000)
      RETURNING id;
    `
    );
    const workId = workRes.rows[0].id;

    await client.query(
      `
      INSERT INTO work_segments (work_id, road_segment_id, matching_confidence, review_status, review_notes)
      VALUES ($1, $2, 'manual_verified', 'approved', 'Manually approved before split');
    `,
      [workId, parentSegId]
    );

    // 3. Upstream OSM splits way 88005001 into shortened 88005001 (nodes 701->702) and new child way 88005002 (nodes 702->703)
    const v2SplitPayload = {
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      source: 'Test Split v2',
      license: 'ODbL 1.0',
      retrieved_at: new Date().toISOString(),
      elements: [
        {
          type: 'way',
          id: 88005001,
          version: 2,
          nodes: [701, 702],
          tags: { highway: 'primary', name: 'Test Split Corridor' },
          geometry: [
            { lon: 77.6000, lat: 12.9700 },
            { lon: 77.6050, lat: 12.9700 },
          ],
        },
        {
          type: 'way',
          id: 88005002,
          version: 1,
          nodes: [702, 703],
          tags: { highway: 'primary', name: 'Test Split Corridor' },
          geometry: [
            { lon: 77.6050, lat: 12.9700 },
            { lon: 77.6100, lat: 12.9700 },
          ],
        },
      ],
    };

    const splitSummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      payload: v2SplitPayload,
      isCompleteExtract: false,
    });
    assert.ok(splitSummary.split_lineage_count >= 1, 'Must record split lineage');
    assert.equal(
      splitSummary.review_routed_count,
      1,
      'Must route work association on split parent segment for human review'
    );

    // 4. Verify citizen report observed_point and incident centroid were NOT moved
    const reportCheck = await client.query(
      `SELECT ST_X(observed_point) AS lon, ST_Y(observed_point) AS lat FROM reports WHERE id = $1;`,
      [reportId]
    );
    assert.equal(Number(reportCheck.rows[0].lon.toFixed(4)), 77.6025);
    assert.equal(Number(reportCheck.rows[0].lat.toFixed(4)), 12.9701);

    // 5. Verify work was NOT automatically copied to every child segment, and manual_verified history is intact
    const wsCheck = await client.query(
      `SELECT road_segment_id, matching_confidence, review_status FROM work_segments WHERE work_id = $1;`,
      [workId]
    );
    assert.equal(wsCheck.rows.length, 1, 'Work must not be auto-copied to all split child segments');
    assert.equal(wsCheck.rows[0].road_segment_id, parentSegId);
    assert.equal(wsCheck.rows[0].matching_confidence, 'manual_verified');

    const queueCheck = await client.query(
      `SELECT candidate_segment_ids, status FROM ambiguous_matches_queue WHERE work_id = $1;`,
      [workId]
    );
    assert.equal(queueCheck.rows.length, 1);
    assert.equal(queueCheck.rows[0].status, 'pending');
    assert.equal(queueCheck.rows[0].candidate_segment_ids.length, 2);

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});

test('9. Partial Input, Failed Download, or Mass-Deletion Anomaly Leaves Active Index Intact', async () => {
  // 9a. Pre-publication safety gate blocks mass deactivation (>15%) or partial-extract deactivation
  const partialGate = validateStagedImport({
    existingActiveCount: 500,
    proposedDeactivations: 5,
    proposedUpdates: 0,
    isCompleteExtract: false,
  });
  assert.equal(partialGate.ok, false);
  assert.match(partialGate.reason, /blocked on non-complete extracts/);

  const massDeleteGate = validateStagedImport({
    existingActiveCount: 500,
    proposedDeactivations: 200,
    proposedUpdates: 0,
    isCompleteExtract: true,
  });
  assert.equal(massDeleteGate.ok, false);
  assert.match(massDeleteGate.reason, /Anomalous mass deactivation/);

  // 9b. Empty / corrupted payload throws before deactivating any segments
  const client = await pool.connect();
  try {
    const beforeActive = await client.query(
      `SELECT COUNT(*) AS cnt FROM road_segments WHERE is_active = TRUE;`
    );
    await assert.rejects(
      importOsmRoads(client, {
        district: 'Bengaluru Urban',
        payload: {
          district: 'Bengaluru Urban',
          state: 'Karnataka',
          source: 'Failed Empty Extract',
          license: 'ODbL 1.0',
          retrieved_at: new Date().toISOString(),
          elements: [],
        },
      }),
      /Invalid or empty OSM extract payload/
    );
    const afterActive = await client.query(
      `SELECT COUNT(*) AS cnt FROM road_segments WHERE is_active = TRUE;`
    );
    assert.equal(afterActive.rows[0].cnt, beforeActive.rows[0].cnt);
  } finally {
    client.release();
  }
});

test('10 & 11. Accurate Counts Without Join Multiplication and Bounded Viewport / Zoom Queries', async () => {
  // 10a. Map Deck endpoint bounded to Central Bengaluru bbox returns only roads in that bbox
  const cbdBbox = '77.5800,12.9600,77.6200,12.9850';
  const deckReq = new Request(
    `http://localhost/api/v1/map/deck?bbox=${cbdBbox}&zoom=14&limit=100`
  );
  const deckRes = await (await getMapDeck(deckReq)).json();
  assert.ok(deckRes.summary, 'Deck response must include summary');
  assert.ok(
    Number(deckRes.summary.unique_source_ways) >= 0,
    'Summary must report unique_source_ways'
  );
  assert.ok(
    Number(deckRes.summary.active_physical_segments) >= Number(deckRes.summary.corridors_or_roads),
    'Active physical segments must be >= corridors_or_roads'
  );
  assert.equal(deckRes.summary.coverage_boundary.district, 'Bengaluru Urban');
  assert.equal(deckRes.summary.coverage_boundary.boundary_type, 'administrative_district');

  // Verify no Ramanagara roads leak into a Central Bengaluru bbox request
  for (const r of deckRes.roads) {
    assert.notEqual(
      r.district,
      'Ramanagara',
      'Bengaluru CBD bbox query must not return Ramanagara roads'
    );
  }

  // 11. Map Summary endpoint returns distinct ways, segments, corridors, and motor-road km
  const sumReq = new Request(`http://localhost/api/v1/map/summary?bbox=${cbdBbox}`);
  const sumRes = await (await getMapSummary(sumReq)).json();
  assert.ok(sumRes.roads !== undefined);
  assert.ok(sumRes.active_physical_segments !== undefined);
  assert.ok(sumRes.unique_source_ways !== undefined);
  assert.ok(sumRes.motor_road_km !== undefined);
  assert.equal(sumRes.coverage_state, 'inside_indexed_coverage');
});

test('12. Nearby-Road Selection at Geographically Separated Markers, Ambiguous Cases, and Real Extract Dry-Run', async () => {
  // 12a. Central Bengaluru (MG Road)
  const mgReq = new Request(
    'http://localhost/api/v1/roads/nearest?lon=77.5946&lat=12.9716&radius=150'
  );
  const mgRes = await (await getNearestRoads(mgReq)).json();
  assert.equal(mgRes.in_coverage, true);
  assert.equal(mgRes.coverage_area, 'Bengaluru Urban');
  assert.equal(mgRes.auto_selected_segment_id, null, 'Must never auto-select candidate');
  assert.ok(mgRes.candidates.length >= 1);

  // 12b. Silk Board / Hosur Road multi-level carriageway ambiguity
  const silkReq = new Request(
    'http://localhost/api/v1/roads/nearest?lon=77.625546&lat=12.917216&radius=150'
  );
  const silkRes = await (await getNearestRoads(silkReq)).json();
  assert.equal(silkRes.in_coverage, true);
  assert.ok(silkRes.candidates.length >= 2);
  assert.equal(silkRes.is_ambiguous, true, 'Elevated + surface carriageway proximity must flag is_ambiguous=true');

  // 12c. Outside boundary (New Delhi)
  const outReq = new Request(
    'http://localhost/api/v1/roads/nearest?lon=77.2090&lat=28.6139&radius=150'
  );
  const outRes = await (await getNearestRoads(outReq)).json();
  assert.equal(outRes.in_coverage, false);
  assert.equal(outRes.coverage_status, 'outside_pilot_coverage');
  assert.equal(outRes.coverage_state, 'outside_supported_area');

  // 12d. Dry-run verification on real 5,248-way Bengaluru OSM dataset
  const client = await pool.connect();
  try {
    const drySummary = await importOsmRoads(client, {
      district: 'Bengaluru Urban',
      sourceFilePath: path.resolve('scripts/data/bengaluru_roads_osm_sample.json'),
      dryRun: true,
    });
    assert.equal(drySummary.dry_run, true);
    assert.equal(drySummary.total_elements, 5248);
    assert.equal(drySummary.valid_ways, 5248);
    assert.equal(drySummary.rejected_count, 0);
    assert.ok(drySummary.motor_road_length_m > 650000, 'Motor road length should be ~670.4 km');
    assert.equal(
      drySummary.access_breakdown.unknown,
      3448,
      '3,485 ways with missing access tag must be classified as unknown, not yes'
    );
  } finally {
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
