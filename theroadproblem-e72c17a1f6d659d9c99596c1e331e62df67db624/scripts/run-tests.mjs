import './test-bootstrap.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files=process.argv.slice(2);
const targets=files.length?files:fs.readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).map(f=>`tests/${f}`);
const child=spawnSync(process.execPath,['--experimental-strip-types','--import','./scripts/test-bootstrap.mjs','--test',...targets],{stdio:'inherit',env:process.env});
process.exit(child.status??1);
