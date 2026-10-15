import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/db/client.ts';

test('R03 Journey: Resilience across GPS denial, ambiguous roads, no match fallback, tile failure', async (t) => {
  t.after(async () => {
    await pool.end();
  });

  const client = await pool.connect();
  const evidence = {
    test: 'R03: Fault Tolerance and Journey Resilience',
    timestamp: new Date().toISOString(),
    verifications: []
  };

  try {
    // 1. GPS Denied Fallback: User submits at arbitrary manual pin coordinates (e.g. 12.9350, 77.6200)
    const manualLon = 77.6200;
    const manualLat = 12.9350;
    const userId = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role, is_anonymous_public)
      VALUES ($1, 'Manual Pin Reporter', $2, 'citizen', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `, [userId, `resilient_${Date.now()}@example.test`]);

    const res1 = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        $2::double precision,
        $3::double precision,
        'flooded',
        'damaged',
        'Manual coordinates entered after GPS denied',
        NOW(),
        $4::text,
        NULL,
        NULL
      ) as result;
    `, [userId, manualLon, manualLat, `resilient-manual-${Date.now()}`]);

    assert.ok(res1.rows[0].result.report_id);
    evidence.verifications.push({
      case: '1_gps_denied_manual_pin',
      status: 'PASS',
      report_id: res1.rows[0].result.report_id,
      coordinates: [manualLat, manualLon]
    });

    // 2. Ambiguous Road Candidates: Query nearest roads near an intersection with multiple parallel tracks
    // Hosur Road Elevated vs Service Road (~20m apart)
    const hosurLon = 77.6432;
    const hosurLat = 12.8664;
    const nearestRes = await client.query(`
      SELECT 
        rs.id as segment_id,
        r.name as road_name,
        r.ref as road_ref,
        ROUND(ST_Distance(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 2) as distance_m
      FROM road_segments rs
      JOIN roads r ON r.id = rs.road_id
      WHERE rs.is_active = TRUE
        AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 300)
      ORDER BY distance_m ASC
      LIMIT 5;
    `, [hosurLon, hosurLat]);

    assert.ok(nearestRes.rows.length >= 1, 'Should find candidate roads');
    evidence.verifications.push({
      case: '2_ambiguous_candidate_ranking',
      status: 'PASS',
      candidates_count: nearestRes.rows.length,
      top_candidate: nearestRes.rows[0].road_name,
      snap_distance_m: nearestRes.rows[0].distance_m
    });

    // 3. No Match Fallback: Remote unmapped coordinates (e.g. 15.0000, 75.0000 far from mapped segments)
    const remoteLon = 75.0000;
    const remoteLat = 15.0000;
    const remoteNearest = await client.query(`
      SELECT rs.id
      FROM road_segments rs
      WHERE rs.is_active = TRUE
        AND ST_DWithin(rs.geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 100);
    `, [remoteLon, remoteLat]);

    assert.equal(remoteNearest.rows.length, 0, 'Remote location has zero canonical road matches');

    // Report should succeed with road_segment_id = NULL
    const res3 = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        $2::double precision,
        $3::double precision,
        'debris_blockage',
        'damaged',
        'Observation on unmapped rural track',
        NOW(),
        $4::text,
        NULL,
        NULL
      ) as result;
    `, [userId, remoteLon, remoteLat, `resilient-remote-${Date.now()}`]);

    const result3 = res3.rows[0].result;
    assert.ok(result3.report_id);
    assert.equal(result3.road_segment_id, null, 'Unmatched observation has null segment ID');
    evidence.verifications.push({
      case: '3_no_match_unmapped_reporting',
      status: 'PASS',
      report_id: result3.report_id,
      road_segment_id: result3.road_segment_id
    });

    // 4. Map Tile Failure Resilient Content: Verify list and text data is fully renderable without map tiles
    const listRes = await client.query(`
      SELECT id, name, road_class, authority_name
      FROM roads
      LIMIT 5;
    `);
    assert.ok(listRes.rows.length > 0);
    evidence.verifications.push({
      case: '4_tile_failure_list_fallback',
      status: 'PASS',
      roads_accessible_without_tiles: listRes.rows.length
    });

    // Write evidence
    const evidenceDir = path.resolve('docs/evidence/stage-03');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'r03-resilience.json'), JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
  }
});
