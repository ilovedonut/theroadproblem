# Gates: ingestion against indexed roads

OWNS: docs/indexed-ingestion-test/**, scripts/verify-indexed-ingestion*.mjs

Scope: Test the live official ingestion and road-matching behavior without placing synthetic records in production.

- [x] G1: Source parsing and database-target safeguards pass.
  CHECK: node --experimental-strip-types --test tests/real-ingestion.test.mjs tests/test-database-safety.test.mjs
  EXPECT: fail 0
  CWD: ../..
  EVIDENCE: automatic-evidence=v1; definition-sha256=836b30422a91aa7beb72abde2c85a826adc6746ca9fe1dd33e67a46eaaf89f45; exit=0; EXPECT=matched; output-sha256=d923eba43318d760398eca1e3f0888917d2abc248ef48eb465a8a5c94f1bbf1c; output-bytes=785; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G2: Isolated ingestion preserves payloads and history, and matching scenarios complete with individual pass/fail results on copied indexed geometry.
  CHECK: node --experimental-strip-types scripts/verify-indexed-ingestion.mjs
  EXPECT: INDEXED_INGESTION_TESTS_COMPLETED
  CWD: ../..
  EVIDENCE: automatic-evidence=v1; definition-sha256=19ef2cfe05177d939b317597395692d9b0c469867ed0c78ebffd0d6d06e0c897; exit=0; EXPECT=matched; output-sha256=4b95f32f6ff0bc105edf05bffef9829570c03a9fe59d22216494d8aeb2ef99f9; output-bytes=425; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G3: A fresh official production run archives its source, reruns without duplicate facts, and preserves citizen reports and indexed road associations.
  EVIDENCE: Workflow 38757263999 succeeded in both jobs. Downloaded live-run/live-verification.json shows 22 unchanged records on both fetches, equal source/work/event counts, and verified archive SHA-256. Independent production-before.json and production-after.json have identical protected counts: 57,814 roads, 64,729 active segments, 5 reports, 22 PPPAC works/versions/reviews, zero PPPAC road links and orphan associations.

- [x] G4: Explain whether current real records actually link to roads and disclose any reproducible matching failures.
  EVIDENCE: README.md distinguishes the successful live review-first adapter from the unsafe coordinate matcher. isolated-matching-results.json records three failing safety cases among six scenarios, each incorrectly approved at score 95 with ten candidates. The 22 live approvals remain unlinked; the test completion marker is explicitly not a matcher-safety certificate.
