import { testDatabaseUrl } from '../scripts/test-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { execSync } from 'node:child_process';

const { Pool } = pg;

function resolveDatabaseUrl() { return testDatabaseUrl; }

const pool = new Pool({ connectionString: resolveDatabaseUrl(), max: 25 });

test('Stage 01 Concurrency: 20 overlapping identical submissions across parallel connections', async (t) => {
  const userId = 'd4444444-dddd-4ddd-8ddd-444444444444';
  const idempotencyKey = 'concurrent-key-test-20-requests';
  const observedAt = new Date().toISOString();

  // Setup user
  const setupClient = await pool.connect();
  try {
    await setupClient.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Concurrent Submitter', 'concurrent@test.org', 'citizen')
      ON CONFLICT (id) DO NOTHING;
    `, [userId]);
  } finally {
    setupClient.release();
  }

  // Fire 20 parallel submission requests
  const promises = Array.from({ length: 20 }, async (_, index) => {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT submit_report_atomic(
          $1::uuid,
          77.5946, 12.9716,
          'pothole',
          'damaged',
          'Concurrent road hazard',
          $2::timestamptz,
          $3,
          NULL,
          NULL
        ) as result;
      `, [userId, observedAt, idempotencyKey]);
      return res.rows[0].result;
    } finally {
      client.release();
    }
  });

  const results = await Promise.all(promises);
  assert.equal(results.length, 20);

  // Collect unique report IDs and incident IDs
  const reportIds = new Set(results.map((r) => r.report_id));
  const incidentIds = new Set(results.map((r) => r.incident_id));

  // Exactly one logical report and incident must exist across all 20 concurrent connections
  assert.equal(reportIds.size, 1, 'All 20 concurrent requests must resolve to the exact same report_id');
  assert.equal(incidentIds.size, 1, 'All 20 concurrent requests must resolve to the exact same incident_id');

  const idempotentReplays = results.filter((r) => r.is_idempotent_replay === true);
  // At least 19 must be idempotent replays
  assert.ok(idempotentReplays.length >= 19, `Expected >= 19 idempotent replays, got ${idempotentReplays.length}`);

  // Verify database state directly
  const verifyClient = await pool.connect();
  try {
    const dbReports = await verifyClient.query(`
      SELECT count(*) as count FROM reports WHERE idempotency_key = $1;
    `, [idempotencyKey]);
    assert.equal(dbReports.rows[0].count, '1', 'Exactly 1 row must exist in reports table');

    const singleReportId = [...reportIds][0];
    const dbEvents = await verifyClient.query(`
      SELECT count(*) as count FROM events 
      WHERE (new_state->>'report_id')::text = $1;
    `, [singleReportId]);
    assert.equal(dbEvents.rows[0].count, '1', 'Exactly 1 audit event must exist for this report');
  } finally {
    verifyClient.release();
  }
});

test('Stage 01 Concurrency: Competing concurrent merges prevent deadlocks and cycles', async (t) => {
  const modId = 'e5555555-eeee-4eee-8eee-555555555555';
  const setupClient = await pool.connect();
  let incidentA, incidentB;

  try {
    await setupClient.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES ($1, 'Mod Eve', 'eve@moderator.gov', 'moderator')
      ON CONFLICT (id) DO UPDATE SET role = 'moderator';
    `, [modId]);

    const resA = await setupClient.query(`
      INSERT INTO incidents (category, lifecycle_status, first_observed_at, last_observed_at, centroid)
      VALUES ('pothole', 'active', NOW(), NOW(), ST_SetSRID(ST_MakePoint(77.61, 12.91), 4326))
      RETURNING id;
    `);
    incidentA = resA.rows[0].id;

    const resB = await setupClient.query(`
      INSERT INTO incidents (category, lifecycle_status, first_observed_at, last_observed_at, centroid)
      VALUES ('pothole', 'active', NOW(), NOW(), ST_SetSRID(ST_MakePoint(77.62, 12.92), 4326))
      RETURNING id;
    `);
    incidentB = resB.rows[0].id;
  } finally {
    setupClient.release();
  }

  // Two competing simultaneous merges: A -> B and B -> A
  const p1 = (async () => {
    const c = await pool.connect();
    try {
      return await c.query('SELECT merge_incidents_atomic($1::uuid, $2::uuid, $3::uuid, $4) as res;', [
        modId, incidentA, incidentB, 'Merge A into B'
      ]);
    } catch (err) {
      return { error: err.message };
    } finally {
      c.release();
    }
  })();

  const p2 = (async () => {
    const c = await pool.connect();
    try {
      return await c.query('SELECT merge_incidents_atomic($1::uuid, $2::uuid, $3::uuid, $4) as res;', [
        modId, incidentB, incidentA, 'Merge B into A'
      ]);
    } catch (err) {
      return { error: err.message };
    } finally {
      c.release();
    }
  })();

  const [res1, res2] = await Promise.all([p1, p2]);

  // One of them must succeed, and the second one must either error out (e.g. cycle or locked state) without deadlock
  const successCount = [res1, res2].filter((r) => r.rows && r.rows.length > 0).length;
  const failureCount = [res1, res2].filter((r) => r.error).length;

  assert.equal(successCount, 1, 'Exactly one competing merge must succeed');
  assert.equal(failureCount, 1, 'The opposite merge must fail to prevent cycles');
});

test.after(async () => {
  await pool.end();
});
