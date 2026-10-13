# Pilot road index and evidence matching

## Intent and first scope

Populate a reusable road geometry index so citizens can identify the road under a report pin and ingested public records can be associated with the correct location. Start with Bengaluru Urban, using an explicit administrative boundary and recording its source identifier. Expand to Ramanagara only after the first import passes the acceptance checks. No nationwide coverage claim.

## Import and identity

A trusted server-side import command downloads a bounded OSM extract or bounded Overpass batches, with timeouts, retries, backoff and resumable progress. Browser report submission reads the local PostGIS index and does not trigger third-party imports. Preserve a checksum-addressed original response, source URI, retrieval time, source timestamp, OSM way ID, version, tags and geometry. Honor OSM attribution and ODbL requirements (https://www.openstreetmap.org/copyright).

Import public motor-vehicle road classes, including unnamed streets and service roads. Retain bridge, tunnel, layer, access and road-class tags to distinguish parallel carriageways and grade separation. Exclude footways and non-road features from affected-road candidates. Use administrative polygon intersection for coverage and boundary membership; do not assign district from an arbitrary bounding box.

One OSM way is a source feature, not proof of an official road identity. Maintain unique OSM feature identity and versioned source observations separately from official road/corridor identity. Upsert unchanged ways without duplicates. Keep earlier geometry versions and existing incident/work foreign keys. A changed or removed way creates a reviewable transition; never silently reassign old evidence or assume deletion after a failed or partial import. Existing six roads stay intact; potential duplicate/overlapping imported features are explicitly reconciled or shown as alternatives, not merged merely by name.

## Map and evidence flow

Nearest-road lookup returns segment geometry, name/ref, distance, source, class, bridge/layer information and stable identifiers. Rank by metre distance and bound candidate count; avoid one road with many fragments hiding every other nearby road. Distinct carriageways remain selectable. Unnamed roads have informative labels rather than invented names.

Display candidates and selected geometry on the location map; selecting a road highlights its exact indexed segment. Keep the citizen's original observation point, show the road's distance from it, and require an explicit choice. Moving the pin clears stale associations and highlights. Preserve unmatched reporting and distinguish no coverage, no nearby road, and lookup failure. Show coverage and index freshness. Apply the same selected-road display to the review screen and correction moderation where relevant.

## Ingestion association rules

Use source coordinates/geometry, explicit official road identifiers, district and authority, and chainage only where an authoritative chainage origin and unit are available. OSM polyline length is not official chainage. Remove magnitude-based unit guessing. Names and refs discover candidates but do not establish that every segment of a corridor received a contract.

Record candidate segments, matching method, supporting source-record ID, confidence and reasons. Automatically link only an unambiguous, sufficiently supported geographical extent. Missing extent, competing roads, district conflicts and uncertain chainage require review. Keep official contract facts even when their spatial association is unresolved. Retain existing approved/manual associations; revisions to source data create an explicit review of changed associations rather than accumulate obsolete links or silently overwrite them.

## Storage, security and operations

Add migrations for source feature identity/history, import runs, spatial indexes and association provenance only as needed after inspecting current schema. Public readers receive road metadata and geometries; only trusted import/admin paths write. No client supplied source identity or privileged database credentials. Import runs record boundary, cursor, counts, errors and last successful completion. Partial failures are recoverable and never presented as complete coverage. Test migrations against local Postgres before applying remotely. Do not deploy or apply remote migrations as part of design approval.

## Acceptance checks

1. Fetch and archive one real Bengaluru Urban sample, import its actual geometries and show representative named, unnamed and service roads in nearest-road lookup.
2. Rerun identical data with no duplicated features; modify a fixture way and demonstrate preserved history and stable existing evidence references.
3. Select a road in the report flow and verify the highlighted geometry matches the selected ID; moving the pin clears it. Test mobile layout and failed/empty lookups.
4. Demonstrate a supported ingestion record linked only to its supported extent, and an ambiguous/name-only record retained for review with no automatic segment links.
5. Verify parallel/elevated road ambiguity, administrative boundary assignment, explicit chainage units, invalid geometry, incomplete fetch and retries.
6. Show OSM provenance/attribution, honest coverage state and a successful production build. Report what remains unconfigured or unapplied remotely.
