import './test-bootstrap.mjs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { pool } from '../src/db/client.ts';
import { processAndQuarantinePhoto } from '../src/lib/media.ts';
import { getStorageObject } from '../src/lib/storage.ts';

async function verifyCitizenReportFlow() {
  console.log('\n======================================================================');
  console.log(' VERIFYING CITIZEN FIELD REPORT & PHOTO INGESTION FLOW (R2 + POSTGIS)');
  console.log('======================================================================\n');

  const client = await pool.connect();
  await client.query('BEGIN');

  try {
    const fixturePoint=(await client.query(`SELECT id,ST_X(ST_LineInterpolatePoint(geom,0.5)) AS lon,ST_Y(ST_LineInterpolatePoint(geom,0.5)) AS lat FROM road_segments WHERE is_active ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(fixturePoint,'Seeded test road required');
    const testLon=Number(fixturePoint.lon),testLat=Number(fixturePoint.lat);
    const reporterA = '99990000-0000-4000-8000-000000000002';
    const reporterB = '99990000-0000-4000-8000-000000000003';
    const reporterC = '99990000-0000-4000-8000-000000000004';
    const reporterD = '99990000-0000-4000-8000-000000000005';

    // Ensure test users exist
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role, is_anonymous_public)
      VALUES 
        ($1, 'Citizen Reporter A', 'reporter.a@civic.test', 'citizen', TRUE),
        ($2, 'Citizen Reporter B', 'reporter.b@civic.test', 'citizen', TRUE),
        ($3, 'Citizen Reporter C', 'reporter.c@civic.test', 'citizen', TRUE),
        ($4, 'Citizen Reporter D', 'reporter.d@civic.test', 'citizen', TRUE)
      ON CONFLICT (id) DO NOTHING;
    `, [reporterA, reporterB, reporterC, reporterD]);

    // 1. Submit Citizen Report A on Outer Ring Road
    console.log('[Step 1] Submitting Ground Observation from Citizen A...');
    const idempotencyKeyA = `idemp-${Date.now()}`;
    const reportResA = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        ${testLon}::double precision,
        ${testLat}::double precision,
        'pothole'::text,
        'damaged'::text,
        'Deep waterlogged pothole on outer carriage lane near Ecospace'::text,
        NOW()::timestamptz,
        $2::text,
        NULL::uuid,
        '${fixturePoint.id}'::uuid
      ) as result;
    `, [reporterA, idempotencyKeyA]);

    const resultA = reportResA.rows[0].result;
    console.log('  Submission A Result:', resultA);
    assert.ok(resultA.report_id, 'Report ID must be created');
    assert.ok(resultA.incident_id, 'Incident ID must be created');
    assert.ok(resultA.road_segment_id, 'Must snap to nearest road segment via PostGIS');
    assert.ok(resultA.snap_distance_m >= 0, 'Snap distance must be non-negative');
    console.log(`  ✓ Report created (ID: ${resultA.report_id}) snapped to segment within ${resultA.snap_distance_m.toFixed(1)}m`);

    // 2. Photo Attachment Pipeline (EXIF stripping, Cloudflare R2 archival, and WebP normalization)
    console.log('\n[Step 2] Processing & Archiving Photographic Evidence to Storage...');
    const testImageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 180, g: 60, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();

    const mediaResult = await processAndQuarantinePhoto(testImageBuffer, resultA.report_id);
    console.log('  Media Result:', {
      mime_type: mediaResult.mime_type,
      original_bytes: mediaResult.original_bytes,
      derivative_bytes: mediaResult.derivative_bytes,
      width: mediaResult.width,
      height: mediaResult.height,
      quarantine_key: mediaResult.quarantine_key,
      derivative_key: mediaResult.derivative_key,
    });

    assert.equal(mediaResult.mime_type, 'image/webp');
    assert.ok(mediaResult.derivative_bytes < mediaResult.original_bytes, 'WebP derivative must be smaller than original');
    assert.ok(mediaResult.width <= 1600 && mediaResult.height <= 1600, 'Dimensions must be bounded within 1600px');

    // Verify presence in storage
    const derivativeFromStorage = await getStorageObject(mediaResult.derivative_key);
    assert.ok(derivativeFromStorage, 'Normalized derivative must exist in storage');

    // Register media in database
    await client.query(`
      INSERT INTO report_media (
        report_id, storage_key_quarantine, storage_key_derivative, mime_type, file_size_bytes, sha256,
        width, height, review_status, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', NOW());
    `, [
      resultA.report_id,
      mediaResult.quarantine_key,
      mediaResult.derivative_key,
      mediaResult.mime_type,
      mediaResult.derivative_bytes,
      mediaResult.sha256,
      mediaResult.width,
      mediaResult.height,
    ]);
    console.log(`  ✓ Photographic evidence normalized to WebP & recorded in report_media ledger`);

    // 3. Corroboration & Clustering Invariant (Citizen B reports 15m away)
    console.log('\n[Step 3] Submitting Corroborating Observation from Citizen B (15m away)...');
    const reportResB = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        ${testLon+0.00005}::double precision,
        ${testLat+0.00005}::double precision,
        'pothole'::text,
        'unsafe_workzone'::text,
        'Corroborating: Two wheeler skid observed here this morning'::text,
        NOW()::timestamptz,
        $2::text,
        $3::uuid,
        '${fixturePoint.id}'::uuid
      ) as result;
    `, [reporterB, `idemp-b-${Date.now()}`, resultA.incident_id]);

    const resultB = reportResB.rows[0].result;
    console.log('  Submission B Result:', resultB);
    assert.equal(resultB.incident_id, resultA.incident_id, 'Must cluster into existing incident within 30m');

    // Check reports attached to incident
    const reportsCountRes = await client.query(`
      SELECT COUNT(*) as count
      FROM reports
      WHERE incident_id = $1;
    `, [resultA.incident_id]);
    const reportCount = parseInt(reportsCountRes.rows[0].count, 10);
    assert.equal(reportCount, 2, 'Incident reports count must be 2');
    console.log(`  ✓ Clustered into incident ${resultA.incident_id}: attached reports = ${reportCount}`);

    // Test explicit multi-actor corroboration & anti-inflation invariants
    console.log('\n[Step 3b] Testing Multi-Actor Corroboration & Anti-Inflation Invariants...');
    
    // Negative Control: Reporter B (already an author) cannot self-corroborate
    let selfCorrobBlocked = false;
    await client.query('SAVEPOINT self_corrob_control');
    try {
      await client.query(`
        SELECT corroborate_incident_atomic(
          $1::uuid,
          $2::uuid,
          NOW()::timestamptz,
          'confirms_problem'::text,
          'Attempted self-corroboration'::text
        ) as result;
      `, [reporterB, resultA.incident_id]);
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT self_corrob_control');
      selfCorrobBlocked = err.message.includes('Anti-inflation invariant');
    }
    assert.ok(selfCorrobBlocked, 'Database must block author from self-corroborating');
    console.log('  ✓ Negative control passed: Anti-inflation prevented reporter self-inflation');

    // Positive Control: Independent Citizen C corroborates (1st confirmation)
    const corrobResC = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        NOW()::timestamptz,
        'confirms_problem'::text,
        'Citizen C confirms pothole unpatched'::text
      ) as result;
    `, [reporterC, resultA.incident_id]);
    assert.equal(corrobResC.rows[0].result.total_confirmations, 1);
    assert.equal(corrobResC.rows[0].result.verification_state, 'unverified');
    console.log('  ✓ 1st Confirmation (Citizen C): Incident remains unverified (threshold = 2 required)');

    // Positive Control: Independent Citizen D corroborates (2nd confirmation - hits threshold!)
    const corrobResD = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        NOW()::timestamptz,
        'confirms_problem'::text,
        'Citizen D confirms dangerous depth of crater'::text
      ) as result;
    `, [reporterD, resultA.incident_id]);
    assert.equal(corrobResD.rows[0].result.total_confirmations, 2);
    assert.equal(corrobResD.rows[0].result.verification_state, 'corroborated');
    console.log(`  ✓ 2nd Confirmation (Citizen D): Multi-actor threshold reached! Promoted to '${corrobResD.rows[0].result.verification_state}'`);

    const incidentCheck = await client.query(`
      SELECT id, verification_state, category
      FROM incidents
      WHERE id = $1;
    `, [resultA.incident_id]);
    assert.equal(incidentCheck.rows[0].verification_state, 'corroborated');

    // 4. Idempotency Check (Submitting identical key returns existing result)
    console.log('\n[Step 4] Verifying Replay Idempotency...');
    const replayRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        ${testLon}::double precision,
        ${testLat}::double precision,
        'pothole'::text,
        'damaged'::text,
        'Identical duplicate submission'::text,
        NOW()::timestamptz,
        $2::text,
        NULL::uuid,
        '${fixturePoint.id}'::uuid
      ) as result;
    `, [reporterA, idempotencyKeyA]);

    const replayResult = replayRes.rows[0].result;
    assert.equal(replayResult.report_id, resultA.report_id, 'Must return existing report ID');
    assert.equal(replayResult.is_idempotent_replay, true, 'is_idempotent_replay must be true');
    console.log('  ✓ Idempotency verified: Duplicate submission replayed cleanly without creating extra records.');

    console.log('\n======================================================================');
    console.log(' ALL VERIFICATION CHECKS PASSED: CITIZEN REPORT FLOW IS HEALTHY!');
    console.log('======================================================================\n');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
}

verifyCitizenReportFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('CITIZEN FLOW VERIFICATION FAILED:', err);
    process.exit(1);
  });
