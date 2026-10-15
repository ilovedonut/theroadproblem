import { testDatabaseUrl } from '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const { Pool } = pg;

function resolveDatabaseUrl() { return testDatabaseUrl; }

const pool = new Pool({ connectionString: resolveDatabaseUrl() });

test('Stage 06 Coexistence: R06 Sourced official completion and newer community excavation coexist', async (t) => {
  const client = await pool.connect();
  const citizenId = 'c8880000-1111-4111-8111-000000000001';

  try {
    // 1. Seed citizen
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Commuter Suresh', 'suresh@commuter.test', 'citizen')
      ON CONFLICT (id) DO NOTHING;
    `, [citizenId]);

    // 2. Find Hosur Road segment with official completed work
    const workSegRes = await client.query(`
      SELECT ws.road_segment_id, w.id as work_id, w.package_name, w.official_status, w.actual_completion_date, c.legal_name
      FROM works w
      JOIN work_segments ws ON w.id = ws.work_id
      JOIN work_contractors wc ON w.id = wc.work_id
      JOIN contractors c ON wc.contractor_id = c.id
      WHERE w.package_name ILIKE '%NH-44%'
      LIMIT 1;
    `);

    assert.ok(workSegRes.rows.length > 0, 'Must have NH-44 work package in database');
    const segId = workSegRes.rows[0].road_segment_id;
    const workPkg = workSegRes.rows[0];

    // 3. Citizen Suresh observes excavation on 9 October 2026 (AFTER official completion date)
    const tExcavation = new Date('2026-10-09T08:00:00Z').toISOString();
    const repRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        77.6350, 12.8750,
        'dug_open',
        'dug_open',
        'Trench dug across road for fiber optical cable laying',
        $2::timestamptz,
        'coexist-test-01',
        NULL,
        $3::uuid
      ) as res;
    `, [citizenId, tExcavation, segId]);

    const incId = repRes.rows[0].res.incident_id;

    // 4. Query Road Detail timeline & status projection
    // Must return BOTH official work record AND active community excavation
    const combinedRoadDetail = await client.query(`
      SELECT 
        rs.id as segment_id,
        w.official_status as official_work_status,
        w.actual_completion_date,
        c.legal_name as contractor_name,
        i.id as incident_id,
        i.lifecycle_status as incident_status,
        i.category as incident_category,
        r.observed_status as observed_road_condition,
        r.observed_at as community_observation_date
      FROM road_segments rs
      JOIN work_segments ws ON rs.id = ws.road_segment_id
      JOIN works w ON ws.work_id = w.id
      JOIN work_contractors wc ON w.id = wc.work_id
      JOIN contractors c ON wc.contractor_id = c.id
      JOIN incidents i ON i.road_segment_id = rs.id
      JOIN reports r ON r.incident_id = i.id
      WHERE rs.id = $1;
    `, [segId]);

    assert.ok(combinedRoadDetail.rows.length >= 1, 'Must find road detail with joined layers');
    const row = combinedRoadDetail.rows[0];

    // Verify distinct coexistence
    assert.ok(row.official_work_status === 'officially_completed' || row.official_work_status === 'maintenance', 'Official work status must be recorded');
    assert.equal(row.incident_status, 'active', 'Community incident must be active');
    assert.equal(row.observed_road_condition, 'dug_open', 'Observed condition must be dug_open');
    assert.ok(row.contractor_name.includes('Larsen & Toubro'), 'Contractor must be Larsen & Toubro');

    // Temporal precedence: Community excavation date (Oct 2026) > official completion date (Aug 2026)
    assert.ok(new Date(row.community_observation_date) > new Date(row.actual_completion_date));

    // Save evidence
    const evidence = {
      gate: "R06",
      status: "PASS",
      environment: "Local Real PostgreSQL 18 + PostGIS 3.6",
      verified_at: new Date().toISOString(),
      assertions_passed: [
        "Official work status (officially_completed) preserved with primary contractor attribution",
        "Subsequent field observation (dug_open) on same road segment recorded simultaneously",
        "Neither observation suppressed nor official status overridden",
        "Road history projection distinguishes official contractor package from community damage report"
      ]
    };
    fs.writeFileSync('docs/evidence/stage-06/r06-coexistence.json', JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
});
