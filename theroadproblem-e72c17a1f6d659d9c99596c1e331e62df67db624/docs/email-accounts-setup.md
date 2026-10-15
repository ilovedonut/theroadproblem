# Enable verified email accounts

The app uses Supabase Auth email OTP through its REST API. Tokens are held in HTTP-only cookies and each protected request validates the user against Supabase Auth. Roles are read from the application database; editable Auth metadata never grants moderator access.

## Project setup

1. Set server environment variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the same Supabase project as `DATABASE_URL`. Use a publishable key or legacy anon key, never a service-role key.
2. Enable email sign-in and account creation in Supabase Auth. Configure a production SMTP delivery provider. Do not rely on the restricted default email sender for public launch.
3. Change the Magic Link email template to include `{{ .Token }}` instead of a sign-in URL. The ready-to-copy template is `supabase/templates/email-otp.html`. Configure the confirmation template similarly if enabled for sign-up.
4. Use a short code expiry (10 minutes recommended), six digits, provider rate limits, and a resend interval of at least 60 seconds. The app accepts six to eight digits to match project configuration.
5. Set the Auth site URL to the deployed HTTPS origin. In production the app sets Secure cookies. Local HTTP development uses non-Secure cookies.
6. Apply the generated `verified_accounts_location_corrections` migration through the project's migration workflow. The equivalent SQL is included as script migration 004 for the existing local importer. Review pending Antigravity migrations first. The media uniqueness index intentionally fails if historical duplicate media rows need review; it does not delete evidence automatically.
7. Grant a verified account moderator access through a trusted database administrator, using its Supabase user UUID. The application never promotes a user through the sign-in form or metadata.

## Verify before launch

Send a code to an email you control. Verify sign-up, subsequent sign-in, invalid/expired code handling, resend throttling, refresh after access expiry, and sign-out. Confirm draft preservation during sign-in, upload retries, denied cross-account attachments, pending corrections, stale proposals, and moderator acceptance/rejection. Confirm original storage bucket has no public domain or public access. Confirm corrected issue coordinates change while original report points remain unchanged.

## Current configuration limits

The workspace's `.env.local` had a database connection but no Auth project URL or publishable key when this feature was built. The connected Supabase tool exposed another project, so it was not used for this app. No external test email or deployment was performed. Configure the correct project and email delivery before claiming OTP is live.

Browsing stays public. Writes require a verified session. Existing anonymous report authors are not automatically claimed by email accounts. Corrections up to 500 m are reviewed; larger moves should be filed as a separate issue. Accepted corrections require a moderator to select a nearby road or explicitly leave the issue unmatched.

Sources: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://github.com/supabase/auth
