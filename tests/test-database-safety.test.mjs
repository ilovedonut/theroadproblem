import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('test bootstrap rejects production targets and allows a dedicated local test database',()=>{
 for(const url of ['postgres://postgres:secret@live.supabase.co/postgres','postgres://postgres:secret@localhost/theroadproblem','postgres://postgres:secret@live.supabase.co/theroadproblem_ingestion_test']) {
  const run=spawnSync(process.execPath,['--input-type=module','-e',`await import('./scripts/test-bootstrap.mjs')`],{env:{...process.env,TEST_DATABASE_URL:url},encoding:'utf8'});
  assert.notEqual(run.status,0);
 }
 const control=spawnSync(process.execPath,['--input-type=module','-e',`await import('./scripts/test-bootstrap.mjs');console.log('safe')`],{env:{...process.env,TEST_DATABASE_URL:'postgres://postgres:postgres@127.0.0.1/theroadproblem_ingestion_test'},encoding:'utf8'});
 assert.equal(control.status,0);assert.match(control.stdout,/safe/);
});
