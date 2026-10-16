# Road-loading diagnosis and repair brief

Checked 16 October 2026. Scope: read-only diagnosis of the current workspace and a small number of public endpoint requests. No application code, production data, migrations or deployment configuration was changed. Existing dirty map/city-navigation work was preserved.

## Measured live behaviour

These are single sequential HTTP samples from this machine, not browser rendering metrics, repeated percentiles or a concurrency test. Public requests were performed after the sandbox's default network path failed DNS resolution. Raw response bodies and headers are in `output/perf-diagnosis/`.

| Public request | HTTP | Time to first byte | Total | Download |
|---|---:|---:|---:|---:|
| `/api/v1/map/deck` — fitted city, zoom 10.35, first 2,500 roads | 500 | 34.839 s | 34.841 s | 56 bytes |
| `/api/v1/map/deck` — street close-up, zoom 16.42 | 200 | 8.851 s | 8.869 s | 366,620 bytes |
| `/api/v1/roads/bengaluru/manifest` | 404 | 0.107 s | 0.109 s | 13,786 bytes |
| `/api/v1/regions/bengaluru/manifest` | 404 | 0.091 s | 0.093 s | 13,788 bytes |
| `/api/v1/roads/bengaluru/20261016/14/11723/7596.mvt` | 404 | 0.106 s | 0.107 s | 13,816 bytes |

The city request returned `canceling statement due to statement timeout`. The close-up returned 429 roads and 512 segments, with no further pages. Its response explicitly disables caching. The first byte arrived almost as late as the completed response: server/request waiting dominates this sample; this does not separately measure pool wait, SQL execution, transfer compression or browser parsing/rendering.

Request coordinates:

- City bbox: `77.10973151424355,12.785095942028317,78.10452969152993,13.364246671374257`; zoom `10.35`; limit `2500`; `include_index_stats=false`.
- Street bbox: `77.59515636030892,12.964507635689195,77.60984363969578,12.973060153092952`; zoom `16.42`; `include_index_stats=false`.

Earlier independent measurements in `docs/map-loading/deployed-verification.json` show city road pages taking 15.8–27.6 seconds. `docs/map-loading/browser-verification.json` records roughly 20.4 seconds for the fitted-city road pages and 36.2 seconds through summary completion. Those earlier tests proved completeness/correctness; their PASS flag did not establish an acceptable loading-time budget.

## What is wrong

### 1. The expensive geometry path is still the normal loader

`src/app/page.tsx:156–208` calls `loadMapDeckPages` for each viewport. `src/lib/map-deck-loader.ts` drains every page sequentially, accumulates all road geometries, and publishes the growing array after every page. `page.tsx:175` adds `Date.now()` and the loader requests `cache: no-store`; the endpoint also sends no-store headers. Revisiting an area repeats the work.

`src/app/api/v1/map/deck/route.ts` performs spatial selection, aggregation, geometry simplification and GeoJSON construction during the request. At city scale the materialized eligible-segment set precedes viewport filtering (`82–116`). Work and incident aggregates (`154–194`) are not scoped to the current page. The supplied `city` parameter is not read. Existing spatial and lookup indexes already exist; adding a generic index is not a complete fix.

### 2. The tile migration is unfinished and currently duplicates the old path locally

The workspace adds a MapLibre vector source in `src/components/GeospatialMap.tsx:842–968`, but leaves the full paginated deck fetch and all-road GeoJSON source at `973–1106`. Rendering every returned segment again preserves the old work and adds tile requests. Selection/filter changes and every cumulative page rebuild that GeoJSON.

The new public manifest and sample tile URLs return 404 in the checked deployment. These local improvements are not currently available through their advertised live routes. Do not treat the local source as proof of deployed behaviour.

On disk there is exactly one actual `.mvt` file: `output/tiles/bengaluru/14/11723/7596.mvt`, 98,262 bytes. The disk manifest is confined to a small zoom-14 footprint; its `written_tiles=4` is an accumulated counter, not four distinct files. The static API metadata claims city coverage at zooms 10–16. Actual R2 object coverage has not been verified. The builder writes local files and does not itself implement an R2 publication step. Cloudflare's configured assets directory is `.open-next/assets`, so `output/tiles/` alone does not prove production availability.

### 3. The tile fallback can keep the database bottleneck alive

On a missing local/R2 object, `src/app/api/v1/roads/[id]/[version]/[z]/[x]/[y]/route.ts` computes `ST_AsMVT` from PostGIS on demand. It lacks the builder's motor-road and zoom-based class filters, an explicit per-query statement budget, demonstrated write-through publication and explicit edge-cache storage. Its live mutable fallback still advertises immutable versioned caching. This is a local implementation problem; the checked live route returned 404, so current production fallback traffic was not measured.

Simply changing output encoding from GeoJSON to MVT without fixing precomputation/cache misses is insufficient. Do not cache unpublished/private citizen data into a public immutable road release.

### 4. Browsing triggers avoidable requests and processing

- The viewport effect has no national-overview/unindexed-city guard. National browsing can still start the legacy road drain.
- Selecting a city changes `fetchDeckData` and schedules a request after 250 ms using existing bounds, while the map fits the new city over 1,200 ms. The settled viewport then schedules another request.
- Initial city is parsed after mount; the map's initial closure can publish national bounds before fitting the requested city. A `bbox` deep link may then be overridden by the city-fit effect.
- Client aborts protect stale results, but do not wire database query cancellation to the HTTP signal. Abandoned SQL can continue until its statement budget; the dynamic tile fallback lacks that budget.
- Vector handlers are registered on city/version changes without matching cleanup.
- City manifest fetching depends on `selectedScheme`, although the resource depends on the city.

### 5. Exact area totals extend the visible wait

`AreaOverview` starts only after every deck page completes. It then calls `/api/v1/map/summary`, which calculates geographic lengths/intersections and aggregates the visible network. This is an additional expensive operation per viewport. Useful-road readiness, live evidence freshness and optional exact arbitrary-viewport totals must have separate state.

## Repair to implement

Preserve the current city/jurisdiction work and domain truth rules. Execute these as one coherent repair, not as unrelated cosmetic changes:

1. Establish a real, reproducible versioned road-tile release for the supported Bengaluru Urban footprint and intended zooms. Derive manifests and distinct object counts from published artifacts. Publish to configured object storage; verify tiles/coverage before switching the active manifest. Keep unsupported city coverage explicit.
2. Make the manifest authoritative for tile URLs, version, bounds, supported zooms and availability. The region manifest currently advertises a different tile route than the frontend constructs; unify them. Do not hard-code a current release or silently fall back to Bengaluru for an unindexed city.
3. Use tiles as the sole general road-geometry loader. Stop full `/map/deck` pagination during ordinary map browsing. Retain only bounded live incident/work overlays and a small selected-road geometry overlay.
4. Implement abortable selected-road detail retrieval before removing the deck dependency. `/api/v1/roads/:id` exists, but its response shape differs from `RoadFeature`: adapt `road`, `segments.geom_geojson`, `active_incidents`, `official_works` and timeline explicitly. Tile clicks must still load real metadata, evidence, provenance and valid selection geometry; never fabricate the missing dossier.
5. Use feature state/filter expressions for visual selection where appropriate. Do not rebuild the entire network on selection or unrelated filter changes. Register and clean up listeners correctly.
6. Use one parsed initial URL/camera context and a settled-viewport handshake. Preserve explicit bbox/road deep links, invalidate the old context immediately on a city change, and issue requests only for the settled active context. National overview and unindexed cities must not run expensive road queries.
7. Cache immutable geometry by actual release and tile, with meaningful validators and demonstrated origin avoidance. Keep live evidence on its own bounded freshness/invalidation policy. Remove timestamp cache-busting from versioned geometry. Bound any development fallback and do not claim mutable fallback bytes are an immutable release.
8. Serve named-city/ward totals from real versioned snapshots or precomputed memberships and label their time/scope. Keep exact arbitrary-viewport computation optional/deferred; do not relabel city totals as viewport totals. Verify snapshot/object publication on deployment rather than relying on local disk files.
9. For remaining dynamic endpoints, restrict spatial/page candidates before heavy aggregation, filter page-specific works/incidents to those candidates, enforce actual city scope, use measured query plans and suitable statement/connection budgets. Do not raise concurrency or timeouts as a substitute for reducing work. Preserve visibility/authorization rules.
10. Add phase-specific server timings/cache-origin diagnostics without exposing credentials; verify the actual deployed revision and routes, not only local tests.

## Required verification

- Cold and repeated warm browser/network checks for the exact city and street cases above; record time to first useful roads, background evidence/summary completion, errors, request count and transferred bytes separately. Report multiple samples and their median/range, not a single run as a percentile.
- Demonstrate no full deck drain in normal tile browsing, no SQL geometry generation on warm published tiles, and actual cache origin/hit behaviour. Cache headers alone are insufficient evidence.
- Independently validate the supported release's footprint and zoom coverage, real distinct tile/object counts and several source-derived samples. One working tile cannot certify a city.
- City deep link, explicit bbox, city switch, rapid pan/revisit, national overview and unindexed city: no stale-city result, duplicated geometry path or needless national SQL.
- Road click, selection styling/camera, real works/incidents/history/provenance and filters remain functional after removing the deck geometry dependency.
- Selected/live overlays preserve publication/moderation privacy. Failed/missing tiles and services show useful honest recovery states.
- Run existing meaningful targeted tests and browser flows; review tests that currently certify only a hard-coded manifest or mocked R2 payload. A production build alone is not evidence that loading is fast or tiles were published.
- Set explicit loading budgets before optimizing and report them as targets until measured. Retain road completeness/identity and do not hide slowness by silently omitting expected geometry.

## Measurement limits

No fresh Chrome performance trace, LCP/INP measurement, browser rendering profile, production SQL execution plan or live R2 inventory was collected in this diagnostic. Fresh evidence establishes public response delays/errors and missing routes; code inspection establishes the local duplicate loading and state/dataflow problems. Existing browser evidence supports the previously observed cumulative wait.

Primary technical guidance: [MapLibre's large-data guide](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/) recommends reducing data work and using vector tiling for large datasets. [Supabase observability guidance](https://supabase.com/docs/guides/observability) provides database/request diagnostics; exact query-versus-pool timing should be measured during the repair.
