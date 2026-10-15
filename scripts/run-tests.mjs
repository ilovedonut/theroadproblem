import './test-bootstrap.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=process.argv.slice(2);
const targets=files.length?files:fs.readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>`tests/${f}`);
for(const target of targets) {
  const child=spawnSync(process.execPath,['--experimental-strip-types','--import','./scripts/test-bootstrap.mjs','--test',target],{stdio:'inherit',env:process.env});
  if(child.status!==0)process.exit(child.status??1);
}
process.exit(0);
