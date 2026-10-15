# Real official ingestion

The scheduled source is the Department of Economic Affairs PPPAC Karnataka
project register:
https://www.pppinindia.gov.in/pppac-statewises/pppac-projects-list_Karnataka

The adapter fetches the official HTML on every run. It validates the table
headers, filters the Roads subsector, bounds response size and retry count,
and archives the exact response bytes in the private R2 quarantine bucket
under a full SHA-256 key. Network, parsing and storage failures fail the job
and record a failed run. There is no demo fallback.

Project approval costs are stored as `approved_project_cost_inr` in the
immutable source payload, not as a contract value or an expenditure.
The register does not establish a contractor, start date, completion date,
or current road condition. Those fields remain unknown. Historic highway
numbers and chainage without a district or authoritative segment geometry
go to review; the importer creates no guessed pins or segment associations.
The public provenance endpoint is `/api/v1/sources/pppac/karnataka`.

Stable identity uses project name and meeting identifier, excluding the
display row number and mutable costs. Source revisions append immutable
versions and audit events; reverts reuse historical evidence while updating
the current projection. An unchanged rerun adds no facts or events. An
advisory lock prevents concurrent imports. Each batch commits atomically.

## Test isolation

Synthetic verification scripts require `TEST_DATABASE_URL`, with a dedicated
local/private database named `theroadproblem_*_test`. They do not fall back
to `.env.local` or a hosted database. `.env.test.local` may configure a local
test database. Tests use separate local photo storage and discard R2
credentials. Citizen and synthetic-tender checks roll back their DB writes.

The scheduled workflow has a separate PostGIS service-container job for
these tests. It receives no production secrets. The production job depends
on that job and runs only the real adapter. `dry_run` genuinely fetches and
parses without inserting records or writing storage objects.

Run locally:

```
npm run test:real-ingestion:db
npm run verify:isolated
node --experimental-strip-types --test tests/real-ingestion.test.mjs tests/test-database-safety.test.mjs
```

Use manual workflow input `verify_flow=true` for the first production import
and unchanged rerun verification. Its artifact proves counts, provenance,
archive checksum, and that citizen reports were not created. Do not run the
old `verify:ingest` or `verify:citizen` commands with production credentials.

The former PMGSY representative-data endpoint returns 410. It must not be
treated as a live government API. News, CPPP and PMGSY sources are not
scheduled until their real adapters are separately proven.

Public derivatives use the configured `R2_PUBLIC_URL`; raw evidence and
government response archives stay in the private bucket. The current r2.dev
public delivery URL is rate-limited; a custom domain is appropriate before
production photo traffic grows.
