# Antigravity handoff: city selection and jurisdiction layers

Prepared 16 October 2026. This is the next feature design for review, after the road-tile/cache work already in progress. It does not instruct a second implementation of that loader.

Read [the design](README.md) and [the 36-city source inventory](CITY_INVENTORY.md) before implementation. Use the inventory as a research baseline, not as a ready-to-import current polygon collection.

## Intended user experience

At national zoom, show a lightweight set of labelled city markers/clusters. At regional zoom, verified city footprints become selectable zones. Clicking a city opens its appropriate municipal bodies and local divisions; street zoom reveals indexed roads, projects and issues. Zooming back out returns to city selection.

The first release should support the catalogue and honest availability states for the scoped cities, while publishing detailed geometry only for cities whose data has passed the gates. It must be possible to browse a city marker whose road index or current ward boundaries are still pending.

## Decisions to preserve

1. **A city selector is a discovery region.** It can collect several official bodies, but must declare its scope. A metro grouping is not a new road owner. Mumbai/Navi Mumbai/Thane and Delhi/NCR cities remain distinct entries.
2. **No fixed national district/city/zone/ward hierarchy.** Configure local navigation from typed schemes and relationships. Revenue districts, electoral wards, service offices, planning zones and engineering divisions are distinct.
3. **Current reorganizations matter.** Bengaluru needs five corporations; Hyderabad has three. Kolkata's official 2026 amendment, PCMC's ten offices and Andhra's October 2026 ward rosters require current legal/geometry reconciliation. Do not seed older easy-to-find counts as current.
4. **Location does not prove maintenance responsibility.** Store geographic membership separately from documented owner, maintainer, work-employer, delivery agency, contractor and utility roles, with source, road span and effective dates.
5. **Preserve existing IDs and coverage claims.** The current Bengaluru Urban district road footprint is not identical to GBA. A new ward split must not rewrite canonical road IDs or turn an old source's BBMP reference into a modern corporation without a crosswalk.
6. **Keep all data states honest.** Boundary available, roads indexed, responsibility documented and sources refreshing are independent capabilities. Unknown totals are unavailable, not zero.

## Integration contract to agree first

Map the following concepts onto the tile system you are building; reuse existing names where equivalent. Avoid parallel manifests or loaders.

| Manifest concept | Required meaning |
|---|---|
| `schema_version` | Client compatibility; unsupported versions have an explicit fallback |
| `region_id` | Stable discovery-region identity, independent of display name or ward number |
| `publication_id` | One immutable compatible publication bundle |
| Discovery footprint reference | Reviewed city scope, geometry version, label anchor, bounds and provenance |
| Jurisdiction release references | Named typed schemes and legal dates; may reference several municipal bodies |
| Road release references | Existing published road tilesets, canonical feature IDs and coverage metadata |
| Membership release reference | Computed from the **exact road and boundary inputs**; cannot be silently reused after either changes |
| Summary reference | Snapshot/date window and compatible inputs; definitions and source coverage |
| Capability statuses | Separate navigation, road coverage, responsibility and ingestion readiness/freshness |
| Public layer metadata | URLs, zoom bands, source-layer names, attribution, reuse basis and display names |

Keep IDs stable across tile boundaries; distinguish whole roads, physical segments and tile fragments. Shared tilesets can serve neighbouring regions; deduplicate by canonical identity. A region may reference several coverage releases where needed.

The national overview loads no city-road archives. On city selection, retrieve its small manifest, then request only visible relevant road/boundary tiles through the existing cache path. Use independent immutable boundary archives and versioned publication keys. Pin compatible references for the session, switch them together, and retain previous releases for active clients and rollback.

A PMTiles range reader must not become an accidental full-archive prefetch. Preserve correct range/CORS/cache handling from the tile work. Cache errors must not become successful empty regions. Browser storage quota or eviction failures fall back to network/session memory without breaking navigation.

## Data onboarding before publication

- Align body IDs/names with LGD where available; keep schemes and scoped local codes separate.
- Archive final notification, corrections, source geometry, timestamps, CRS, checksum, terms and parser version. Record legal commencement separately from upload date.
- Acquire official vector data through supported downloads/queries, obtaining all pages/object IDs. Request department exports where there is only a viewer, login or PDF.
- For PDF-derived geometry, require permission, georeferencing, review and a visible derived-data status. The examined MCD PDF has a reproduction restriction; do not assume permission to publish its traced boundaries.
- Stage and review semantic changes, topology, expected IDs/counts and sample locations before publishing. A matching total alone does not prove the units are correct.
- Compute road-to-area span memberships from canonical geometry. Preserve boundary ambiguity. Never infer custody solely from spatial inclusion.
- Use generalized tiles for display only; pin/road attribution uses the matching canonical boundary release. For roads along shared borders, preserve shared memberships and union canonical spans for parent totals rather than adding child lengths.
- Publish immutable files first, verify them, then atomically update the manifest. A failed ingestion/build keeps the previous complete publication.

## Suggested work sequence

1. Inspect the current tile/cache result, existing map/report/search flows and database model. Produce the mapping from this contract to that implementation before adding new interfaces.
2. Add catalogue storage/read interface and overview rendering. Support points, clusters, verified polygons, pending states, accessible list and region deep links. Reuse the existing theme; this feature does not require a globe filter or application-wide redesign.
3. Prove Bengaluru selection and multiple corporations against the existing district-index footprint. Publish verified layers only; unfinished ward/corporation data stays explicitly pending.
4. Build Chennai's official boundary adapter as a reusable reference: 3 regions, 15 zones, 200 wards, complete GIS pagination and final legal reconciliation.
5. Add road-area membership publication and named-area summaries. Test historical references, crossings, overlaps and money deduplication.
6. Prove multi-authority/metro behaviour with Mumbai and Delhi, and a sector-based path with Noida. Respect data access/reuse blockers.
7. Onboard remaining cities by source readiness. Reconcile the current Hyderabad, PCMC, Kolkata and Andhra transitions before activating their detailed sublayers.
8. Add source-change review, recovery, performance measurements and a per-city operational dashboard using the agreed existing scheduler/collection infrastructure.

## Acceptance evidence to provide

- Demonstrate India overview → city → applicable local unit → real road → back to overview on desktop and mobile, including keyboard selection and dense NCR/MMR city clusters.
- Preserve report drafts and direct road links; city selection must not unexpectedly relocate an existing report pin.
- Show network traces proving no national road download at overview, no unrelated city downloads on selection, and cache reuse after pan/zoom/revisit.
- Reconcile complete official source IDs, legal version and geometry for each published layer; show why pending cities/layers remain pending.
- Verify a road crossing several wards, a border pin returning ambiguity, a highway within a municipal ward, and a contract referring to a superseded ward number.
- Demonstrate no duplicated projects/budgets in ward/city/metro totals; distinguish actual expenditure from estimates/awards and show coverage/date ranges.
- Simulate an unavailable tile archive, stale manifest, incompatible schema, browser cache eviction and failed update. Keep a coherent old release or show a recoverable availability state.
- Provide measured performance against the agreed device/network profile. Proposed targets and detailed release gates are in the design; do not report them as achieved without measurement.

Do not enable a new source adapter on a list of plausible source names alone. Show a working endpoint or approved export, representative records, preserved originals, duplicate-safe reruns and change history.
