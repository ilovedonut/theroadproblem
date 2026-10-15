# Implementation plan

Approved design: ../specs/2026-10-13-evidence-accounts-location-design.md

1. Add server-validated Supabase email OTP accounts, secure cookie sessions, resend/error handling, and account navigation. Keep provider configuration explicit and secrets server-only.
2. Protect report, media, corroboration, repair, and moderator operations with verified identity and trusted roles. Validate report coordinates, attachment ownership, and replay ownership.
3. Add a reusable location picker with draggable/tappable marker, GPS accuracy, keyboard/manual alternatives, and map failure recovery. Integrate photo camera/gallery previews, draft preservation, and reliable upload retry into the report flow.
4. Add a location-correction ledger with RLS, pending proposals, authenticated creation, moderator review, row locking, stale-location checks, and atomic history-preserving updates. Provide issue and moderation UI.
5. Connect offline drafts and personal contributions. Preserve photos on failed uploads and stable idempotency keys across retries.
6. Run type/build checks, meaningful auth/validation/correction tests, and browser checks where available. Verify database migrations in an available local/test database. Report production OTP delivery and deployment verification separately if not configured.

Execute in this chat, preserving existing uncommitted changes from Antigravity. Do not deploy, send test emails to other people, or claim production verification without evidence.
