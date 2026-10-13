import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('127.0.0.1') && !process.env.DATABASE_URL.includes('localhost')) {
    return process.env.DATABASE_URL;
  }
  // Try to see if WSL IP is needed
  try {
    const wslIp = execSync('wsl -d Ubuntu -- hostname -I', { encoding: 'utf8' }).trim().split(/\s+/)[0];
    if (wslIp) {
      return `postgres://postgres:postgres@${wslIp}:5432/theroadproblem`;
    }
  } catch {
    // fallback
  }
  return process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/theroadproblem';
}

const connectionStringRaw = resolveDatabaseUrl();
const isRemoteSsl = connectionStringRaw.includes('supabase') || connectionStringRaw.includes('sslmode=require');

let sslConfig = undefined;
let connectionString = connectionStringRaw;

if (isRemoteSsl) {
  connectionString = connectionStringRaw.replace(/[\?&]sslmode=[^&]+/, '');
  const certPath = path.resolve('certs/supabase-ca.pem');
  let caCert = undefined;
  if (fs.existsSync(certPath)) {
    caCert = fs.readFileSync(certPath, 'utf8');
  }
  sslConfig = {
    ca: caCert,
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined,
  };
}

const pool = new Pool({
  connectionString,
  ssl: sslConfig
});

async function runMigrations() {
  const isReset = process.argv.includes('--reset');
  console.log(`[migrate] Connecting to ${connectionString.replace(/:[^:]+@/, ':****@')} (reset=${isReset})`);

  const client = await pool.connect();
  try {
    if (isReset) {
      console.log('[migrate] Resetting public schema...');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      await client.query('CREATE EXTENSION IF NOT EXISTS "postgis";');
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
      await client.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm";');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows: appliedRows } = await client.query('SELECT filename FROM schema_migrations;');
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    const migrationsDir = path.resolve('scripts/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] Already applied: ${file}`);
        continue;
      }

      console.log(`[migrate] Applying: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [file]);
        await client.query('COMMIT');
        console.log(`[migrate] Applied successfully: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] Failed applying ${file}:`, err);
        throw err;
      }
    }

    console.log('[migrate] All migrations applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] Migration runner failed:', err);
  process.exit(1);
});
