# Gates: road coverage and ingestion repair

OWNS: src/db/client.ts, src/lib/ingestor/runner.ts, src/lib/ingestor/connection.ts, tests/test-database-safety.test.mjs, tests/bengaluru-road-index.test.mjs, wrangler.toml, scripts/verify-deployed-roads.mjs, src/app/page.tsx, src/app/api/v1/map/deck/route.ts, src/lib/map-deck-loader.ts, src/lib/matcher.ts, src/lib/ingest.ts, src/lib/ingestor/tender-ingestor.ts, src/lib/ingestor/adapters/pmgsy-adapter.ts, scripts/import-osm-roads.mjs, scripts/audit-road-coverage.mjs, tests/road-gap-repair.test.mjs, tests/road-gap-repair-db.test.mjs, src/lib/ingestor/types.ts, scripts/verify-indexed-ingestion.mjs, scripts/verify-ingestion-flow.mjs, docs/bengaluru-road-index-runbook.md, scripts/data/bengaluru_osm_manifest.json, docs/road-gap-repair/**, .github/workflows/ci.yml, .github/workflows/scheduled-ingest.yml

Scope: eliminate silent viewport truncation, reject unsupported ingestion attribution, and reconcile/resume the real Bengaluru extract safely.

- [x] G1: Pagination drains all viewport pages, rejects stalled cursors and surfaces failures; matching rejects contradictory coordinates and normalizes ranges.
  CHECK: node --experimental-strip-types --test tests/road-gap-repair.test.mjs
  EXPECT: fail 0
  EVIDENCE: automatic-evidence=v1; definition-sha256=3c8436e15ba5eee3b22a4b01b09fc07ea828b01a70ea6d78bfb1daf246d5ea1c; exit=0; EXPECT=matched; output-sha256=139bbf4c61f83c064017f4235bdd01d537e3acd611900f4b90334db231a9d86b; output-bytes=1311; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G2: Application type checking and production build succeed.
  CHECK: npm run build
  EXPECT: Collecting build traces
  EVIDENCE: automatic-evidence=v1; definition-sha256=a2aa266e2be35f38ee4857ebdf9578966b05bd93c9aeed2f254cb7234464f057; exit=0; EXPECT=matched; output-sha256=5ac2885f1fac3f279668c65a09a896bd6c5c8d5d87b2ce872647fedbadd075ff; output-bytes=3288; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=c78b6e2bb64e/40 entries

- [x] G3: Real source way IDs are reconciled against production, and import recovery is verified or remaining limitations documented.
  EVIDENCE: Import 1f93078c-7a85-4121-916e-ff456868f6c6 completed at checkpoint 217680. Independent enforced read-only audit at 2026-10-15T18:12:18.771Z found 217680 expected/present source way IDs, zero missing and zero extra active OSM IDs, with 217685 active physical segments in Bengaluru Urban. Source and boundary hashes agree. Deployed health and two pagination pages returned 200 with zero page overlap; coverage-audit.json, production-import.json and deployed-check.json contain the results.

- [x] G4: Isolated database tests and a browser inspection verify the repaired paths without synthetic production writes.
  EVIDENCE: Actual API retrieved every one of 605 fixture roads; database review/unit/manual-link checks and 10 existing index tests passed. Six copied-geometry cases and official persistence regression passed and rolled back. Isolated tender/citizen flows passed. Final desktop and mobile screenshots show loaded neighbourhood geometry; output/playwright/road-gap-repair-desktop.png and road-gap-repair-mobile.png. No synthetic production writes.

- [x] G5: Session exhaustion is addressed by verified connection budgets, and a fresh real-source scheduled workflow passes on the published repair.
  EVIDENCE: Production Hyperdrive resource 1ba95380b51740bab244bff09a028b15 was read back with origin_connection_limit=5, caching disabled and verify-full TLS. Published repair 66a4681 passed CI 38782034781 and real-source workflow 38782099337: two fetches of 22 records, zero errors/duplicates, original archive checksum verified, reports unchanged at five. Final application hardening d3d77e6 also passed CI 38782747686 and Cloudflare build. Artifact saved in live-run/live-verification.json.
