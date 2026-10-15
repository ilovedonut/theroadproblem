import './test-bootstrap.mjs';
import { spawnSync } from 'node:child_process';
for(const file of ['scripts/verify-ingestion-flow.mjs','scripts/verify-citizen-flow.mjs']) {
  const run=spawnSync(process.execPath,['--experimental-strip-types',file],{stdio:'inherit',env:process.env});
  if(run.status!==0)process.exit(run.status||1);
}
console.log('ISOLATED_VERIFICATION_PASSED');
