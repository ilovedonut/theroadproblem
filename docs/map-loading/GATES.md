# Gates: reliable viewport loading

OWNS: src/app/api/v1/map/**, src/app/page.tsx, src/components/GeospatialMap.tsx, src/components/AreaOverview.tsx, scripts/migrations/009_map_viewport_lookups.sql, supabase/migrations/20261016073148_map_authority_lookup.sql, tests/road-gap-repair-db.test.mjs, scripts/verify-map-loading.mjs, docs/map-loading/**

Scope: repair connection starvation caused by expensive city-view map queries while preserving complete road pagination.

- [x] G1: Pagination and area-summary correctness pass against the isolated database.
  CHECK: node --experimental-strip-types --test tests/road-gap-repair-db.test.mjs
  EXPECT: fail 0
  CWD: ../..
  EVIDENCE: automatic-evidence=v1; definition-sha256=7f20567c6df5007cbb830c7a35e1630a6479b57136832b89651210586751cd23; exit=0; EXPECT=matched; output-sha256=e35a7b109e390eaf5f7c2b4eac1cdc90a971706958a5eb5dd60f9452ba716b1b; output-bytes=434; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=990094cb57c9/40 entries
- [x] G2: The production build passes.
  CHECK: npm run build
  EXPECT: Generating static pages
  CWD: ../..
  EVIDENCE: automatic-evidence=v1; definition-sha256=d813e15a0f156714ca07a24e96ccbede7f3949d554a5c0f517f628347f886c46; exit=0; EXPECT=matched; output-sha256=2f2bcf8a3d857cd30f985b4bd419d75712fd71c072d78a79e4ab4559bf70fddc; output-bytes=3288; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\shiva\Desktop\the road problem; path=990094cb57c9/40 entries
- [ ] G3: The deployed close-up and city-view API and browser finish loading without connection errors.
  EVIDENCE: pending; compare read-only query timings and observe the deployed map.
