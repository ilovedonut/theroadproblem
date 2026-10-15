# theroadproblem.quest — Antigravity build plan

Prepared 10 October 2026 from a complete reading of `deep-research-report.md`; updated 11 October 2026 for autonomous execution.

## Purpose and execution contract

Build a free-to-use, mobile-first public road-history and public-works application for India. A person should be able to find a road, understand the known problems and official works, contribute an observation, inspect its evidence and history, and return to a stable link. Contractor information must be tied to a documented work package, with its source visible.

Execution mode updated 11 October 2026 at the user's request: **one-shot autonomous implementation with self-checking and review**. Read `ANTIGRAVITY_ONE_SHOT.md` together with this roadmap. Antigravity should work through all stages, use each stage's gates as internal checks, repair defects and continue automatically. Codex relay/review between stages is no longer required. The one-shot file defines checkpointing, evidence, blocker handling and final completion claims.

This is a proposed implementation contract, not a statement that any app, dataset connection, provider account or deployment already exists. At initial inspection the folder contained only the research markdown and no Git repository or application code. Reinspect before starting: the user or another agent may have added files.

Begin with Stage 00 feasibility, then proceed directly into implementation and all remaining stages. Stage 00 itself remains a planning/source-verification task; completing it is the beginning of the build, not a stopping point. Preserve existing user work and inspect the actual environment before taking action.

## 1. Scope decisions

### Required for the first public accountability MVP

- India-wide basemap, locality discovery, road selection and location-based reporting; measured coverage labels for road indexing and official records.
- Map and map-free list views, shareable road/segment and incident pages, bounded map queries, useful loading/error/empty states.
- Public browsing; signed-in pseudonymous contributions; English and Hindi; anonymous public identity can be chosen without anonymous authenticated accounts.
- Problems represented as incidents, with separate observations, evidence, corroboration, repair evidence and recurrence history.
- Photo evidence, duplicate suggestions, explicit road confirmation, moderation, disputes, corrections and appeals.
- One real, permitted official source imported and refreshed automatically; at least one genuine award/contract-backed contractor-to-work linkage.
- Provenance and freshness for official facts; official completion and conflicting community evidence displayed together.
- Low-data mode, accessible mobile layouts, installable PWA, durable offline drafts and safe reconnect submission.
- Authorization, private-media handling, abuse controls, account/content deletion, operational monitoring and demonstrated backup recovery.
- Working deployed staging and production configurations, with the public-launch checks in section 7 completed.

### Later work

Road follows, email digests, Web Push, more languages and state adapters, institutional APIs, bulk exports, contributor reputation, organization portals and statistical dashboards follow the first complete MVP. SMS, WhatsApp, AI chatbot, pothole detection, satellite analysis, 3D and contractor rankings are excluded from this build.

Do not scaffold unused packages or adapters for deferred features. Establish small interfaces where extension is actually needed.

### Defaults to use without repeatedly asking the owner

- One maintainable application rather than separate frontend/backend microservices.
- One urban sample and one rural sample to test real geometry and connectivity cases. Bengaluru is a provisional urban sample; choose a bounded Karnataka rural area if a verified official source supports it, otherwise recommend an evidence-backed alternative.
- Optional display name; no phone collection or continuous location tracking.
- Signed-in accounts for contributions and corroboration; public browsing unrestricted.
- Initial corroboration policy: two qualifying authenticated accounts providing compatible observations, with self-corroboration and repeated media excluded. Explain the count as accounts/observations rather than proven independent people. A review can override the projection only with a recorded reason.
- Initial configurable matching policy: at most five road candidates within 100 metres; the reporter confirms the chosen road. Suggest same-category active incidents on that segment within 30 metres and 14 days, while also allowing the user to select an older unresolved incident explicitly. These are conservative starting rules to test against urban/rural samples, not a claim that distance alone establishes a match.
- Initial freshness label: a community incident with no qualifying observation for 30 days is marked not recently observed and stays unresolved; official source freshness uses its declared refresh cadence, with an alert after two missed expected runs. A 10-minute future observation tolerance accommodates device-clock errors; larger future times require correction.
- Up to two photos per observation. Initial configurable limits: 8 MiB accepted encoded input per photo, at most 20 megapixels decoded, normalized derivative at most 1,600 pixels on the longest edge and 1 MiB. Check these against the actual host before finalizing.
- Fresh repair evidence requires an authorized review or another qualifying account before incident resolution. Reappearance after confirmed resolution creates a new incident linked to the previous episode.
- Account-level independence is a useful signal, not proof of distinct human beings.
- Manual privacy review/redaction is an acceptable pilot media pipeline. Originals stay private until an approved derivative exists. Do not claim automatic face/plate detection unless actually implemented and evaluated.
- Code can use MIT after repository ownership is confirmed. Dataset and contributor-photo rights stay separate.
- Use free tiers for development where practical. No permanent zero-cost promise, and no paid resources or subscriptions without an explicit spending decision.

Owner-dependent facts remain open until supplied: preferred pilot geography, provider/repository/domain ownership, spending ceiling, moderator and grievance contacts, retention-policy owner and production publication decision. These should block only the work that actually depends on them.

## 2. Architecture decision

Recommended starting stack:

| Responsibility | Choice |
|---|---|
| Web application and request API | Next.js, TypeScript, standard server runtime |
| UI | Accessible components, restrained mobile design, Tailwind or existing equivalent |
| Map | MapLibre GL JS |
| Database | PostgreSQL with PostGIS and trigram search |
| Authentication | Supabase Auth; confirm email delivery/redirect setup early |
| Database access | Supabase with RLS, protected functions and server-validated mutations |
| Basemap | Licensed OSM-derived PMTiles or a verified permitted provider during preview |
| Objects | R2 for versioned tiles, private uploads and approved image derivatives |
| Frontend hosting | Netlify's supported Next.js server deployment as the initial target |
| Jobs | Small scheduled processes in the same repository; runtime selected after source/media tests |
| Local development | Reproducible local Postgres/PostGIS/auth setup and local object storage where available |
| Tests | Focused domain and database authorization tests, browser journeys for complete flows |

Confirm compatible stable versions and record them in the lockfile during foundation work. Keep code portable to another ordinary Node hosting target. Do not introduce a new framework because it is fashionable.

**Deployment must be coherent.** Do not configure `output: export` while relying on dynamic Next.js API requests, auth cookies, or newly created road/incident pages. Document which runtime handles web requests, media processing and scheduled ingestion, including execution limits. Large downloads/imports run as explicit local or dedicated jobs, not inside a browser request.

Alternative 1: a Vite client with separately hosted API is reasonable only if demonstrated hosting constraints justify the split; it adds deployment boundaries and needs a deliberate shareable-page strategy. Alternative 2: a paid VPS with PostGIS and jobs may become simpler when national geometry outgrows managed quotas. Neither requires changing the product model.

### Three independent coverage layers

1. **Cartographic coverage:** where the basemap renders.
2. **Road-index coverage:** where real canonical roads can be searched, selected and snapped to.
3. **Official-data coverage:** jurisdictions and programmes with imported work/contract records.

An India PMTiles archive proves only the first. Do not assume generic display-tile feature IDs identify durable database roads. A rendered road needs a canonical identity supplied through the road overlay or a verified feature-to-canonical mapping.

Default reliable approach: import road geometry into PostGIS, query it spatially, and serve a selectable overlay carrying application segment UUIDs. Use the basemap independently. Start with small real samples and measure geometry plus index storage, query times, import requirements and nationwide extrapolation. A raw compressed PBF size is not a database-size estimate.

If full national PostGIS capacity requires spending, state the measured estimate and exact dependency. An object-storage road lookup/sharding approach is an alternative only after proving stable identities, authoritative geometry retrieval, nearby-road candidates, search, refresh and workable latency. Do not quietly add that complexity to preserve an unproven free-tier claim.

During private preview, users outside indexed areas can save an unlinked location report for later road matching. The UI must say road matching is unavailable there. This fallback is required for recovery but does not waive the final national road-index gate.

### Data flow

User observation -> validated server mutation -> incident/report transaction -> audit event -> map/detail projection.

Photo -> private quarantine -> decode/validate/re-encode -> privacy review/redaction -> approved derivative -> public evidence reference.

Official source -> permitted retrieval -> immutable source version -> parser/validation -> staging/matching -> reviewed publication -> work facts/events.

Basemap archives remain versioned static objects. Live incidents do not trigger PMTiles rebuilds.

## 3. Model and state rules

The research table is a starting point, not the final schema. Correct these omissions before writing migrations.

### Entities

| Entity | Contract |
|---|---|
| Roads | Logical identity; never one current condition or contractor for an entire national highway |
| Road segments | Stable app UUID, authoritative geometry, admin area and source mappings |
| Segment geometry versions and lineage | Reimports and way splits/merges preserve old links and history |
| Incidents | One problem episode, category, affected location/extent, lifecycle and predecessor if recurrent |
| Reports | An attributed observation, original point, chosen segment, observation time and text; corrections retain history |
| Media | Private original/normalized derivative, processing/review state, hashes and retention fields |
| Corroborations/verifications | Unique actor evidence, method, observation time, verdict and audit references |
| Works and work_segments | Official packages linked to multiple segments; several works can overlap a segment |
| Contractors and work_contractors | Organization plus source-backed work role; does not imply blame for an incident |
| Authorities/authority assertions | Segment/work responsibility with provenance and dates; road class alone is insufficient |
| Data sources | Publisher, resource URL, specific licence, access method, scope, refresh and terms-review evidence |
| Source items and source versions | Stable external identity plus immutable checksum versions, retrieval time and parser version |
| Ingestion runs and match proposals | Actual run outcome, counters, last success, failures and human review |
| Public profiles/private account data | Public pseudonym separated from Auth email and protected role records |
| Events/moderation/correction records | Auditable domain actions with safe references and reasons |

No automatic merging by road name. Preserve OSM way IDs and source versions separately from application UUIDs. Define segment split/merge/supersession rules and stable redirects before refresh logic.

### Separate state dimensions

- Official work status: planned/tendered/awarded/mobilized/in_progress/officially_completed/maintenance/cancelled/unknown.
- Observed condition: dug_open/partially_blocked/damaged/pothole/flooded/unsafe_workzone/temporary_restoration/repaired/deteriorated/normal/unknown. This is an observation assertion; it is not automatically a road-wide fact.
- Incident lifecycle: active/repair_reported/resolved; recurrence creates a related episode.
- Verification: unverified/corroborated/field_reviewed, with conflicting evidence separately represented as disputed.
- Publication: pending_checks/published/held/rejected/removed, independently for reports and media.
- Freshness: last_observed_at, source_last_success_at and computed stale indicators; staleness does not erase an incident or imply repair.

Do not initialize an unreported road as normal. Show **No observations recorded**. **No imported official records** is different from no work occurring.

A segment may contain several active incidents. Resolving a pothole must not resolve an excavation. An official completed work must not resolve a community problem. A moderator-reviewed citizen report must not acquire an Official source badge.

Keep observed time, submitted time, official publication/effective time and retrieval time distinct. Use UTC storage with localized display. Future-time tolerance and stale thresholds must be explicit configurable rules, tested before publishing them. Older evidence submitted later must not silently outrank a newer assessed repair.

### Transaction and permission invariants

- Mutations set actor identity from the verified session. Clients cannot choose moderator roles, official status, verification badges or event authors.
- Incident creation, observation, derived projection and event creation succeed or roll back together.
- Idempotency keys bind to user and payload. Retrying the same logical submission produces one durable result; changed content with the same key is rejected clearly.
- Corroboration cannot count the original reporter, duplicate requests or the same actor twice. Identical media cannot masquerade as fresh independent evidence.
- Duplicate matching proposes compatible candidates by road, category, metres and time. The reporter chooses an existing problem or a separate one. Never merge merely by proximity.
- Moderator merges use transactions/locking, prevent cycles, retain every observation/evidence record and redirect old incident links.
- Nearest-road queries return bounded plausible candidates in metres, considering bridge/tunnel/service-road ambiguity. Save original point, selected segment, snap distance and method. No candidate is a recoverable state.
- RLS, grants and function privileges ship with migrations. Test anonymous user, reporter A, reporter B and moderator through direct data/API access as well as UI.
- Append-only civic events do not embed permanent copies of email, IP, raw EXIF or identifying free text. Private/content payloads support erasure/redaction, actor detachment and cache invalidation while nonpersonal road history survives.

## 4. User journeys and interface rules

Start at 360px mobile width. Main navigation: Explore (map/list), Report, My contributions/drafts, language/account. Moderator tools require a protected role.

Road/segment detail shows location, coverage/freshness, active incidents, an observed-history section, a separate official-works section and sourced responsibility where known. Incident detail shows condition, verification explanation, latest observation, evidence, complete chronology and contribution/correction actions. A work card shows package, authority, official status, contractor role and direct provenance.

Map/list filters must change the actual query and result count. Store useful explore state in the URL. Use labelled symbols as well as colour. Use readable contrast, visible focus, keyboard alternatives to map interactions and large touch targets. Avoid a decorative homepage that blocks the main civic task.

Reporting flow: choose/manual-enter locality or location -> pick category/observed time -> confirm road or retain unmatched point -> review duplicate candidates -> describe/add evidence -> preview what will be public -> submit or save draft -> display actual server status.

If GPS is denied/inaccurate, WebGL fails, tiles fail, search is empty or the network disappears, offer manual pin/locality and list/draft paths. Distinguish **saved on this device**, **waiting for sign-in/connection**, **sending**, **submitted**, **failed**, and **photo awaiting review**. A held photo need not hold otherwise publishable text.

All core labels, validation, error/empty states and moderator actions use English/Hindi message catalogs. Original citizen text is preserved in its original language. No automatic translation feature is required.

Offline means an installed/previously loaded shell, cached recently viewed information where available and durable local drafts with text, time, point and photo blobs. No promise of discovering arbitrary uncached roads offline. Foreground reconnect or an explicit sync button is sufficient; background sync is optional. Preserve drafts through expired auth and server errors. Handle browser storage quota/eviction limits and offer recovery/export where practical. Do not cache private authenticated responses as public shared pages.

## 5. Source and operations rules

The research uses opaque citation tokens; these cannot serve as real dataset references. Every integration must establish actual URLs/resource IDs and specific terms.

Source audit covers: India basemap, real OSM road extract, administrative/locality search data, one official work/status source, and genuine award/contract evidence. Record which fields each actually provides. Road GIS data does not automatically include contractors or work dates.

Prefer APIs and downloadable open data over HTML/PDF parsing. Never bypass login, OTP, CAPTCHA, access restrictions or rate limits. Government publication does not by itself imply reusable/licensed content. Unknown permission means the source remains unpublished pending resolution.

Store only permitted snapshots/fields and keep licence boundaries clear. If full raw document storage is not permitted, record allowed evidence references/hash/extracted fields instead. No crawler for arbitrary user-supplied URLs; ingestion fetches use reviewed source configuration and appropriate request bounds.

Tender publication is not an award. A contractor link requires the specific award/LoA/contract and a reviewed work/segment match. A manually transcribed real award is acceptable initially with provenance and a second-person or moderator check; disclose that its contractor updates are manual. It does not replace the separate real automatic-source-refresh gate.

Retain unchanged-fetch records as ingestion-run evidence without duplicating domain facts/events. New source content creates an immutable version. Parser changes may revise normalized facts only with a recorded reason. Failed fetches preserve last-known information with freshness warnings. Ambiguous road/project matches stay in review.

Before public operation: named moderator/data-steward owner, working correction/grievance contact, policy/retention owner, alert recipient, budget limit, ingestion kill switch, reporting-disable switch, moderation queues, deletion jobs, independent backup storage and rollback procedure. Policy drafts require actual operator details; fabricated contacts and unowned queues do not pass launch.

## 6. Build stages and internal acceptance checks

Stages are dependency-driven, not calendar promises. Split a large stage into internal tasks when necessary. After a task passes, choose the next unblocked task automatically. Do not skip a failed gate or rename it complete. External dependencies must not stop independent local work.

### Stage 00 — Feasibility, sources and implementation specification

Inspect all project files and applicable instructions, existing Git state, available Node/package manager, Docker/PostGIS/auth options and browser-testing capability. Do not print secrets. Read both planning markdowns fully.

Verify small real source samples and record the exact URLs, fields, dates, access method, licence evidence and limitations. Inspect the national extract metadata; avoid downloading all India merely to write a plan. If tools permit, inspect a small licensed urban/rural road sample and report its real format/count. Otherwise state the precise check still needed.

Choose a coherent architecture; create a model/state matrix, permission matrix and measurable geography/capacity-check method. Compare a conventional national PostGIS deployment with a proven alternative only if cost requires it. Identify local versus provider-dependent checks. Choose ordinary implementation defaults; surface only real owner decisions.

Save `docs/00-feasibility.md` and a source matrix in `docs/source-registry.md`. They may propose corrections to this plan with reasons; do not silently overwrite it.

**Gate:** every claimed source capability has primary evidence and a VERIFIED/UNVERIFIED/BLOCKED label; there is a practical first local-build path, an explicit national-capacity decision method, exact dependencies and an implementation order. An inaccessible official feed is a documented outstanding dependency, not a successful integration.

### Stage 01 — Reproducible foundation and data contract

Initialize/reuse one app and local Git as appropriate; install only necessary dependencies. Establish migrations, PostGIS in a dedicated schema, generated types, server/client boundaries, auth, protected roles, minimal health page, CI checks and development/test configuration. Implement the corrected entities and transactional domain mutations/projections before broad UI work. Add a labelled test seed separate from live data.

**Gate:** clean setup/reset works; migrations and meaningful database tests run against real Postgres; role escalation/private-data tests fail safely; incident/report/events roll back atomically; two-user and idempotency cases pass. Missing hosted credentials do not become fake successful connections.

### Stage 02 — Real roads, identity and capacity

Import bounded real urban/rural roads and actual locality data. Implement source mapping/versioning, spatial indices, bounded search/nearest-road/viewport endpoints and import-run evidence. Verify ambiguity at intersections, parallel roads and flyovers. Measure table/index size and query plans; update national capacity estimates. Reimport unchanged and altered sample geometry to prove identity/lineage behaviour.

**Gate:** real selectable segment IDs and geometry persist; repeated imports do not duplicate roads/events; old links survive geometry changes; nearest-road distances are correct in metres; queries are bounded and indexed. National hosting needs are explicitly estimated with assumptions and measured sample inputs.

### Stage 03 — Explore and detail interface

Build real map/list/locality discovery and shareable road/incident pages. Use configured licensed tiles, canonical road overlays, actual API data, separate official/observed sections and useful empty states. Establish responsive components and bilingual catalogs now. Test map failure/list fallback. No invented dashboard statistics or contractors.

Establish a minimal access-controlled staging deployment once provider configuration is available, reusing foundation configuration. Prove the Next.js runtime, database connectivity and basemap range/CORS path there. This early staging path is a prerequisite for Stage 08 deployed-capacity claims; missing credentials block that hosted check, not local interface work. Stage 09 completes and hardens staging rather than introducing its first deployment.

**Gate:** mobile users can find/select a real road, reload its stable link and inspect actual stored data; filters work; no empty dataset is labelled healthy; the list remains useful when maps fail. Provide 360px and desktop screenshots plus browser-flow evidence.

### Stage 04 — Citizen reporting and private evidence

Implement sign-in, manual/GPS location, road confirmation, duplicate candidates, observation time, description, preview and server-backed submissions. Add durable draft storage from this stage, then polish sync in Stage 07. Implement signed uploads, ownership binding, decode/size/type checks, server re-encoding and private quarantine. Publish only reviewed derivatives. Support removal of failed/orphaned uploads.

**Gate:** submit -> database -> reload -> stable incident link works; no self-assigned actor/state; replayed submission creates one result; broken auth/network retains data; invalid uploads are rejected; originals and pending images cannot be retrieved publicly. Public writes remain limited to private development/staging until moderation is complete.

### Stage 05 — Trust, repair history and moderation

Implement corroboration, explicit evidence labels, transactional merge, held/rejected/removed content, dispute/correction/appeal queues and audit reasons. Implement privacy-review/redaction tools if automatic media processing is absent. Resolve using the agreed evidence policy, and link a later recurrence to the old episode. Review out-of-order/conflicting evidence without silently discarding it.

**Gate:** two reports of the same problem become one incident with both observations; nearby different problems stay separate; own/duplicate evidence does not inflate corroboration; ordinary users cannot access moderation operations directly; merge races/cycles are handled; repaired -> recurring preserves complete chronology. Every queue has a working action and recovery state.

### Stage 06 — Real official loop and provenance

Implement the one verified official adapter; permitted fetching, snapshots/versions, parser validation, staged matching, reviewed publication and scheduled refresh. Import at least one genuine award/contract-backed work/contractor relationship. Keep imported status and field reports separate. Add attribution/source health and correction links.

**Gate:** real source import and later scheduled refresh are evidenced; unchanged reruns add no duplicate facts/events; controlled version-change tests preserve old facts; failures preserve last-known records; every official displayed fact traces to a source version; a contractor example is backed by a real award/contract. Parser tests or fictional fixtures alone do not satisfy these gates. A documented local scheduled-job run is valid development evidence here; deployed scheduler execution must be verified again in Stage 09 and before release. Identify the environment explicitly.

### Stage 07 — Inclusion, low-data and offline recovery

Complete English/Hindi journeys, PWA installation, lazy images, low-data list mode, accessible forms/map alternatives, cached shell and durable draft queue. Make foreground reconnect/manual retry idempotent. Include photo blobs, expired-auth recovery, browser restart, local-storage failures, rejected submission and update/cache invalidation tests.

**Gate:** a queued text/photo observation survives browser restart and submits exactly once after reconnect/sign-in; validation failure remains editable; low-data mode does not auto-download evidence; 360px layouts and Hindi labels/errors work; private data does not leak through shared caches. Offline capabilities are described precisely.

### Stage 08 — National coverage and capacity completion

Execute the validated national basemap/locality/road-index deployment path using the minimal staging deployment established from Stage 03. Record source dates, manifests, storage, quotas, import health and actual geographic coverage. Validate representative urban/rural/remote and northern/southern/eastern/western/northeastern areas plus union territories using the licensed source's supported extent. Display known omissions. Preserve stable identities during updates and national imports. If staging accounts or capacity funding are still unavailable, complete local national-data checks but leave deployed-capacity acceptance BLOCKED.

**Gate:** national geography/search/road selection and snapping are demonstrated independently of basemap rendering, with automated coverage checks and human sample review; source refresh has a workable procedure; deployed capacity has headroom and a budget owner. A pilot-only geometry database cannot pass this stage under a national-coverage label. OSM incompleteness remains openly described.

### Stage 09 — Deployed staging, security and recovery

Complete and harden the existing staging runtimes: secrets outside chat/repository, R2 permissions/CORS/range requests, auth email/redirects, jobs, monitoring, rate limits, headers and backups. Verify that the actual deployed scheduler refreshes the real official source; local job success does not prove that deployed scheduling works. Review authorization/private views/functions, malformed input, upload abuse, direct data access and ingestion URL restrictions. Exercise account/content deletion, retention jobs, failure alerts and reporting/source kill switches. Restore database plus required media/source objects into a clean environment; database-only backups are insufficient for objects.

**Gate:** real staging flows pass through actual services; no raw private data or held media is exposed; admin MFA works; one restored road/incident/source timeline and media reference is verified; rollback and alert paths are exercised. Checks blocked by missing accounts remain blocked, while independent work continues.

### Stage 10 — Readiness review, controlled pilot and production

Review all release gates below and both complete loops using the actual deployed app. Run mobile/weak-connection usability cases, including a real inexpensive Android device when available. Record any device testing unavailable rather than claiming emulation proves it. Fix failures, run a controlled real urban/rural pilot and verify moderation/source operations.

Prepare the concrete deployment, domain/DNS plan, preview link, migration/backups, spend estimate and rollback before requesting the owner's public publication/spending decision. After that decision, apply production configuration and rerun key smoke tests. Do not rewrite earlier failed evidence as successful production results.

**Gate:** all required release gates pass; actual contacts/owners/accounts exist; no high-impact defects remain; production URL and deployed revision are recorded. Public launch must not depend on an unreviewed fixture data feed or missing moderator.

## 7. Release acceptance ledger

Record each as PASS, FAIL or BLOCKED with evidence and environment. IMPLEMENTED BUT UNTESTED is not PASS.

| ID | Required observable result |
|---|---|
| R01 | National basemap, locality discovery and canonical road lookup have separate coverage proof and visible limitations |
| R02 | A new mobile user finds/selects a road, submits an observation, refreshes and finds the durable shareable result |
| R03 | GPS denied, ambiguous roads, no match, map failure and lost network each offer working recovery |
| R04 | Duplicate suggestions preserve separate nearby incidents; confirmed same-problem evidence retains each report |
| R05 | Self-corroboration, repeated account action, identical media and submission retries cannot inflate evidence counts |
| R06 | Official completion and a newer community excavation coexist with distinct source/verification labels |
| R07 | Repair, recurrence, old-late submissions and conflicting observations preserve a truthful history |
| R08 | Reimports/source reruns preserve identity/history; changed source versions remain auditable |
| R09 | At least one real official feed refreshes automatically and one real award/contract supports a contractor/work link |
| R10 | Every official claim has source URL, publisher, retrieval/publication information, licence and reviewed matching provenance |
| R11 | Moderator-only actions reject ordinary/anonymous clients, including direct database/API attempts |
| R12 | Public APIs/objects/caches expose no email, private roles, raw EXIF, private originals or held/rejected content |
| R13 | Processed photo publication, redaction/removal, invalid uploads and failed processing work safely |
| R14 | Offline text/photo drafts survive restart and expired auth; reconnect/retry creates exactly one durable result |
| R15 | English/Hindi full journeys, 360px layouts, keyboard access and map-free low-data mode pass |
| R16 | Account/content erasure, retention and correction/grievance workflows work with actual operator details |
| R17 | Clean-environment restore verifies database history and media/source objects; rollback is usable |
| R18 | Source failure, budget/operational alerts and moderation queues have working owners; private staging and production config are separated |
| R19 | Both real community and official loops pass on deployment; fixtures are absent from production fallback paths |
| R20 | Production revision/URL, national coverage limits, operating cost assumptions and owner publication decision are recorded |

A useful private preview may exist before all gates pass. Label it as a private preview and list outstanding gates. A narrower community-reporting pilot without the official loop is a separate scope decision; do not quietly call it the completed accountability MVP.

## 8. Required Antigravity response packet

Save an evidence packet for each stage as an internal checkpoint. Do not end the run or wait for the user after writing it. Each packet should contain:

1. **Stage and status:** PASS / NEEDS REPAIR / BLOCKED. Distinguish implemented from verified.
2. **Changes:** paths, purpose, migrations/configuration changes and local revision if one exists.
3. **Acceptance table:** gate ID, PASS/FAIL/BLOCKED, evidence path and environment.
4. **Checks:** actual commands/checks, exit outcomes, relevant browser journeys and screenshots for interface work. Explicitly list checks not run and why.
5. **Data truth:** real versus fixture data, source/record URLs, retrieved date, licence/access evidence and coverage gaps. Never include credentials or private account data.
6. **Review instructions:** local startup or deployed preview, precise path through the changed feature and evidence locations.
7. **Defects/dependencies:** severity, reproduction, impact, exact owner action if required, and which gates depend on it.
8. **Next bounded task**, which Antigravity should start automatically unless it is actually blocked.

Maintain `docs/build-status.md` from the foundation stage onward with completed stages, unresolved gates and current revision. Save supporting evidence under `docs/evidence/stage-XX/`, excluding private uploads and secrets. Do not generate screenshots of confidential provider settings.

Fixtures are allowed in isolated tests and clearly labelled development demos. Empty live data must show an honest empty state. Missing keys must produce a configuration error. Never simulate successful auth, uploads, submissions, imports or contractor facts. A successful build proves packaging, not feature completion.

Perform the implementation, self-test, adversarial review, repair and final verification loop in `ANTIGRAVITY_ONE_SHOT.md`. Continue through later stages without requiring relay prompts. At the end, return one complete evidence-backed report that distinguishes local, staging, publication-ready and production outcomes, with every remaining dependency or failed gate visible.

## 9. Primary references checked while planning

These establish technical constraints and research leads, not that specific integrations are already working. Recheck relevant terms and quotas when configuring providers.

- [Next.js backend-for-frontend and static-export limitations](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/): supported runtime path and adapter behaviour.
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis): spatial extension and dedicated-schema guidance.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): database authorization requirements.
- [Supabase pricing](https://supabase.com/pricing): at planning time Free lists 500 MB database size, inactivity pausing and no automatic backups. National fit needs measurement; recovery must not assume a paid-plan feature.
- [Protomaps PMTiles cloud storage](https://docs.protomaps.com/pmtiles/cloud-storage): range/CORS requirements for object-hosted archives.
- [Geofabrik India extracts](https://download.geofabrik.de/asia/india.html): real OSM extract metadata and subregion discovery; compressed input size is not PostGIS capacity.
- [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/): public community tile servers are not an offline/bulk distribution path.
- [OGD terms of use](https://www.data.gov.in/terms-of-use) and [GODL text](https://www.data.gov.in/sites/default/files/NDSAP_OpenDataLicense.pdf): resource-specific licence metadata and attribution.
- [Ministry of Rural Development GIS announcement](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=1808291&lang=2&reg=48): an official lead for GeoSadak open data. It does not prove today's live export, automatic work/contract fields or contractor access.
- [GeoSadak open-data entry point](https://geosadak-pmgsy.nic.in/opendata): browsing during planning did not establish usable live access; Antigravity must verify actual availability and terms rather than treating the URL as a completed integration.

