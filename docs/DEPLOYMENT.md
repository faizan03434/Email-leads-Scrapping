# Deploy to Vercel

## Access behavior

This app has no login system. `/` opens the shared client workspace and `/setup` opens connection settings. Anyone with access to the deployment URL can manage its leads and settings. API keys are encrypted in the database and never returned in setup responses. The old login page redirects to `/`; the authentication API and password controls have been removed.

All browsers use the same durable workspace ID. The app reuses the previous administrator's workspace ID when available, so existing records remain accessible. Cookies and identity headers cannot change the workspace. Legacy login tables and encrypted administrator rows are inert migration history; they do not gate access.

## Local test

Run `npm run dev`, then open http://localhost:3000. No setup token is needed. Supabase credentials and the configuration encryption key are already saved in ignored `.env.local` on this machine.

## Vercel settings

Push the `deployment` branch and import the repository in Vercel. Choose Next.js, repository root, Node.js 22.x, install `npm ci`, build `npm run build`, and the default output directory.

Copy the following environment values from `.env.local` into Vercel:

| Variable | Purpose |
| --- | --- |
| `CONFIG_DATABASE_URL` | Initial Supabase pooler holding encrypted settings and the shared workspace ID |
| `CONFIG_ENCRYPTION_KEY` | 64 hex characters; keep the existing value to decrypt saved settings |
| `DATABASE_URL` | Initial workspace PostgreSQL pooler URI |
| `MIGRATION_DATABASE_URL` | Migration connection, or use DATABASE_URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Initial Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Initial publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Initial server secret or legacy service-role key |
| `APP_URL` | Production HTTPS origin |
| `LIVE_SEND_ENABLED` | Keep false until sender settings and callbacks are verified |

SESSION_SECRET, SETUP_TOKEN and ALLOW_SIGNUPS are no longer used. Keep CONFIG_DATABASE_URL and CONFIG_ENCRYPTION_KEY unchanged when switching the workspace database through the dashboard. Do not delete the original configuration project.

The original project has the migrations applied. For a fresh installation, run `npm run db:migrate` with its initial connection configured. Do not run migrations during every Vercel build. The checksum-verified runner can be repeated safely; do not edit already-applied migrations.

## Setup dashboard

Settings ? Setup & connections manages SendGrid, licensed lead API, RentCast, Adzuna, Tracerfy, signed webhooks, the scheduler secret and Supabase.

Leave a secret blank to retain it. Clear explicitly disables an optional setting. Saved values override environment defaults. Supabase changes require a connection check and a switch confirmation, but no password. Restore deployment connection returns to verified environment defaults. Initialize empty project & connect applies migrations and creates the private resume bucket in a fresh project; it refuses existing app tables.

Switching Supabase projects does not copy existing leads, campaigns or files. Requests already running retain their original configuration. The standalone `/setup` page remains available if the workspace database fails, provided the original configuration database is reachable.

## Email and automation

Sender identity, reply-to, postal address and daily limit remain in General settings. Set SendGrid credentials and signing keys in the setup dashboard. Callback routes remain `/api/sendgrid/events`, optional `/api/sendgrid/parse`, and optional normalized `/api/inbound`. Unsubscribe links are signed and use the configured APP_URL.

The no-login change does not remove webhook signature verification or `/api/automation` bearer-secret checks. Set the same CRON_SECRET in the app and scheduler. `npm run scheduler:configure` creates Supabase Cron after a production HTTPS APP_URL is configured. Changing the dashboard secret does not update the scheduler automatically.

Vercel's 4.5 MB payload limit is bypassed for 5 MB resume uploads using signed uploads to private Supabase storage followed by server validation. Large inbound messages need a gateway that forwards compact JSON. Provider connection tests do not send mail or run paid searches.

## Verification

`npm test` covers PostgreSQL constraints, transactions, SQL compatibility, encrypted configuration and input validation. `npm run test:smoke` checks direct dashboard/setup access without a session, stable shared ownership, masked secrets, retained origin checks and responsive layout against the configured project.
