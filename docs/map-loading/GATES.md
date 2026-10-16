# Gates: reliable viewport loading

OWNS: src/app/api/v1/map/**, src/app/page.tsx, src/components/GeospatialMap.tsx, tests/road-gap-repair-db.test.mjs, scripts/verify-map-loading.mjs, docs/map-loading/**

Scope: repair connection starvation caused by expensive city-view map queries while preserving complete road pagination.

- [x] G1: Pagination and area-summary correctness pass against the isolated database.
  CHECK: node --experimental-strip-types --test tests/road-gap-repair-db.test.mjs
  EXPECT: fail 0
  EVIDENCE: Isolated road-gap and road-index checks passed (30 tests together); final production build passed.
- [x] G2: The production build passes.
  CHECK: npm run build
  EXPECT: Generating static pages
  EVIDENCE: Isolated road-gap and road-index checks passed (30 tests together); final production build passed.
- [ ] G3: The deployed close-up and city-view API and browser finish loading without connection errors.
  EVIDENCE: pending; compare read-only query timings and observe the deployed map.
