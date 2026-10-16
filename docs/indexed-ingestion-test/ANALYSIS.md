# Indexed-road ingestion: detailed diagnosis

Analysis date: 15 October 2026. Based on the saved production audit, a fresh official ingestion run, isolated tests with actual indexed geometry, and code inspection. This report makes no application changes.

## Conclusion

Fetching official records, preserving originals, deduplicating unchanged facts, and saving history worked in the tests. The unsafe part is automatic attribution: deciding which physical road segments a source actually describes.

There are two distinct limitations:

1. The live PPPAC adapter deliberately leaves its 22 projects unlinked because their location information is insufficient for dependable segment attribution.
2. The separate matcher has an unsafe coordinate shortcut. It approves a nearby segment even when the supplied district or road identifiers contradict that choice, or when identifying information is absent.

The three reproduced failures share this second root cause. They do not establish a 50% production error rate, and they do not prove that the current scheduled adapter has created incorrect links.

## What is working, and what remains unproven

| Layer | Evidence | Conclusion |
|---|---|---|
| Road index | 57,814 road records and 64,729 active segments in the production audit | Indexed geometry is available; record counts do not establish official corridor identities |
| Official retrieval | Fresh workflow fetched 22 PPPAC records twice without errors | This source is reachable |
| Originals and deduplication | Archived original verified by SHA-256; both passes skipped 22 unchanged records | Original retention and semantic deduplication passed |
| History and recovery | Separate test-database checks covered revisions, reversions, archive/network failures, and dry-run writes | Covered persistence safeguards passed |
| Official road attribution | 22 pending reviews, zero PPPAC segment links before and after | This adapter has not demonstrated automatic attribution to indexed roads |
| Matcher safety | Three negative cases incorrectly approved | Coordinate-based automatic approval is unsafe in the tested cases |

The successful live run is [GitHub Actions run 38757263999](https://github.com/ilovedonut/theroadproblem/actions/runs/38757263999). Citizen report counts stayed at five. The independent production audit used enforced read-only transactions. Synthetic matching cases ran only in a dedicated local test database and were rolled back.

## 1. The spatial shortcut mistakes proximity for identity

In `src/lib/matcher.ts:62–103`, the matcher:

1. Searches for active segments within 150 metres of a supplied point.
2. Orders them by distance and returns up to ten candidates.
3. Starts with the nearest candidate (`:82`).
4. Optionally switches to a candidate matching a name substring or exact reference (`:89`). If no identifier matches, it retains the nearest candidate.
5. Returns immediately with `review_status: approved`, `is_ambiguous: false`, score 95, and confidence `high_exact_ref_chainage` (`:93–101`).

This return bypasses the later district scoring, ambiguity assessment, and chainage checks. The spatial query does not validate district or authority and does not consider layer, bridge, tunnel, or service-road identity. The score is a fixed constant, not a measured 95% probability of correctness. The confidence label claims reference and chainage evidence even when neither was supplied.

PostGIS [ST_DWithin](https://postgis.net/docs/ST_DWithin.html) establishes whether geometries are within a distance; geography distances use metres. It does not establish that a nearby segment is the road named in a document. At an interchange, a service lane and a flyover may be close in plan view while representing different assets. Reliable grade metadata is needed; changing to a 3D distance function alone would not resolve this when authoritative elevation is unavailable.

### Reproduced examples

All three cases used the same Bengaluru point, longitude 77.62495715, latitude 12.9173.

| Source claim | Expected result | Actual result |
|---|---|---|
| Road name `1 A Main Road`, but district `New Delhi` | Contradiction requires review | Approved `1 A Main Road`, score 95 |
| Name `NONEXISTENT ROAD CONTROL` and reference `NONEXISTENT-REF` | No supported identity; requires review | Approved `Hosur Road (Surface Service Carriageway)`, score 95 |
| Coordinates only | Multiple nearby candidates require review | Approved the same Hosur Road service carriageway, score 95 |

Each returned ten candidates because the query is capped at ten. That is not evidence that only ten segments exist within the radius.

The positive named-road control passed. An outside-index point remained unlinked. A chainage-only case correctly remained for review where relevant segments lacked authoritative chainage. Overall, three of six deliberately selected scenarios passed.

The sample contained 180 actual indexed segments from 128 road records, bounded to two Bengaluru windows and sorted before limiting. Of these segments, 177 carried an OSM way ID; three did not. Layers included -1, 0, 1, and 2. This is a useful regression sample, not a representative citywide error-rate study.

## 2. The live adapter and the tested matcher are separate paths

`src/lib/ingestor/runner.ts:6` currently runs the official ingestion adapter. `src/lib/ingestor/official-ingestion.ts:40` queues new or revised PPPAC records for review with an empty candidate list. It does not invoke `matchRoadPrecisely`.

The tender, PMGSY, and older import entry points call the matcher with text and chainage fields, but the inspected calls do not forward coordinates or geometry. Therefore, the reproduced spatial failure is a direct matcher defect; it is not evidence that these particular live adapter calls currently exercise that branch.

This separation explains how ingestion can pass while road attribution remains incomplete. It also means adding more roads will not automatically attach existing PPPAC projects: there is currently no demonstrated reconciliation step that resolves those reviews against the expanding index.

## 3. Available source facts do not yet establish physical project extent

Among the 22 saved PPPAC records, 21 have a parsed road reference and ten have parsed chainage endpoints. None has a populated district or coordinates. Approval dates range from 2006 to 2025.

These are historical project approvals. They are not proof of current road damage, an awarded contract, actual expenditure, or a contractor's present responsibility. The adapter appropriately leaves official status unknown and contract value unset while preserving the approved project cost with its financial meaning.

Even a title containing a highway number and kilometre range needs interpretation. Reliable chainage attribution requires the correct route identity, reference origin, direction, applicable route version, and segment measures using the same system. Segment length measured from OSM does not establish official chainage. A single project point also cannot establish the full affected extent of a multi-kilometre project.

Index expansion improves candidate coverage. In dense streets and interchanges, it can also introduce more plausible alternatives. Coverage and attribution confidence must be measured separately.

## 4. Additional code findings requiring focused regression tests

These findings are from inspection; their production incidence was not measured.

| Finding | Why it matters | Location |
|---|---|---|
| `geometry_geojson` is declared but unused | A supplied project line or polygon cannot constrain the affected segments | `src/lib/matcher.ts:16` and matching implementation |
| Text candidate query does not require district agreement | Its district-and-name OR branch is redundant with the unrestricted name branch; a later district penalty can be outweighed | `src/lib/matcher.ts:108–184` |
| Ambiguous text results place road IDs in `candidate_segment_ids` | Review consumers expecting segment IDs can receive the wrong identifier type | `src/lib/matcher.ts:203` |
| Metre-based chainage is normalized for matching but not consistently persisted | A decision can lose the normalized range needed to explain or reproduce it | `src/lib/matcher.ts:388,413` |
| Review insert relies on `ON CONFLICT DO NOTHING` without a semantic uniqueness constraint found in inspected migrations | Repeated unresolved matching requests can create duplicate review tasks | `src/lib/matcher.ts:375–380` |
| Existing approved automatic links are excluded from updates | Preserving manual review is useful, but incorrect automatic links need a controlled supersession/retraction mechanism | `src/lib/matcher.ts:408` |
| One active segment plus a text score can approve a whole road record | An imported physical fragment is not necessarily a complete official corridor | `src/lib/matcher.ts:320` |

There is also a threshold inconsistency: scores 45–49 with matched segments enter the medium-confidence branch before the later low-score branch. Threshold meaning and approval policy need explicit tests rather than relying on comments.

## 5. Why an incorrect approval matters downstream

The area summary consumes approved work-to-segment associations (`src/app/api/v1/map/summary/route.ts:24–37`). It allocates a contract-value estimate according to visible linked length relative to total linked length.

An incorrect association can therefore put a project's budget estimate, contractor, or responsibility in the wrong map area. Even selecting the correct road at one point can misrepresent allocation if a long project's entire value is attached to a single short segment.

This is a potential consequence, not an observed corruption from the 22 PPPAC records: those have zero segment links, and their approval costs are not populated as contract values. The endpoint also explicitly returns `actual_spend_inr: null`; these tests did not show invented actual spending. The audit did not certify the correctness of every other existing production association.

The citizen road picker is a separate implementation. It considers grade/service-road metadata and deliberately requires an explicit user choice (`src/app/api/v1/roads/nearest/route.ts:251`). A working citizen picker does not validate automatic project attribution. Shared candidate evidence could reduce divergence, but project extent and citizen incident points require different approval rules.

## 6. Why the existing checks passed

The existing official-ingestion tests focus on retrieval, fact extraction, preservation, deduplication, history, failures, and database isolation. They do not cover the contradictory coordinate cases above. A green run confirms those covered checks, not every road-matching decision.

The new copied-geometry script records individual failures but currently prints a completion marker after all scenarios finish. Completion is not a safety pass. Before making it a mandatory CI gate, it must exit unsuccessfully when any required matching assertion fails. The saved results currently say `passed: 3`, `failed: 3`.

## Recommended repair sequence

### First: remove unsafe approval behavior

- Retain the official adapter's review-first behavior.
- Replace the unconditional spatial approval with a decision that records supporting evidence, contradictions, competing candidates, and unresolved scope.
- Treat a conflicting district or explicit incompatible reference as requiring review; normalization or documented aliases may resolve a conflict, but a higher proximity score must not silently override it.
- Treat a point with several plausible roads as uncertain. Preserve layer, bridge, tunnel, and service-road alternatives during candidate retrieval.
- Use confidence descriptions that state the evidence actually present. Do not present an arbitrary score as a probability.
- Make all reproduced negative cases mandatory failing CI assertions until repaired.

### Second: model route identity and affected extent

- Distinguish a physical segment, a grouped road, an official route/corridor, and a project work package.
- Normalize road references and aliases with provenance, including jurisdiction and historical renumbering where known.
- Apply project geometry when available. Use chainage only after establishing a compatible route and measurement system.
- Keep candidate discovery separate from approval. A nearby candidate is useful even when the final decision remains unresolved.
- Make adapter contracts carry available geometry, coordinates, and their precision/provenance through to the matcher.

### Third: make review and correction durable

- Store correctly typed candidate IDs, normalized units, algorithm version, decision reasons, source version, and reviewer actions.
- Deduplicate reviews by a defined source/version/task identity.
- Preserve manual decisions, while permitting an audited revision to automatic associations. Supersede obsolete links rather than silently retaining both old and new ones.
- Keep unallocated project values out of area-specific totals until extent is supported; show unknown coverage clearly.

### Fourth: prove one real attribution flow

Select an actual Bengaluru source record with independently checkable location evidence. Demonstrate original archive → extracted facts → candidates → justified association or explicit review → provenance in the app. Verify affected extent as well as road identity. Rerun unchanged data, revise the source, and confirm history, deduplication, and association correction. Only then expand automatic attribution to comparable sources.

## Acceptance checks before broader automatic attribution

1. A documented positive real-source case resolves to the expected road and supported extent.
2. Contradictory district, reference, or name cannot silently approve an unrelated candidate.
3. Ambiguous junction, service-road, and elevated-road cases remain for review without distinguishing evidence.
4. Missing coverage remains unlinked and is distinguishable from conflicting evidence.
5. Metre and kilometre inputs produce equivalent decisions and persisted ranges; invalid ranges are rejected.
6. Project geometry is actually used; unsupported official chainage is never inferred from arbitrary OSM lengths.
7. Repeated unresolved records do not duplicate review tasks, and candidate IDs resolve to the intended entity type.
8. Source revisions preserve history and supersede obsolete automatic links while retaining deliberate manual decisions.
9. Mandatory CI fails for any violated safety requirement; coverage and unresolved-review metrics are visible separately from fetch success.

## Evidence files

- `production-before.json`, `production-after.json`: independent production audit snapshots.
- `live-run/live-verification.json`: fresh official workflow verification.
- `indexed-road-sample.json`: bounded sample of actual indexed geometry and attribution.
- `isolated-matching-results.json`: exact six inputs, outputs, and failures.
- `isolated-official-output.txt`: separate official persistence regression results.

The next priority is trustworthy attribution and a real positive attribution demonstration. Database connectivity and the existence of indexed geometry are no longer the blockers established by these tests.
