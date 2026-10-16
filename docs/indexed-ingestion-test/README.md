# Indexed-road ingestion verification

Tested 15 October 2026. **Official fetching and persistence passed; automatic road matching is not safe to enable broadly.** Test completion here is not a certification that every matching scenario passed.

## Live official pipeline

[Verification run 38757263999](https://github.com/ilovedonut/theroadproblem/actions/runs/38757263999) passed its isolated database tests and real-source verification.

Both real fetches found 22 PPPAC Karnataka road approvals. Both skipped all 22 unchanged records, inserted no duplicate works or evidence versions, and created no duplicate events. The archived original HTML was fetched back from private storage and its SHA-256 matched. HTML checksums differed between fetches while parsed facts stayed unchanged; that correctly produced separate original-document keys without duplicate project facts.

An independent production audit used enforced read-only transactions before and after the run:

| Item | Before | After |
|---|---:|---:|
| Road records | 57,814 | 57,814 |
| Active physical segments | 64,729 | 64,729 |
| Citizen reports | 5 | 5 |
| Official PPPAC works | 22 | 22 |
| Official source versions | 22 | 22 |
| PPPAC road links | 0 | 0 |
| Pending PPPAC matching reviews | 22 | 22 |
| Orphan work-to-road links | 0 | 0 |

The official adapter deliberately queues all these historical statewide approvals. It does not call the automatic matcher. More indexed roads alone do not supply missing authoritative project geometry or road-identifier concordance.

## Tests using actual indexed geometry

Copied 180 actual indexed segments from 128 road records into a transaction in the dedicated local `theroadproblem_ingestion_test` database. Of these segments, 177 carry an OSM way ID; three do not. All copied geometry, test projects, and matching associations rolled back afterward. No synthetic source record or project was inserted into production.

| Scenario | Result |
|---|---|
| Named road and actual segment midpoint are discoverable | Pass |
| Conflicting source district requires review | **Fail: auto-approved, score 95** |
| Nonexistent road name and reference require review | **Fail: nearest road auto-approved, score 95** |
| Multiple nearby candidates without identifying evidence require review | **Fail: nearest road auto-approved, score 95** |
| Outside-index point remains unlinked | Pass |
| OSM geometry alone does not invent authoritative chainage | Pass |

The failing spatial cases each returned ten candidates. `src/lib/matcher.ts` chooses the first nearby segment, optionally switches to a name/ref candidate, then always returns an approved match with score 95. It does not enforce district agreement, reject contradictory identifiers, or assess competing nearby candidates. It also labels this coordinate result `high_exact_ref_chainage` even when no chainage was supplied.

Repeating a successful association created no duplicate links. The separate isolated official-adapter checks passed original-payload retention, unchanged reruns, revised facts, source reversion, audit history, archive/network failure handling, and dry-run write prevention.

## Next repair

See [the detailed diagnosis](ANALYSIS.md) for the reproduced root cause, current production impact, additional code findings, and acceptance checks.

Keep the live official adapter's review-first behavior. Before connecting additional geolocated ingestion adapters to automatic linking, reject contradictory districts/identifiers, assess parallel and elevated candidates, require clear evidence for automatic approval, and report confidence that describes the evidence actually used. Add these reproduced cases to the mandatory CI checks.

## Evidence

- `live-run/live-verification.json`: fresh official-source workflow artifact.
- `production-before.json` and `production-after.json`: independent read-only counts and source/run metadata.
- `indexed-road-sample.json`: actual public road geometry, with OSM attribution and ODbL notice.
- `isolated-matching-results.json`: inputs, candidate IDs, returned matches, and individual failures.
- `isolated-official-output.txt`: separate test-database verification result.

Run source/safety tests with `node --experimental-strip-types --test tests/real-ingestion.test.mjs tests/test-database-safety.test.mjs`. Run copied-geometry scenarios with `node --experimental-strip-types scripts/verify-indexed-ingestion.mjs`; this requires the named local test database and the saved sample. Its completion marker means every scenario ran and was recorded; inspect the `failed` field rather than treating the marker as a safety pass.
