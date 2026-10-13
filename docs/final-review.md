# Final Release Audit & Acceptance Ledger: theroadproblem.quest

**Date:** Tue, 13 Oct 2026 10:52:38 GMT  
**Target Revision:** `master-unc`  
**Application State:** Complete Scoped Implementation Verified Locally & On Staging Foundation  
**Readiness Level:** **STAGING_VERIFIED_PILOT_READY**  

---

## 1. Executive Acceptance Ledger (R01–R20)

| Gate ID | Requirement Name | Status | Verification Evidence Path |
|---|---|---|---|
| **R01** | Separate GIS Coverage Layers | **PASS** | `docs/evidence/stage-02/r01-coverage.json` |
| **R02** | Mobile Road Select -> Submit -> Durable Link | **PASS** | `docs/evidence/stage-04/r02-submit.json` |
| **R03** | Fault Tolerance & Journey Resilience | **PASS** | `docs/evidence/stage-03/r03-resilience.json` |
| **R04** | Duplicate Suggestions & Atomic Merge | **PASS** | `docs/evidence/stage-05/r04-duplicates.json` |
| **R05** | Integrity & Anti-Self-Inflation Invariants | **PASS** | `docs/evidence/stage-05/r05-corroboration.json` |
| **R06** | Coexistence of Official Work and Ground Damage | **PASS** | `docs/evidence/stage-06/r06-coexistence.json` |
| **R07** | Repair, Recurrence & Out-of-Order History | **PASS** | `docs/evidence/stage-05/r07-history.json` |
| **R08** | Road Reimport Lineage & Segment Lineage | **PASS** | `docs/evidence/stage-02/r08-lineage.json` |
| **R09** | Real Official Refresh & Genuine Contractor Linkage | **PASS** | `docs/evidence/stage-06/r09-official.json` |
| **R10** | Provenance Transparency & GODL License | **PASS** | `docs/evidence/stage-06/r10-provenance.json` |
| **R11** | Database Authorization & RLS Non-Superuser Enforcement | **PASS** | `docs/evidence/stage-01/r11-rls-roles.json` |
| **R12** | DPDP Privacy Protection & Zero PII Leakage | **PASS** | `docs/evidence/stage-04/r12-privacy.json` |
| **R13** | Media Pipeline EXIF Stripping & Derivative Normalization | **PASS** | `docs/evidence/stage-04/r13-media.json` |
| **R14** | Offline Drafts Persistence & Idempotent Sync | **PASS** | `docs/evidence/stage-07/r14-offline.json` |
| **R15** | Mobile 360px A11y, Low-Data Mode & En/Hi Catalogs | **PASS** | `docs/evidence/stage-07/r15-a11y-i18n.json` |
| **R16** | Account & Content Erasure with Civic Retention | **PASS** | `docs/evidence/stage-10/r16-compliance.json` |
| **R17** | Disaster Recovery pg_dump & Clean Schema Restore | **PASS** | `docs/evidence/stage-09/r17-restore.json` |
| **R18** | Operations Health Monitoring & Kill Switches | **PASS** | `docs/evidence/stage-09/r18-ops.json` |
| **R19** | Integrated Loops: End-to-End Observation & Ingestion | **PASS** | `docs/evidence/stage-10/r19-e2e.json` |
| **R20** | Final Release Audit & Owner Publication Boundary | **PASS** | `docs/final-review.md` |

---

## 2. Adversarial Findings Discovered & Resolved

1. **PostgreSQL Superuser RLS Bypass:**
   - *Finding:* Connecting as `postgres` bypasses Row Level Security even when `FORCE ROW LEVEL SECURITY` is applied.
   - *Resolution:* Created dedicated unprivileged role `app_user` in migration 001 and verified RLS enforcement through nonprivileged connection.

2. **Concurrent Idempotency Race Condition:**
   - *Finding:* Overlapping submissions checking `SELECT` before `INSERT` could hit unique violation errors under concurrent stress.
   - *Resolution:* Implemented `pg_advisory_xact_lock(hashtext(reporter_id || ':' || idempotency_key))` and an exception handler in `submit_report_atomic` returning existing records idempotently.

3. **Sharp EXIF Stripping:**
   - *Finding:* Passing `.withMetadata({ exif: {} })` left an empty EXIF segment in WebP derivatives.
   - *Resolution:* Omitted `.withMetadata()` completely, allowing Sharp to default to stripping all EXIF GPS metadata.

4. **Windows Libvips File Handle Locks:**
   - *Finding:* Calling `sharp(path)` locks the local Windows file handle until garbage collection, causing `fs.rmSync` to throw `EPERM`.
   - *Resolution:* Read raw file buffers into memory with `fs.readFileSync(path)` before passing to Sharp.

5. **PostgreSQL Configuration Parameters:**
   - *Finding:* Parameterized `SET LOCAL request.jwt.claim.sub = $1` failed parsing.
   - *Resolution:* Switched to `SELECT set_config('request.jwt.claim.sub', $1, true)`.

---

## 3. Operational Model & Cost Envelope

- **Hosting & Compute:** Runs on free tiers (Vercel Hobby / Cloudflare Pages + Supabase Free Tier PostGIS).
- **Storage:** Cloudflare R2 / Local WebP storage with 1600px derivatives (quarantined originals isolated).
- **Projected Operating Cost:** **₹0 / month** (Within the ₹2,500 hard operational cap).
- **National Coverage Limits:** Pilot coverage actively indexed for **Bengaluru Urban & Ramanagara District, Karnataka**. Unindexed corridors seamlessly support coordinate-based reporting with unmatched corridor fallback.

---

## 4. Consolidated Owner Action Boundary for Production Deployment

To publish the application publicly to live internet traffic, the repository owner must:
1. Provide Cloudflare Pages / Vercel production deployment tokens.
2. Provide Supabase Hosted PostgreSQL + PostGIS connection string in production `.env`.
3. Provide Cloudflare R2 bucket credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) for distributed derivative hosting.
4. Delegate production DNS records for `theroadproblem.quest` to the production edge.
