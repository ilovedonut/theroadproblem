import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

// Ensure .env.local is loaded if process.env.DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // fallback
  }
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error('DATABASE_URL is required; refusing an implicit database target.');
}

const connectionStringRaw = resolveDatabaseUrl();
const isRemoteSsl = connectionStringRaw.includes('supabase') || connectionStringRaw.includes('sslmode=require');

let sslConfig: pg.ConnectionConfig['ssl'] = undefined;
let connectionString = connectionStringRaw;

if (isRemoteSsl) {
  // Strip duplicate sslmode query parameter to avoid libpqcompat conflict in pg driver
  connectionString = connectionStringRaw.replace(/[\?&]sslmode=[^&]+/, '');
  
  // Resolve CA certificate
  let caCert: string | undefined = process.env.DB_CA_CERT;
  if (!caCert) {
    const isPooler = new URL(connectionStringRaw).hostname.endsWith('.pooler.supabase.com');
    const certPath = path.resolve(process.cwd(), isPooler ? 'certs/supabase-pooler-ca.crt' : 'certs/supabase-ca.pem');
    if (fs.existsSync(certPath)) {
      caCert = fs.readFileSync(certPath, 'utf8');
    }
  }

  sslConfig = {
    ca: caCert,
    rejectUnauthorized: true,
  };
}

export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
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
