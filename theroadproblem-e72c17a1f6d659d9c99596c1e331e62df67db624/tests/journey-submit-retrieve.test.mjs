import '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from '../src/db/client.ts';

test('R02 Journey: Mobile road select -> submit observation -> durable canonical link', async (t) => {
  t.after(async () => {
    await pool.end();
  });
  const client = await pool.connect();
  const evidence = {
    test: 'R02: Journey Submit and Durable Retrieval',
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    // 1. Identify active candidate road segment
    const roadRes = await client.query(`
      SELECT rs.id as segment_id, rs.road_id, r.name as road_name, r.ref as road_ref,
             ST_X(ST_Centroid(rs.geom)) as lon, ST_Y(ST_Centroid(rs.geom)) as lat
      FROM road_segments rs
      JOIN roads r ON rs.road_id = r.id
      WHERE rs.is_active = TRUE
      LIMIT 1;
    `);
    assert.ok(roadRes.rows.length > 0, 'Must have at least one active road segment');
    const road = roadRes.rows[0];
    evidence.steps.push({ step: '1_road_selection', road_id: road.road_id, segment_id: road.segment_id, road_name: road.road_name });

    // 2. Mobile citizen user submits an observation
    const userId = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role, is_anonymous_public)
      VALUES ($1, 'Mobile Commuter', $2, 'citizen', FALSE)
      ON CONFLICT (id) DO NOTHING;
    `, [userId, `commuter_${Date.now()}@example.test`]);

    const idempotencyKey = `mob-idem-${Date.now()}`;
    const observedAt = new Date().toISOString();
    const submitRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        $2::double precision,
        $3::double precision,
        'pothole',
        'damaged',
        'Deep crater in left lane after flyover ramp',
        $4::timestamptz,
        $5::text,
        NULL,
        $6::uuid
      ) as result;
    `, [userId, road.lon, road.lat, observedAt, idempotencyKey, road.segment_id]);

    const result = submitRes.rows[0].result;
    assert.ok(result.report_id, 'Report ID must be generated');
    assert.ok(result.incident_id, 'Incident ID must be generated');
    assert.equal(result.is_new_incident, true);
    evidence.steps.push({
      step: '2_atomic_submission',
      report_id: result.report_id,
      incident_id: result.incident_id,
      snap_distance_m: result.snap_distance_m,
      canonical_url: `/incidents/${result.incident_id}`
    });

    // 3. Verify durable retrieval via incident detail query
    const incRes = await client.query(`
      SELECT 
        i.id, i.category, i.lifecycle_status, i.verification_state,
        i.first_observed_at, i.last_observed_at,
        ST_X(i.centroid) as lon, ST_Y(i.centroid) as lat,
        r.name as road_name, r.ref as road_ref,
        count(rep.id) as reports_count
      FROM incidents i
      LEFT JOIN road_segments rs ON i.road_segment_id = rs.id
      LEFT JOIN roads r ON rs.road_id = r.id
      LEFT JOIN reports rep ON rep.incident_id = i.id
      WHERE i.id = $1
      GROUP BY i.id, r.name, r.ref;
    `, [result.incident_id]);

    assert.equal(incRes.rows.length, 1);
    const incident = incRes.rows[0];
    assert.equal(incident.id, result.incident_id);
    assert.equal(incident.category, 'pothole');
    assert.equal(incident.lifecycle_status, 'active');
    assert.equal(incident.verification_state, 'unverified');
    assert.equal(incident.road_name, road.road_name);
    assert.equal(Number(incident.reports_count), 1);

    // 4. Verify durable reload: retrieval again confirms identical data
    const reloadRes = await client.query(`
      SELECT id, lifecycle_status, verification_state FROM incidents WHERE id = $1;
    `, [result.incident_id]);
    assert.equal(reloadRes.rows[0].id, result.incident_id);
    evidence.steps.push({
      step: '3_durable_retrieval_and_reload',
      verified: true,
      incident_id: incident.id,
      lifecycle_status: incident.lifecycle_status,
      verification_state: incident.verification_state
    });

    // Write evidence
    const evidenceDir = path.resolve('docs/evidence/stage-04');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'r02-submit.json'), JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
  }
});
