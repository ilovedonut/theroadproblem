import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const { Pool } = pg;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('127.0.0.1') && !process.env.DATABASE_URL.includes('localhost')) {
    return process.env.DATABASE_URL;
  }
  try {
    const wslIp = execSync('wsl -d Ubuntu -- hostname -I', { encoding: 'utf8' }).trim().split(/\s+/)[0];
    if (wslIp) {
      return `postgres://postgres:postgres@${wslIp}:5432/theroadproblem`;
    }
  } catch {}
  return process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/theroadproblem';
}

const pool = new Pool({ connectionString: resolveDatabaseUrl() });

test('Stage 05 Corroboration Invariants: R05 Anti-self-inflation and multi-actor threshold promotion', async (t) => {
  const client = await pool.connect();
  const reporterId = 'a1230000-1111-4111-8111-000000000001';
  const verifier1Id = 'b1230000-2222-4222-8222-000000000002';
  const verifier2Id = 'c1230000-3333-4333-8333-000000000003';

  try {
    // 1. Seed distinct users
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES 
        ($1, 'Reporter Alpha', 'alpha@corrob.org', 'citizen'),
        ($2, 'Verifier Beta', 'beta@corrob.org', 'citizen'),
        ($3, 'Verifier Gamma', 'gamma@corrob.org', 'citizen')
      ON CONFLICT (id) DO NOTHING;
    `, [reporterId, verifier1Id, verifier2Id]);

    // 2. Submit initial incident
    const subRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid, 77.65, 12.95, 'pothole', 'damaged', 'Dangerous pothole at junction', NOW(), 'corrob-base-01'
      ) as res;
    `, [reporterId]);
    const incidentId = subRes.rows[0].res.incident_id;

    // Check initial state is 'unverified'
    const incCheck1 = await client.query('SELECT verification_state FROM incidents WHERE id = $1;', [incidentId]);
    assert.equal(incCheck1.rows[0].verification_state, 'unverified');

    // 3. Invariant 1: Original reporter CANNOT self-corroborate
    let selfCorrobFailed = false;
    try {
      await client.query(`
        SELECT corroborate_incident_atomic(
          $1::uuid, $2::uuid, NOW(), 'confirms_problem', 'I also confirm my own report'
        );
      `, [reporterId, incidentId]);
    } catch (err) {
      selfCorrobFailed = true;
      assert.match(err.message, /Original reporter cannot corroborate their own incident/);
    }
    assert.ok(selfCorrobFailed, 'Self-corroboration must be rejected by anti-inflation invariant');

    // 4. Invariant 2: Verifier Beta corroborates once (valid)
    const corrob1 = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid, $2::uuid, NOW(), 'confirms_problem', 'Confirmed present on 13 Oct'
      ) as res;
    `, [verifier1Id, incidentId]);
    assert.equal(corrob1.rows[0].res.total_confirmations, 1);
    // Still 'unverified' because 1 confirmation < 2 threshold
    assert.equal(corrob1.rows[0].res.verification_state, 'unverified');

    // 5. Invariant 3: Verifier Beta cannot corroborate a second time (duplicate rejection)
    let duplicateCorrobFailed = false;
    try {
      await client.query(`
        SELECT corroborate_incident_atomic(
          $1::uuid, $2::uuid, NOW(), 'confirms_problem', 'Trying to vote again'
        );
      `, [verifier1Id, incidentId]);
    } catch (err) {
      duplicateCorrobFailed = true;
      assert.match(err.message, /Actor .* has already corroborated incident/);
    }
    assert.ok(duplicateCorrobFailed, 'Repeated corroboration by same actor must be rejected');

    // 6. Invariant 4: Verifier Gamma (second independent actor) corroborates
    // Now total_confirmations = 2 >= 2 threshold -> promoted to 'corroborated'!
    const corrob2 = await client.query(`
      SELECT corroborate_incident_atomic(
        $1::uuid, $2::uuid, NOW(), 'confirms_problem', 'Second confirmation from field'
      ) as res;
    `, [verifier2Id, incidentId]);
    assert.equal(corrob2.rows[0].res.total_confirmations, 2);
    assert.equal(corrob2.rows[0].res.verification_state, 'corroborated');

    // Verify incidents table updated directly
    const incCheck2 = await client.query('SELECT verification_state FROM incidents WHERE id = $1;', [incidentId]);
    assert.equal(incCheck2.rows[0].verification_state, 'corroborated');

    // Save evidence
    const evidence = {
      gate: "R05",
      status: "PASS",
      environment: "Local Real PostgreSQL 18 + PostGIS 3.6",
      verified_at: new Date().toISOString(),
      assertions_passed: [
        "Anti-self-corroboration invariant strictly rejected original reporter",
        "Single independent corroborator left incident unverified (below threshold)",
        "Duplicate corroboration attempt by same user rejected with constraint error",
        "Second independent qualifying actor promoted incident to corroborated",
        "Corroboration count reflects distinct actors, not repeated submissions"
      ]
    };
    fs.writeFileSync('docs/evidence/stage-05/r05-corroboration.json', JSON.stringify(evidence, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
});
