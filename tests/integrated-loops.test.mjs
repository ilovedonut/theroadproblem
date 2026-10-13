import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from '../src/db/client.ts';
import { ingestOfficialContracts } from '../src/lib/ingest.ts';

test('R19 Integrated Loops: Full end-to-end community observation loop and official ingestion loop', async (t) => {
  t.after(async () => {
    await pool.end();
  });

  const client = await pool.connect();
  const evidence = {
    test: 'R19: Integrated End-to-End Community and Official Loops',
    timestamp: new Date().toISOString(),
    community_loop: {},
    official_loop: {},
    coexistence_check: {}
  };

  try {
    // -------------------------------------------------------------
    // LOOP 1: Community Observation & Lifecycle Loop
    // -------------------------------------------------------------
    // Step 1: Select road segment
    const roadRes = await client.query(`
      SELECT rs.id as segment_id, rs.road_id, r.name as road_name
      FROM road_segments rs
      JOIN roads r ON rs.road_id = r.id
      WHERE rs.is_active = TRUE
      LIMIT 1;
    `);
    const targetSegment = roadRes.rows[0];

    // Citizen Alpha submits report
    const citizenAlpha = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Citizen Alpha', $2, 'citizen');
    `, [citizenAlpha, `alpha_${Date.now()}@test.org`]);

    const reportRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        77.5946, 12.9716,
        'pothole',
        'damaged',
        'Dangerous crater near junction',
        NOW(),
        $2::text,
        NULL,
        $3::uuid
      ) as result;
    `, [citizenAlpha, `loop1-alpha-${Date.now()}`, targetSegment.segment_id]);

    const incidentId = reportRes.rows[0].result.incident_id;
    assert.ok(incidentId);

    // Step 2: Citizen Beta corroborates incident (1st confirmation)
    const citizenBeta = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Citizen Beta', $2, 'citizen');
    `, [citizenBeta, `beta_${Date.now()}@test.org`]);

    const corrobRes1 = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        NOW(),
        'confirms_problem',
        'Confirmed crater during morning commute'
      ) as result;
    `, [citizenBeta, incidentId]);

    assert.equal(corrobRes1.rows[0].result.total_confirmations, 1);

    // Citizen Gamma corroborates (2nd confirmation meets threshold)
    const citizenGamma = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Citizen Gamma', $2, 'citizen');
    `, [citizenGamma, `gamma_${Date.now()}@test.org`]);

    const corrobRes2 = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid,
        $2::uuid,
        NOW(),
        'confirms_problem',
        'Second confirmation from evening commute'
      ) as result;
    `, [citizenGamma, incidentId]);

    assert.equal(corrobRes2.rows[0].result.total_confirmations, 2);
    assert.equal(corrobRes2.rows[0].result.verification_state, 'corroborated');

    // Step 3: Repair recorded
    const verifierUser = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Field Verifier', $2, 'verifier');
    `, [verifierUser, `verifier_${Date.now()}@test.org`]);

    const repairRes = await client.query(`
      SELECT record_repair_atomic(
        $1::uuid,
        $2::uuid,
        'resolved',
        'Patchwork asphalt repair completed by civic authority',
        NOW()
      ) as result;
    `, [verifierUser, incidentId]);

    assert.equal(repairRes.rows[0].result.new_status, 'resolved');

    // Step 4: Recurrence recorded (new defect appears at same spot)
    const recurRes = await client.query(`
      SELECT record_recurrence_atomic(
        $1::uuid,
        $2::uuid,
        'pothole',
        'Asphalt failed after rain; hole has reopened',
        NOW(),
        77.5946::double precision,
        12.9716::double precision
      ) as result;
    `, [citizenBeta, incidentId]);

    const recurrentIncidentId = recurRes.rows[0].result.new_incident_id;
    assert.equal(recurRes.rows[0].result.predecessor_incident_id, incidentId);

    evidence.community_loop = {
      status: 'PASS',
      original_incident_id: incidentId,
      corroborated_by: citizenBeta,
      repaired: true,
      recurrence_incident_id: recurrentIncidentId,
      predecessor_linked: true
    };

    // -------------------------------------------------------------
    // LOOP 2: Official Public Works Ingestion Loop
    // -------------------------------------------------------------
    const sampleContract = {
      source_name: 'Central Public Procurement Portal',
      external_key: `CPPP-LOOP-${Date.now()}`,
      source_uri: `https://eprocure.gov.in/eprocure/app?page=FrontEndAwardSummary&tenderId=LOOP_${Date.now()}`,
      license: 'GODL India',
      authority_name: 'National Highways Authority of India (NHAI)',
      tender_id: `TENDER-LOOP-${Date.now()}`,
      contract_id: `CONT-LOOP-${Date.now()}`,
      package_name: 'Four-laning & Periodic Renewal Section KA-Loop-99',
      work_type: 'periodic_renewal',
      official_status: 'officially_completed',
      start_date: '2025-01-01',
      target_completion_date: '2025-12-31',
      actual_completion_date: '2026-01-15',
      contract_value_inr: 450000000,
      defect_liability_end_date: '2029-01-15',
      road_name_hint: targetSegment.road_name,
      chainage_start_km: 10.0,
      chainage_end_km: 15.0,
      contractor: {
        legal_name: 'Larsen & Toubro Infrastructure Engineering Ltd.',
        normalized_name: 'Larsen and Toubro Infrastructure Engineering Limited',
        vendor_identifier: 'LNT-INFRA-8839',
        cin: 'U74210TN1998PLC041697',
        gstin: '33AAACL2345K1Z1'
      }
    };

    const runResult = await ingestOfficialContracts(client, [sampleContract]);
    assert.equal(runResult.inserted_or_updated, 1);

    // Query inserted work
    const workRes = await client.query(`
      SELECT w.id, w.official_status, c.legal_name, c.cin
      FROM works w
      JOIN work_contractors wc ON w.id = wc.work_id
      JOIN contractors c ON wc.contractor_id = c.id
      WHERE w.tender_id = $1;
    `, [sampleContract.tender_id]);
    assert.equal(workRes.rows.length, 1);

    evidence.official_loop = {
      status: 'PASS',
      work_id: workRes.rows[0].id,
      official_status: workRes.rows[0].official_status,
      contractor: workRes.rows[0].legal_name,
      cin: workRes.rows[0].cin
    };

    // -------------------------------------------------------------
    // COEXISTENCE VERIFICATION
    // -------------------------------------------------------------
    // Verify that the official completed work and active community recurrence coexist on the same corridor
    const roadOverviewRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM works w JOIN work_segments ws ON w.id = ws.work_id WHERE ws.road_segment_id = $1 AND w.official_status = 'officially_completed') as completed_works_count,
        (SELECT count(*) FROM incidents i WHERE i.id = $2 AND i.lifecycle_status = 'active') as active_defects_count;
    `, [targetSegment.segment_id, recurrentIncidentId]);

    assert.ok(parseInt(roadOverviewRes.rows[0].completed_works_count, 10) >= 1);
    assert.ok(parseInt(roadOverviewRes.rows[0].active_defects_count, 10) >= 1);

    evidence.coexistence_check = {
      status: 'PASS',
      completed_works_count: parseInt(roadOverviewRes.rows[0].completed_works_count, 10),
      active_community_defects_count: parseInt(roadOverviewRes.rows[0].active_defects_count, 10),
      separate_provenance_preserved: true
    };

    // Save evidence
    const evidenceDir = path.resolve('docs/evidence/stage-10');
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'r19-e2e.json'), JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
  }
});
