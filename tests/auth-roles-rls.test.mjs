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

const adminUrl = resolveDatabaseUrl();
const appUserUrl = adminUrl.replace('postgres:postgres@', 'app_user:app_user@');

const adminPool = new Pool({ connectionString: adminUrl });
const appPool = new Pool({ connectionString: appUserUrl });

test('Stage 01 Auth & RLS: Role Matrix and Privacy Verification', async (t) => {
  const adminClient = await adminPool.connect();
  const userAId = 'a1111111-aaaa-4aaa-8aaa-111111111111';
  const userBId = 'b2222222-bbbb-4bbb-8bbb-222222222222';
  const modId   = 'c3333333-cccc-4ccc-8ccc-333333333333';

  let incidentId;
  let publishedReportId;
  let heldReportId;

  try {
    // 1. Seed users with distinct roles using admin client
    await adminClient.query(`
      INSERT INTO users (id, display_name, email_private, role)
      VALUES 
        ($1, 'Citizen A', 'userA@private.mail', 'citizen'),
        ($2, 'Citizen B', 'userB@private.mail', 'citizen'),
        ($3, 'Moderator Carol', 'carol@mod.gov', 'moderator')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    `, [userAId, userBId, modId]);

    // 2. Insert reports: one published, one held
    const incidentRes = await adminClient.query(`
      INSERT INTO incidents (category, lifecycle_status, first_observed_at, last_observed_at, centroid)
      VALUES ('pothole', 'active', NOW(), NOW(), ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326))
      RETURNING id;
    `);
    incidentId = incidentRes.rows[0].id;

    const publishedReportRes = await adminClient.query(`
      INSERT INTO reports (incident_id, reporter_id, observed_point, category, observed_status, description, observed_at, publication_status)
      VALUES ($1, $2, ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326), 'pothole', 'damaged', 'Published report', NOW(), 'published')
      RETURNING id;
    `, [incidentId, userAId]);
    publishedReportId = publishedReportRes.rows[0].id;

    const heldReportRes = await adminClient.query(`
      INSERT INTO reports (incident_id, reporter_id, observed_point, category, observed_status, description, observed_at, publication_status)
      VALUES ($1, $2, ST_SetSRID(ST_MakePoint(77.6, 12.9), 4326), 'pothole', 'damaged', 'Held report under review', NOW(), 'held')
      RETURNING id;
    `, [incidentId, userAId]);
    heldReportId = heldReportRes.rows[0].id;
  } finally {
    adminClient.release();
  }

  // Test Context: Anonymous Client (nonprivileged app_user with no JWT claims)
  await t.test('Positive & Negative controls: Anonymous client', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub', '', true)");
      await client.query("SELECT set_config('request.jwt.claim.role', 'anon', true)");

      // Can read published report
      const pubRows = (await client.query('SELECT * FROM reports WHERE id = $1', [publishedReportId])).rows;
      assert.equal(pubRows.length, 1, 'Anonymous must see published report');

      // Cannot read held report
      const heldRows = (await client.query('SELECT * FROM reports WHERE id = $1', [heldReportId])).rows;
      assert.equal(heldRows.length, 0, 'Anonymous must NOT see held report');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // Test Context: Reporter A (author of held report)
  await t.test('Positive control: Author can see own held report', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userAId]);
      await client.query("SELECT set_config('request.jwt.claim.role', 'citizen', true)");

      const heldRows = (await client.query('SELECT * FROM reports WHERE id = $1', [heldReportId])).rows;
      assert.equal(heldRows.length, 1, 'Author must be able to view their own held report');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // Test Context: Reporter B (different citizen)
  await t.test('Negative control: Citizen B cannot see Reporter A held report', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userBId]);
      await client.query("SELECT set_config('request.jwt.claim.role', 'citizen', true)");

      const heldRows = (await client.query('SELECT * FROM reports WHERE id = $1', [heldReportId])).rows;
      assert.equal(heldRows.length, 0, 'Citizen B must NOT see Citizen A held report');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // Test Context: Moderator Carol
  await t.test('Positive control: Moderator can see all held reports', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [modId]);
      await client.query("SELECT set_config('request.jwt.claim.role', 'moderator', true)");

      const heldRows = (await client.query('SELECT * FROM reports WHERE id = $1', [heldReportId])).rows;
      assert.equal(heldRows.length, 1, 'Moderator must see held report');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  // Test Context: Privilege Escalation check
  await t.test('Negative control: Citizen cannot modify another user or self-escalate role', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userBId]);
      await client.query("SELECT set_config('request.jwt.claim.role', 'citizen', true)");

      // Try to modify another user's row
      const updateOther = await client.query('UPDATE users SET display_name = $1 WHERE id = $2', ['Hacked Name', userAId]);
      assert.equal(updateOther.rowCount, 0, 'Citizen B cannot modify User A data under RLS');

      // Try to escalate own role to moderator
      let escalateFailed = false;
      await client.query('SAVEPOINT sp_escalate');
      try {
        await client.query("UPDATE users SET role = 'moderator' WHERE id = $1", [userBId]);
      } catch (err) {
        escalateFailed = true;
        await client.query('ROLLBACK TO SAVEPOINT sp_escalate');
      }
      assert.ok(escalateFailed, 'RLS WITH CHECK must reject role escalation');

      // Check role remains citizen
      const checkRole = await client.query('SELECT role FROM users WHERE id = $1', [userBId]);
      assert.equal(checkRole.rows[0].role, 'citizen', 'Citizen B role must remain citizen');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

test.after(async () => {
  await adminPool.end();
  await appPool.end();
});
