import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
