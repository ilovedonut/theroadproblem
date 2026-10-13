import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { execSync } from 'node:child_process';

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

test('Stage 01 Foundation: Database connection and PostGIS availability', async (t) => {
  const { rows } = await pool.query('SELECT PostGIS_Version();');
  assert.ok(rows.length > 0);
  assert.match(rows[0].postgis_version, /3\./);
});

test('Stage 01 Foundation: Atomic transaction commit and event projection', async (t) => {
  const client = await pool.connect();
  try {
    // 1. Create a test user
    const userId = '11111111-1111-4111-8111-111111111111';
    await client.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Citizen Alpha', 'alpha@example.test', 'citizen')
      ON CONFLICT (id) DO NOTHING;
    `, [userId]);

    // 2. Submit report atomically
    const idempotencyKey = `idempotency-key-alpha-${Date.now()}`;
    const observedAt = new Date().toISOString();
    const res = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        77.5946, 12.9716, -- Bengaluru coordinates
        'pothole',
        'damaged',
        'Large deep pothole on main carriageway',
        $2::timestamptz,
        $3,
        NULL,
        NULL
      ) as result;
    `, [userId, observedAt, idempotencyKey]);

    const result = res.rows[0].result;
    assert.ok(result.report_id, 'Expected report_id to be returned');
    assert.ok(result.incident_id, 'Expected incident_id to be returned');
    assert.equal(result.is_new_incident, true);
    assert.equal(result.is_idempotent_replay, false);

    // 3. Verify event was projected in append-only events table
    const eventRes = await client.query(`
      SELECT * FROM events 
      WHERE entity_id = $1 AND event_type = 'incident_created';
    `, [result.incident_id]);
    assert.equal(eventRes.rows.length, 1);
    assert.equal(eventRes.rows[0].actor_id, userId);

    // 4. Test idempotency replay
    const replayRes = await client.query(`
      SELECT submit_report_atomic(
        $1::uuid,
        77.5946, 12.9716,
        'pothole',
        'damaged',
        'Large deep pothole on main carriageway',
        $2::timestamptz,
        $3,
        NULL,
        NULL
      ) as result;
    `, [userId, observedAt, idempotencyKey]);

    const replay = replayRes.rows[0].result;
    assert.equal(replay.report_id, result.report_id, 'Replayed report_id must match');
    assert.equal(replay.incident_id, result.incident_id, 'Replayed incident_id must match');
    assert.equal(replay.is_idempotent_replay, true);

  } finally {
    client.release();
  }
});

test('Stage 01 Foundation: Atomic rollback on failure', async (t) => {
  const client = await pool.connect();
  try {
    const invalidUserId = '99999999-9999-4999-8999-999999999999'; // Non-existent user violating FK
    await client.query('BEGIN');
    let threw = false;
    try {
      await client.query(`
        SELECT submit_report_atomic(
          $1::uuid,
          77.5946, 12.9716,
          'pothole',
          'damaged',
          'This submission must fail and rollback',
          NOW(),
          'key-fail-001'
        );
      `, [invalidUserId]);
    } catch (err) {
      threw = true;
      await client.query('ROLLBACK');
    }
    assert.ok(threw, 'Should throw on foreign key violation for non-existent user');

    // Verify nothing leaked
    const checkRes = await client.query(`
      SELECT count(*) as count FROM reports WHERE idempotency_key = 'key-fail-001';
    `);
    assert.equal(checkRes.rows[0].count, '0');
  } finally {
    client.release();
  }
});

test.after(async () => {
  await pool.end();
});
