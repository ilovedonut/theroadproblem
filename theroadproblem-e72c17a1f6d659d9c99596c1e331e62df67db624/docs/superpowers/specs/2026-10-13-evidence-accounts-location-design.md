# Verified accounts and location-aware evidence

## Intent

Let citizens submit photographic evidence at a confirmed map location, using email accounts verified by a one-time code. Let signed-in citizens propose corrections to existing issue locations without silently replacing evidence or moving another person's report.

## Scope and experience

Browsing remains public. Contributors can prepare a report before signing in; submission requires a verified session. Preserve the draft through sign-in. The form includes a tap-to-place and draggable map marker, explicit location confirmation, optional device GPS with accuracy feedback, road selection, photograph capture or gallery selection, preview, removal/replacement, details, and a combined review screen. Never treat the default map center as a confirmed location.

## Accounts

Use Supabase Auth email OTP rather than custom code generation or a parallel JWT identity system. Enter an email, request a code, enter the code, and establish a server-validated session. Handle expired/invalid codes and resend cooldowns without losing the draft. Email stays private; public attribution uses a display name. Roles are assigned by trusted server administration. The server obtains contributor identity from the verified session, never from a submitted reporter ID. Configure actual email code templates and a production delivery provider before claiming deployed OTP works.

## Evidence and recovery

Keep the confirmed location independent of photograph metadata. Validate coordinates and supplied road associations on the server. Preserve existing nearby-incident checks. Compress photos for upload, but retain trusted server validation and metadata stripping. Originals remain private; only approved derivatives are public. Authenticate attachment operations and verify report ownership. Show processing/upload failure explicitly. A stable submission key prevents duplicate reports; retry a failed attachment against the created report. Retain the photo until upload success or explicit removal. Offline drafts preserve evidence and report state; storage failures are visible.

## Location corrections

Any verified contributor may open an issue, choose Suggest location correction, see its current pin, move a proposed pin, enter a required reason, and submit. Correction records retain issue ID, old and proposed coordinates, requester, reason, timestamps, review status, reviewer, and review reason. The public pin remains unchanged while pending. Moderators accept or reject proposals. Acceptance atomically checks the issue location has not changed since the proposal, updates the displayed location and relevant road association, and appends an audit event. Stale proposals require renewed review. Original observation coordinates remain immutable. An unrelated location should become a separate issue rather than relocate existing evidence. Do not automatically rewrite contractor or work-package associations on correction.

## Deployment and boundaries

Use the existing application and PostGIS/R2 architecture. Verify deployment compatibility and session handling in the actual runtime. Account credentials and emails never enter public responses. Protect all consequential write paths, including reports, attachments, corroboration, repair confirmation, and correction moderation, with server validation and appropriate permissions. Existing anonymous submissions retain history but are not automatically assigned to newly created accounts. Coordinate changes with other work already in the shared checkout and preserve unrelated edits.

## Acceptance evidence

- A real email code can create/sign into an account; invalid and expired codes fail safely.
- Public browsing works; unauthenticated writes fail; another user's identity or attachment cannot be supplied to bypass ownership.
- Manual marker selection works when GPS is denied; invalid URL coordinates are rejected.
- Changing the pin clears stale road/nearby-incident selections.
- A photo can be previewed, replaced, removed, uploaded, and retrieved as an approved derivative.
- Upload failure remains visible; retry does not create another report.
- Originals cannot be retrieved through the public storage domain.
- Corrections remain pending until authorized review; acceptance preserves original evidence and audit history.
- Concurrent/stale corrections do not overwrite newer accepted positions.
- Desktop/mobile layouts, keyboard controls, and error states are checked.

## Delivery prerequisites

Inspect the configured Supabase Auth project, email delivery, current migrations, and application dependencies before implementation. Record environment setup that cannot be completed locally and distinguish local checks from actual deployed/email-delivery verification. This document defines design, not completed functionality.
