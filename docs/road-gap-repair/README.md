# Road coverage and ingestion repair

## Verified completion

- Final completed import: `1f93078c-7a85-4121-916e-ff456868f6c6`.
- Independent read-only reconciliation: **217,680 eligible source way IDs, all present; zero missing and zero unexpected extra active OSM way IDs**.
- Bengaluru Urban active physical segments: **217,685**; active grouped road records: **201,413**. These are different entity counts.
- The source-derived motor-carriageway length is **30,083.13 km**, counting separate carriageways.
- Deployed health and two road-pagination pages returned HTTP 200; pages contained ten roads each with zero overlap.
- CI and Cloudflare deployment passed for `d3d77e6`. Real-source workflow [38782099337](https://github.com/ilovedonut/theroadproblem/actions/runs/38782099337) passed on connection-budget repair `66a4681`: two fetches of 22 unchanged official records, no duplicate facts/events, original archive checksum verified, and citizen reports unchanged at five.
- The manifest now separates source measurements from verified production coverage. Unsupported historical insert/update totals were removed rather than presented as measured recovery totals.

This is a way-ID coverage audit for the saved extract, not an independent check of every geometry vertex, route identity or real-world road.

## Implemented

- The map API now returns stable UUID-keyset continuation pages, with `has_more`, `next_cursor`, and the zoom-dependent detail policy. Every page respects the viewport and active motor-road filters. Continuations omit repeated citywide statistics and source queries.
- The map drains all pages, deduplicates overlapping results, cancels stale viewport requests, preserves source signals between pages, and exposes loading, incomplete-load retry, and major-road-only zoom states. It waits for map bounds rather than initially requesting an unbounded citywide response.
- Coordinates no longer bypass district, reference, name, grade, or extent safeguards. Project points produce review candidates; they cannot establish contract extent. Supplied line geometry is used to retrieve candidates for review.
- Automatic chainage association requires a verified corridor flag, district, compatible identity, valid explicit units, and complete interval coverage. Conflicting representations, missing units, invalid endpoints, partial coverage and competing grades require review. The existing corridor flag remains a prerequisite, not a new independent certification of its underlying provenance.
- Candidate review IDs now refer to segments, metre inputs are saved in kilometres, and repeated requests for a source/work use a stable review identity. Existing randomly identified review tasks are retained; this does not retroactively consolidate old duplicates.
- Superseded links explicitly identified as machine-created are moved to review with an audit event. Manual verification and other deliberate approved associations are preserved. This applies when a record is processed; it is not a blanket retrospective certification or rewrite of every existing production link.
- Tender and PMGSY entry points forward available coordinates and geometry. The live PPPAC adapter retains its review-first policy because its historical approvals lack sufficient georeferencing; this repair does not fabricate road assignments for those 22 projects.
- CI and scheduled-ingestion checks include the new safety and database-pagination regressions. The synthetic positive-flow verifier now creates an internally consistent authoritative corridor fixture instead of relying on fuzzy names in seed data.
- The latest failed scheduled ingestion reported `EMAXCONNSESSION`: the database session pool allows 15 clients, while Hyperdrive was configured for 20 origin connections. The production Hyperdrive origin budget is now 5, with TLS `verify-full` and caching-disabled preserved. Node pools are capped at 4 and release idle clients after five seconds. Ingestion retries acquisition only, at most three attempts with bounded backoff; authentication failures are not retried and partially written jobs are never replayed by this retry helper. Hyperdrive's origin limit is a [soft limit](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/), so the remaining capacity is headroom rather than a guarantee against all external clients.

## Actual import gap and recovery

The initial production check found 64,729 active segments and an interrupted full-extract import at checkpoint 61,200. Its source checksum, boundary checksum and parser matched the local saved extract; no importer held its advisory lock.

Recovery preserves committed batches and existing history. It requires an explicit saved run ID, validates source/boundary/parser/candidate count, checks prefix presence in bounded batches, and replays from zero if the prefix is incomplete. An offset alone is rejected. Progress counters are saved with commits, and empty unchanged batches advance their durable checkpoint. Prior interrupted runs record the recovery run that succeeded them.

Lineage discovery and work-association lookup are batched instead of issuing a separate lookup per new way or revised parent. Production maintenance and a large insert caused timeouts during recovery; subsequent recovery uses 250-way transactions and bounded connection, statement and lock timeouts. In-flight failed transactions roll back while earlier checkpoints remain intact.

A subsequent socket reset left an orphaned importer transaction. Its exact backend, start time and district advisory lock were verified before closing only that session, rolling back the unfinished batch. The final recovery resumed at checkpoint 196,450 and completed. Checked-out client error listeners and a 120-second idle-transaction timeout now make this failure observable and bound orphaned transactions.

`coverage-progress-summary.json` is an independent read-only reconciliation during recovery: 217,680 eligible source way IDs, 137,361 present and 80,319 missing at that snapshot, with zero extra active OSM way IDs. It distinguishes excluded walking/construction classes from eligible motor-road omissions. The final `coverage-audit.json` verifies completion; this progress snapshot is retained as historical evidence.

## Verification

- Focused tests cover cancellation, multi-page loading beyond 600 records, failures/stalled cursors, conflicting identity, invalid coordinates and chainage, grade ambiguity, geometry forwarding, stable review identities, explicit metre conversion, and a positive authoritative-chainage control.
- Actual PostGIS/API tests retrieve all 605 fixture roads across pages with no duplicates or omissions, verify persisted units and review deduplication, and verify audited automatic-link revision while preserving manual decisions. Fixtures are isolated from production.
- Existing Bengaluru index checks pass boundary clipping, unnamed-road inclusion, separate carriageways, repeat import, renaming, split lineage, report-coordinate preservation, manual-link safety, anomaly rejection, viewport filters and nearest-road candidates.
- All six copied-production-geometry scenarios now pass in the dedicated local test database and roll back. Their positive spatial control proves candidate discoverability, not unsupported automatic approval of a project's full extent.
- Separate original-retention/history/failure/dry-run checks and isolated tender/citizen flows pass. The test script now exits unsuccessfully if any required copied-geometry case fails.
- The production build includes type checking and passes. Screenshots are saved under `output/playwright/`. Gate evidence is in `GATES.md`.

## Scope and deployment

The initial repair was pushed as `1d797d0` and its Cloudflare build succeeded. Follow-up connection-budget changes and final verification are recorded with the completion evidence. The road backfill uses the existing production database. No synthetic source records are written there by these tests.

Coverage is measured against the saved OpenStreetMap extract within the Bengaluru Urban administrative district. It is not a claim that every real-world road exists in OSM, or that roads outside this district have been indexed. Matching safeguards are deliberately conservative: uncertain projects remain reviewable rather than gaining invented confidence.

## Evidence files

- `coverage-audit.json`: final independent source-to-production reconciliation.
- `production-import.json`: completed recovery run (per-run insert/update counts cover its resumed suffix).
- `deployed-check.json`: live HTTP health and pagination results.
- `live-run/live-verification.json`: successful official-source archival/rerun artifact.
- `isolated-matching-results.json`, `isolated-official-output.txt`: copied-geometry and persistence results.
- `GATES.md`: five acceptance outcomes and their evidence.
