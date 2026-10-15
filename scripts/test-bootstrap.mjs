import fs from 'node:fs';
import path from 'node:path';

// Never load .env.local here: that file contains the live database credential.
if (!process.env.TEST_DATABASE_URL && fs.existsSync('.env.test.local')) {
  for (const line of fs.readFileSync('.env.test.local','utf8').split(/\r?\n/)) {
    const m=/^TEST_DATABASE_URL=(.+)$/.exec(line.trim());
    if(m)process.env.TEST_DATABASE_URL=m[1].replace(/^['"]|['"]$/g,'');
  }
}
export function assertTestDatabase(value) {
  if(!value)throw new Error('TEST_DATABASE_URL is required; test writes are blocked.');
  const url=new URL(value),db=decodeURIComponent(url.pathname.slice(1));
  if(!/^theroadproblem(?:_[a-z0-9]+)*_test$/.test(db))throw new Error('Tests require a dedicated theroadproblem_*_test database.');
  const local=/^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
  if(!local)throw new Error('Synthetic tests require a local/private test database, never a hosted production database.');
  return value;
}
export const testDatabaseUrl=assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL=testDatabaseUrl;
process.env.NODE_ENV='test';
process.env.LOCAL_PRIVATE_DIR=path.resolve('storage_data_test/private');
process.env.LOCAL_PUBLIC_DIR=path.resolve('storage_data_test/public');
for(const key of ['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_PUBLIC_URL'])delete process.env[key];
