# Map loading repair � 16 October 2026

The public map could fail with `Timed out while waiting for an open slot in the pool.` Database activity showed multiple area-summary queries running for over a minute. The city-view road query took 26.1 seconds in a read-only execution plan, including exact spatial checks on almost 160,000 segments before the major-road filter. Segment JSON was then built with repeated scans of the visible-segment result.

The repair gates initial map events until the requested viewport has been fitted. City views identify eligible road classes and evidence-bearing segments before spatial work; cursor filtering happens earlier; geometry aggregation is grouped once per page. The browser requests 2,500 roads per city page and skips unused district-wide statistics. The browser waits for all road pages before starting the exact area summary, preventing the two large queries from competing for the same constrained database CPU. Work and incident evidence are aggregated once per page. The area summary exposes the actual viewport to the planner (`NOT MATERIALIZED`), avoids intersections for completely contained roads, drops unused intermediate geometry, and filters responsible authorities before joining the viewport. Heavy queries run in read-only transactions with local statement budgets (30 seconds for roads, 20 seconds for area totals) and 2-second lock budgets; settings cannot leak to subsequent pooled requests.

Partial lookup indexes on recorded road authorities and active road classes were added concurrently in production and mirrored in both migration directories. Both indexes were confirmed valid and ready. No road index rows were deleted or reimported. Tests use the separate local database. Existing inclusion rules remain: selected roads, official corridors, road-class fallback, works and active incidents can remain visible at city zoom; non-motor routes stay excluded from the motor-road layer.

## Verification

- Functional repair commit: `0260c22`.
- GitHub CI: https://github.com/ilovedonut/theroadproblem/actions/runs/38931121660 � passed 35 tests, isolated persistence flows and the production build.
- Cloudflare deployment: https://dash.cloudflare.com/975ca7a0691a6b5ad1ca47e75bc4b295/workers/services/view/theroadproblem/production/builds/c1d5d8d2-2922-418f-bfbd-078616ed471f � succeeded.
- `node --experimental-strip-types scripts/verify-map-loading.mjs` independently queries the expected road IDs in read-only transactions, drains every public API page, rejects duplicates, compares exact ID sets, and checks the public area summary. Results are saved in `deployed-verification.json`.
- Live desktop browser checks completed with no API errors: close-up 7.0 seconds; city roads 20.4 seconds, city summary complete at 36.2 seconds. The check verified that the summary starts after every road page finishes and that initialization sends exactly one first-page request. Full request timings are in `browser-verification.json`.
- Desktop screenshot for the supplied link: `output/playwright/map-loading-close-up-final.png`. Its actual fitted viewport contains 429 road records and 512 segments. Different browser dimensions produce different fitted viewports; these are not contradictory counts.

These measurements demonstrate completion for the checked viewports, not a concurrent-load guarantee. Broad views still take several seconds and would benefit from a future tile-based geometry pipeline. No new paid service or database capacity was added.

Final deployed API completeness results (exact ID-set comparison):

- requested-area: 358 matching road records, 1 page(s), 1.6 seconds for all road pages; 0.7 seconds for area totals.
- city-view: 5,998 matching road records, 3 page(s), 27.6 seconds for all road pages; 9.4 seconds for area totals.
- fitted-city-viewport: 7,513 matching road records, 4 page(s), 15.8 seconds for all road pages; 11.3 seconds for area totals.
