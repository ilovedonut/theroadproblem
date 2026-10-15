import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('Worker queries use Hyperdrive and never reuse clients across requests', () => {
 const run = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import pg from 'pg';
  const instances = [];
  pg.Pool = class {
   constructor(options) { this.options = options; instances.push(this); }
   async query() { assert.equal(this.options.maxUses, 1); return { rows: [{ ok: 1 }] }; }
   async connect() {
    const statements = [];
    this.statements = statements;
    return { query: async sql => statements.push(sql), release: () => { this.released = true; } };
   }
  };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true });
  const context = { env: { HYPERDRIVE: { connectionString: 'postgres://binding-only/first' } } };
  globalThis[Symbol.for('__cloudflare-context__')] = context;
  const { query, withTransaction } = await import('./src/db/client.ts');
  await query('SELECT 1');
  context.env.HYPERDRIVE.connectionString = 'postgres://binding-only/second';
  await query('SELECT 1');
  assert.equal(instances.length, 2);
  assert.equal(instances[0].options.connectionString, 'postgres://binding-only/first');
  assert.equal(instances[1].options.connectionString, 'postgres://binding-only/second');
  await withTransaction(async client => { await client.query('SELECT 1'); });
  assert.deepEqual(instances[2].statements, ['BEGIN', 'SELECT 1', 'COMMIT']);
  assert.equal(instances[2].released, true);
  delete context.env.HYPERDRIVE;
  await assert.rejects(query('SELECT 1'), /HYPERDRIVE binding is required/);
 `], { env: process.env, encoding: 'utf8' });
 assert.equal(run.status, 0, run.stderr);
});

test('Node pools reserve ingestion capacity and handle idle connection errors', () => {
 const run=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`
  import assert from 'node:assert/strict';
  const {pool}=await import('./src/db/client.ts');
  assert.equal(pool.options.max,4);
  assert.equal(pool.options.idleTimeoutMillis,5000);
  pool.emit('error',Object.assign(new Error('Simulated idle connection reset'),{code:'ECONNRESET'}));
  await pool.end();
 `],{env:{...process.env,DATABASE_URL:'postgres://postgres:postgres@127.0.0.1/theroadproblem_ingestion_test'},encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
});

test('database imports need no credentials, but actual database use does', () => {
 const cwd = mkdtempSync(path.join(tmpdir(), 'trp-db-import-'));
 const clientUrl = pathToFileURL(path.resolve('src/db/client.ts')).href;
 const env = { ...process.env };
 delete env.DATABASE_URL;
 delete env.TEST_DATABASE_URL;
 try {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
   import assert from 'node:assert/strict';
   const { pool, query, withTransaction } = await import(${JSON.stringify(clientUrl)});
   await pool.end();
   await new Promise(resolve => pool.end(resolve));
   await assert.rejects(query('SELECT 1'), /DATABASE_URL is required/);
   assert.throws(() => pool.connect(), /DATABASE_URL is required/);
   await assert.rejects(withTransaction(async () => {}), /DATABASE_URL is required/);
  `], { cwd, env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
 } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test('test bootstrap rejects production targets and allows a dedicated local test database',()=>{
 for(const url of ['postgres://postgres:secret@live.supabase.co/postgres','postgres://postgres:secret@localhost/theroadproblem','postgres://postgres:secret@live.supabase.co/theroadproblem_ingestion_test']) {
  const run=spawnSync(process.execPath,['--input-type=module','-e',`await import('./scripts/test-bootstrap.mjs')`],{env:{...process.env,TEST_DATABASE_URL:url},encoding:'utf8'});
  assert.notEqual(run.status,0);
 }
 const control=spawnSync(process.execPath,['--input-type=module','-e',`await import('./scripts/test-bootstrap.mjs');console.log('safe')`],{env:{...process.env,TEST_DATABASE_URL:'postgres://postgres:postgres@127.0.0.1/theroadproblem_ingestion_test'},encoding:'utf8'});
 assert.equal(control.status,0);assert.match(control.stdout,/safe/);
});
