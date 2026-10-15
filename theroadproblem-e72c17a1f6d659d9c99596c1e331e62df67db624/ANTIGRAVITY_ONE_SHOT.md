# theroadproblem.quest — One-shot autonomous implementation brief

Prepared 11 October 2026. This is the active execution brief requested by the owner.

## 1. Assignment and instruction precedence

Work in `C:\Users\shiva\Desktop\the road problem`. Read `deep-research-report.md` and `ANTIGRAVITY_PLAN.md` completely, inspect all existing files and applicable project instructions, then implement the full scoped road-accountability MVP.

The user has changed the execution method from relayed stage prompts to **one autonomous run**. The old prompt's Stage 00-only restriction and per-stage stop/review requests are superseded. Keep the roadmap's product scope, corrected domain model, stages, defaults and R01–R20 acceptance requirements. Treat them as internal work and verification checkpoints. Do not stop after writing a plan, scaffolding the app, making screenshots, passing a build or finishing one phase.

Make ordinary reversible implementation decisions yourself and continue through all feasible work. Keep consequential publication/spending and genuine access-dependent work explicit. Do not invent credentials, owner contacts, official data, successful checks or permission to access restricted sources.

The destination is a working application with real persistence, complete user journeys, source-backed official records, documented coverage, meaningful tests, reviewed implementation and honest readiness evidence. A polished interface with simulated services does not meet this assignment.

## 2. Establish the complete work inventory before coding

Reinspect the folder and Git state; reuse sound existing work. Do not overwrite unrelated changes. Check available Node/package-manager versions, database/auth runtime, container availability, local object-storage options, browser-testing tools and authorized provider configuration without exposing secrets.

Create or update these documents before substantial implementation:

- `docs/build-plan.md`: architecture/runtime decision, complete requirement-to-task mapping, dependency graph, task ownership when parallelizing, and explicit acceptance outcomes.
- `GATES.md`: application completion ledger mapping R01–R20 and any additional consequential requirement to its check or manual evidence. The separate `docs/planning/one-shot/GATES.md` belongs to Codex's planning handoff and is not application evidence.
- `docs/build-status.md`: current phase/task, actual revision, completed work, unresolved findings, next ready tasks and exact resume instructions.
- `docs/resume.md`: a short interruption-safe checkpoint with actual service state, current revision, next executable task, relevant commands and unresolved dependencies; never claim an ended run is still working in the background.
- `docs/dependencies.md`: external dependency, affected tasks/gates, alternatives tried, precise owner action and independent work that can continue.
- `docs/source-registry.md`: real source identities, exact URLs, retrieval/licence evidence, fields, geographic/date coverage, verification state and access limits.

Do not stop for approval of these documents; use them to control the build. Resolve contradictions in the research using the corrected roadmap and record significant decisions. Do not silently reduce required scope or replace a difficult gate with an easier one.

For each runnable gate, state its actual command, expected assertions/result, test environment and evidence path. A check must directly exercise the outcome. A fixed success printout, empty test suite or copied metric cannot certify a feature. Manual evidence is appropriate only where a command cannot establish the outcome; it must identify what was observed and by whom. Preserve blocked/failed requirements in the ledger.

Do not require a particular gate-checking plugin to exist. Use already available tooling or ordinary repository scripts and tests. Inspect inherited executable checks before running them. Do not install stop hooks or modify unrelated tool settings as part of this assignment.

## 3. Implementation order and automatic progression

Follow roadmap Stages 00–10, splitting them into small internal tasks as needed:

1. Verify real basemap, road/locality inputs, official-source candidates and award evidence; select a coherent deployment path and national-capacity measurement method.
2. Build the reproducible foundation, corrected schema, migrations, auth/roles, transactional mutations and event projections.
3. Import real urban/rural road samples, establish stable identity/versioning, indexed spatial queries and measured capacity inputs.
4. Build map/list discovery, actual road selection, shareable detail/timeline pages and an early protected staging path when configuration exists.
5. Complete reporting, private media processing, durable drafts, duplicate candidates and database-backed persistence.
6. Complete corroboration, privacy review, moderation, merges, disputes, appeals, repairs and recurrence.
7. Complete one real official ingestion loop, scheduled refresh and a genuine award/contract-backed contractor example.
8. Complete English/Hindi, mobile accessibility, low-data mode, PWA installation and offline/reconnect recovery.
9. Execute and verify the national coverage/capacity path separately from the basemap.
10. Complete staging operations, security/privacy review, deletion/retention, monitoring, source failures, backups and demonstrated recovery.
11. Review all release gates, run both real end-to-end loops, fix defects, prepare publication, and verify production only when that external action is authorized.

Advance automatically after internal verification. Use a dependency queue rather than treating an unavailable hosted account as a reason to stop local reporting, moderation or offline implementation. A failed correctness gate blocks the dependent task; repair it before building on an invalid contract. Independent ready tasks may still proceed.

### Required domain rules

- Incidents are shared problem episodes; reports are individual observations. Preserve every report when merging incidents.
- Official work status, observed condition, incident lifecycle, verification, moderation/publication and freshness remain distinct. No observations means unknown, not healthy.
- Several incidents and works can coexist on a segment. Resolving one problem or marking official work completed does not resolve unrelated damage.
- Work-to-segment and work-to-contractor relationships are many-to-many and sourced. A contractor's association with a package is not proof of blame for a community observation.
- Road and segment UUIDs survive source refreshes through explicit mappings, geometry versions and split/merge lineage; road names and generic basemap feature IDs are not durable keys.
- Use server-derived actor identity, transactionally consistent events/projections, unique evidence constraints and payload-bound idempotency.
- Old observations submitted late cannot silently override newer assessments. Conflicting evidence must remain inspectable.
- Private personal/content payloads can be erased or redacted; civic audit events must not permanently duplicate personal information.
- Basemap, canonical road-index and official-data coverage each have their own evidence and user-visible limits.

### Architecture and current documentation

Use the roadmap's recommended Next.js/TypeScript, MapLibre, Postgres/PostGIS, Supabase Auth, R2 and supported Next.js hosting path unless concrete environment findings justify a change. Record a coherent alternative instead of mixing incompatible deployment assumptions. No static export with request-dependent server routes/auth. Avoid unused microservices and speculative adapter scaffolds.

Before implementing a provider feature, consult its current primary documentation and relevant changelog, confirm the installed tool's actual commands and pin compatible application dependencies with a lockfile. Use a supported Node/runtime version. For Supabase, check server-auth integration, Data API grants plus RLS, private role authorization, view/function privilege behaviour, session deletion/revocation and backup scope. Never relax authorization merely to make an error disappear.

Source audit is bounded and purposeful: start with OSM/locality inputs and up to three promising official candidates. If candidates are unavailable or unsuitable, record exact evidence and broaden only when another concrete lead exists. Do not spend the entire run searching for a mythical nationwide contractor API. Implement the reviewed adapter framework and truthful empty/error states while preserving the unfulfilled live-data gates.

## 4. Work every substantial task through four passes

### Pass A — Complete implementation

Implement the whole task through UI, handler/API, authorization, database/storage, derived consumers and errors. A button, setting, form or queue entry needs a functional result and recovery path. Do not leave core behaviour as console messages, fake promises, hard-coded arrays, disabled actions or TODOs.

### Pass B — Targeted verification

Run the meaningful checks for that task against its real dependency wherever available. Use isolated test databases, accounts and object namespaces. Never reset or destructively seed a live user database to run tests. Identify exactly what is real, test-seeded, mocked or emulated.

### Pass C — Adversarial review

Review the implementation against the requirements and failure cases, not just the author's summary. Trace consequential actions from entry point through persistence, permissions, downstream display, retries and role handoffs.

If Antigravity supports independent agents or a fresh reviewer context, use read-only reviewers for product/UX completeness, database/security correctness, and source/deployment readiness. Give each the requirements, current files/revision, checks and evidence; ask it to look for counterexamples. Parallelize independent reviews, reconcile all findings and retest fixes. Assign disjoint file ownership for parallel implementation; the integrator verifies shared interfaces.

If fresh reviewers are unavailable, run explicitly separate critic passes. Label them self-review. Do not describe the same agent rereading its own code as independent review.

### Pass D — Repair and reverify

Record every actionable finding with severity, reproduction, affected requirement and fix. Repair defects and rerun affected checks plus relevant integration/regression checks. Repeat while a full pass finds new correctness, usability or required-scope defects. Cosmetic preferences are not a reason for endless rewrites; required gates and concrete defects control the work.

After two or three failures of the same approach, inspect the cause, current docs and logs, then try a reasoned alternative. Do not repeatedly run an unchanged failing command, weaken assertions or suppress diagnostics to produce green output.

Do not advance a gate on screenshots alone. Final evidence must reflect the current revision and configuration, not a passing version that was later changed.

## 5. Meaningful verification matrix

Create portable repository checks appropriate to the implementation. Do not claim a script exists or passed until it actually does. Keep fixtures isolated from live/demo mode. Required checks must not silently skip when dependencies are missing.

### Foundation and database

- Fresh dependency install using the lockfile; lint, type checks and production build; clean database migration/reset in an isolated environment.
- Real Postgres/PostGIS transaction tests: incident/report/event atomicity; rollback on failure; payload-bound idempotency; consistent projections; out-of-order observation handling.
- Concurrent requests: at least 20 overlapping identical submissions through separate request/connection contexts, multiple corroborations, competing A-to-B/B-to-A merges and conflicting state transitions. Verify one logical durable submission/event sequence, no merge cycles/orphaned evidence and correct redirects after completion, not just response codes.
- Role matrix: anonymous, reporter A, reporter B and moderator through real user JWTs/nonprivileged roles. A service-role-only test cannot prove RLS.
- Negative cases: editing another account's private data, modifying protected roles/states, granting oneself moderation through editable metadata, reading held content and invoking privileged functions/views directly.
- Positive controls: prove the approved public content and owner's private content are readable by the intended role before trusting a denial test. A disconnected API or missing object is not evidence that privacy controls work.
- Confirm session/role revocation and deletion behaviour for sensitive operations using the chosen auth design. Privileged secrets stay out of browser bundles, logs and evidence files.

### Geometry, identities and national coverage

- Import licensed real urban and rural road samples; record input provenance, feature counts, source dates and processing outcome.
- Check metre-based distance and candidate ranking, no plausible match, user correction, intersections, service lanes, bridges/tunnels and parallel carriageways.
- Reimport unchanged and changed/split/merged source geometry; old URLs, reports and timelines remain valid without duplicate roads/events.
- Inspect query plans and measured table/index sizes using representative data. Report latency and hardware/network assumptions. A tiny fixture's performance or compressed file size cannot prove national capacity.
- Validate separate basemap, locality and road-index coverage using source-derived sample selection across Indian regions and supported union territories, not only hand-picked successful locations. Keep omissions visible.
- Verify deployed PMTiles range responses, CORS, cache behaviour, style layers, fonts and sprites. The application must not depend on unauthorized public OSM bulk/offline downloads.

### Community loop and user journeys

- At 360px width: discover locality -> select real road -> report -> confirm duplicates/road -> attach evidence -> submit -> reload/fresh browser context -> retrieve persisted incident via stable URL.
- Confirm filtered map/list queries, correct result counts, deep links/back navigation and no data/wrong road/failed search states.
- Two qualifying test accounts contribute to one incident while separate nearby problems remain separate. Own actions, transport retries and reused media do not inflate corroboration.
- Moderator review/merge/reject/remove/dispute/correct/appeal; citizen sees accurate resulting state and retains source/history. Queues have functioning actions and empty/error states.
- Repair evidence -> reviewed resolution -> later recurrence; old history persists. Official completion plus recent field excavation displays both assertions and sources.
- Inventory every production route, visible control, consequential setting and supported role journey. Trace controls to real effects, persistence and consumers. Remove or clearly defer unused controls; do not leave decorative functionality.

### Media and privacy

- Ownership-bound signed upload and completion; accepted images; wrong MIME/content, malformed image, oversized input/decoded dimensions and cross-account object access.
- Server-side metadata removal/re-encoding, explicit private quarantine, approved derivative publication and manual redaction workflow where needed.
- Repeated/failed processing never publishes private originals. Held/removed images remain inaccessible through direct storage URLs, API variants and shared caches; approved images remain accessible.
- Orphaned uploads, removal/deletion, cache invalidation and retention actually run. Do not claim a malware/face/plate scanner is implemented because a placeholder function exists.

### Official source loop

- Fetch permitted real source records; retain reproducible provenance, specific terms, source/publication/retrieval times and reviewed matches.
- Inspect a genuine award/LoA/contract for the contractor example. Tender notices, invented companies and inferred responsibility cannot satisfy that gate.
- Unchanged rerun creates no duplicate normalized facts/events. Controlled version-change fixtures prove history handling and are labelled as fixtures; they do not imply the live source changed.
- Real initial fetch plus actual scheduled refresh evidence, including the deployed trigger/runtime before publication. A manual parser test is not automatic ingestion.
- Fetch outage, invalid document/schema, partial data, ambiguous match and retry/backoff preserve last-known facts and show freshness/health. Corrections retain source versions and reasons.

### Offline, inclusion and interface review

- PWA install/shell where supported; drafts with photo blobs survive reload and browser restart.
- Queue a report offline; reconnect; drop the server response after a successful commit; retry. Verify exactly one durable submission and an honest queue result.
- Expired auth, validation failure, changed account, browser quota error and explicit draft deletion have recovery behaviour. Unsent personal drafts do not leak to a different account.
- English/Hindi cover core journeys, validation/errors, dates and moderation; original citizen text stays intact.
- Keyboard navigation, focus, form labels, contrast, touch targets, screen-reader announcements and map-free interaction. Review actual rendered mobile/desktop screens for clipping and unreadable states.
- Slow connection, GPS denied/inaccurate, WebGL/tiles unavailable and empty data provide useful list/manual-entry/draft paths. Low-data mode prevents automatic photo downloads.
- Real inexpensive Android testing when available. Record emulation as emulation and missing real-device checks honestly.

### Deployment and operations

- Real staging runtime, auth redirects/email, data grants/RLS, object permissions, tile transport, media jobs and deployed scheduler; environment-specific smoke tests.
- Rate limits, request/upload bounds, source-fetch URL restrictions, protected moderator operations, security headers and sanitized errors/logging.
- Actual failure-alert path, source health, reporting/source kill switches and budget controls with a named owner. Do not send messages to external people without owner authorization; use local/test sinks for notification tests.
- Database backup and required object backup; restore into a clean isolated environment. Inspect at least one complete road/incident/source timeline and its media after restoration. A backup file alone does not establish recovery.
- Migration/release rollback rehearsal and account/content erasure/retention, with actual operator policy/contact details before public use. Database backups do not automatically cover external object storage.

## 6. Evidence and checkpoint discipline

Save stage evidence under `docs/evidence/stage-XX/` and review findings under `docs/reviews/`. Record exact commands, exit outcomes, environment, input/source classification, actual revision/configuration and relevant screenshots. Keep evidence concise and reproducible; exclude secrets, original private photos and real citizen personal data.

Create genuine repository test entry points for the suites the app needs, such as database, API/authorization, concurrency, browser journeys, data coverage and deployed smoke checks. Those names describe scripts to implement, not pre-existing commands. Required suites must exit nonzero on failed assertions and report required skipped/unrun cases as BLOCKED. Review the test oracles themselves; missing data, a disconnected service or a swallowed error must not masquerade as success.

After each milestone update build status and the gate ledger. If local Git is available, checkpoint coherent changes without pushing or publishing unless authorized. If Git writes are unavailable, retain the actual files and a file-hash inventory. Keep user changes distinct and never discard them to simplify a checkpoint.

Evidence must correspond to current implementation and inputs. After a material change, rerun the checks it affects; a hash proves identity, not behavioural correctness. Before final reporting, run the required integrated release suite on the final revision/configuration and verify each manual/deployed claim again where necessary.

Context compaction is not a stopping point. Resume from the current checkpoint. If an unavoidable execution/session limit prevents further work, save the exact unfinished tasks, commands, state and resume instructions and report the work as incomplete. Do not relabel incomplete work as done.

## 7. External dependencies and honest stopping rules

Surface required provider setup, source access, national capacity funding, operator/moderator contacts, policy review, real-device/community pilot evidence and domain ownership early. Check whether existing configuration is actually usable; do not assume this chat's connected accounts are accessible to Antigravity.

For a real blocker: capture the failing capability, attempts/evidence, affected gate IDs, safe alternatives and exact owner action. Continue every unaffected task. Use real local services for local verification when hosted access is missing. If a required local service is unavailable too, mark those checks BLOCKED; mocks may test isolated logic but cannot satisfy real-service gates.

Do not use fake fixtures as a hidden fallback for absent live data or credentials. Empty live datasets and unconfigured services need truthful states. Developer/test seeds may be clearly labelled and isolated.

Do not incur charges, change unrelated infrastructure, publish production or expose citizen submissions publicly without the owner's authorization for that concrete action. Prepare the complete reviewable preview/configuration/spend/rollback first. This is a final external-action boundary, not permission to pause every internal phase. Do not ask again for actions already authorized in the session.

Allowed stopping conditions:

1. The complete scoped implementation and review are finished and all gates for PRODUCTION VERIFIED pass; or all prerelease requirements pass and only the concrete owner publication decision remains (READY FOR PUBLICATION). LOCAL VERIFIED and STAGING VERIFIED are progress classifications, not stopping conditions while required executable work remains.
2. Every feasible implementation/review/repair task is complete, and all remaining work depends on documented external input/access. Report DEPENDENCY BLOCKED with exact gates and owner actions; never fully complete.
3. An unavoidable execution limit or unrecoverable environment failure prevents further work. Checkpoint and report INCOMPLETE with the precise resume path.

Ordinary errors, a successful build, missing credentials for one unrelated service, or reaching the end of a phase are not stopping conditions.

## 8. Final adversarial audit and readiness report

Before finishing, reconcile the original scoped requirements with the actual implementation and R01–R20. Verify no required gate was removed, weakened, skipped, converted to manual without justification or passed using stale evidence. Inspect unresolved TODOs, mock fallbacks, dead controls, missing handlers, placeholder policies, unowned queues and skipped tests; classify each by real impact rather than merely finding a string.

Perform a fresh critic review of all production surfaces and the two complete real loops: community observation/evidence/repair, and official import/package/contractor/provenance. If independent reviewers are available, obtain final verdicts after repairs. Otherwise accurately report self-review. The final integrated tests must include meaningful assertions against real services and authorization roles.

Report verified readiness by environment:

- **LOCAL VERIFIED:** required local behaviour passes real local-service checks; hosted/national/operator gaps remain listed. This is not public-release readiness.
- **STAGING VERIFIED:** deployed staging checks pass for the actual demonstrated coverage and configuration. This alone does not waive missing national/source/operator gates.
- **READY FOR PUBLICATION:** all product/data/national/security/recovery/operator gates needed for public use pass, and the concrete preview, deployment, spend and rollback are prepared. Only the owner's publication action remains. R20's production portion is still pending.
- **PRODUCTION VERIFIED:** publication was authorized, the real production URL/revision exists and production smoke/operational checks pass, including R20.
- **DEPENDENCY BLOCKED / INCOMPLETE:** required outcomes are unverified; list exactly which and why. Never describe these states as fully ready.

Save the final audit as `docs/final-review.md`. The final response must contain:

1. Actual status/readiness and current revision, plus local startup or preview/production URL.
2. Implemented scope and architecture/runtime decisions, with significant deviations explained.
3. R01–R20 table with PASS/FAIL/BLOCKED, environment, check and evidence path; measured totals must reconcile with the rows.
4. Test/review results, reviewer independence, defects found/fixed, remaining defects and checks not run.
5. Real-source/licence and national coverage summary, clearly separating live data from test fixtures and estimates from measurements.
6. Recovery/operations evidence and precise setup/publication/owner dependencies, with secret values omitted.
7. Locations of the build plan, status, gate ledger, source registry, reviews, evidence and resume instructions if unfinished.

Do not finish with a generic claim that everything works or an offer to do required remaining work later. Either prove the requested outcome or hand off the specific unmet dependencies honestly after completing all independent work.

## 9. Primary references for the additional review checks

The roadmap contains the broader sources. These current primary references inform the Supabase-specific checks above; implementation must recheck the relevant installed versions and docs:

- [Supabase changelog](https://supabase.com/changelog)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [Database functions and privileges](https://supabase.com/docs/guides/database/functions)
- [Database backup scope and restoration](https://supabase.com/docs/guides/platform/backups)
