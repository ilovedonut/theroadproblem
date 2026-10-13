import pg from 'pg';
import { execSync } from 'node:child_process';

const { Pool } = pg;

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('127.0.0.1') && !process.env.DATABASE_URL.includes('localhost')) {
    return process.env.DATABASE_URL;
  }
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

const connectionString = resolveDatabaseUrl();

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  authContext?: { sub?: string; role?: string }
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (authContext?.sub) {
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authContext.sub]);
    }
    if (authContext?.role) {
      await client.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [authContext.role]);
    }

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
