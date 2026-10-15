# Gates: real-source ingestion repair

OWNS: src/lib/ingestor/**, src/db/client.ts, src/lib/testing/**, scripts/verify-*.mjs, scripts/run-tests.mjs, scripts/test-bootstrap.mjs, tests/**, .github/workflows/**, package.json, package-lock.json, docs/ingestion-repair/**

Scope: Replace scheduled demo ingestion with a real official source, isolate synthetic tests, prove provenance and repeat safety, then restore the schedule.

- [x] G1: Real-source parsing and failure behavior pass deterministic tests
  CHECK: node --experimental-strip-types --test tests/real-ingestion.test.mjs
  EXPECT: fail 0
  CWD: .
  EVIDENCE: automatic-evidence=v1; definition-sha256=1b6ecdf2dfea3dbf0cda44bfee21bb99fbb5062778cd33272cf1a32e0cb0fd3c; exit=0; EXPECT=matched; output-sha256=0e34688391dc8ff73a4e4f5c775beb74f3c355b72e9dd66c6acc9188084c3b9a; output-bytes=513; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G2: Synthetic verification flows execute only in a separate test database
  CHECK: npm run verify:isolated
  EXPECT: ISOLATED_VERIFICATION_PASSED
  CWD: .
  EVIDENCE: automatic-evidence=v1; definition-sha256=d8fd41ca7f1b4927c15884e1cc5a33a890a84e693a3f3f895dbfdc5d9ab2c7e7; exit=0; EXPECT=matched; output-sha256=180d447294d25b1c6b97e0312629a66fd521e77656138a211870e8e95c27cf10; output-bytes=4118; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G3: Live government fetch archives original bytes, imports records and reruns without duplicate facts
  EVIDENCE: GitHub run 38699838483 succeeded; evidence/live-verification.json shows 22 real works, 22 immutable sources, unchanged second-run counts, matching private archive SHA-256, and unchanged citizen report count (5). Independent production ledger query confirmed two completed runs with zero failures.

- [x] G4: Changed-source versions preserve previous evidence in the isolated database
  CHECK: npm run test:real-ingestion:db
  EXPECT: REAL_INGESTION_DATABASE_PASSED
  CWD: .
  EVIDENCE: automatic-evidence=v1; definition-sha256=7c60279284f6961a6b3422b8bc23b11823a74bb5ef9df7d1d60eb0b459a4314e; exit=0; EXPECT=matched; output-sha256=ceabbbbe6494ee8021a69cb6e7b369c6b6beff38bbebd91b8ff01d55db2afd5c; output-bytes=156; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G5: The repaired scheduled workflow is deployed and enabled only after G1-G4 pass
  EVIDENCE: Production proof run 38699838483 and CI run 38699818047 succeeded before schedule restoration. GitHub API verified state=active and cron='0 0,12 * * *' after browser commit restoring the schedule.

- [x] G6: Public derivatives have a configured URL while quarantine remains private
  EVIDENCE: Cloudflare derivative bucket public URL is enabled; R2_PUBLIC_URL saved in GitHub and deployed Worker production variables. Quarantine settings show no custom domain and public development URL disabled. Browser inspections performed 2026-10-15.
