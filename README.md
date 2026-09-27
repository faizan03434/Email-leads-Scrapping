# Leadflow — Vercel + Supabase

Browser-based lead generation and SendGrid outreach with a shared client workspace. No login, password, setup token, or email account is required.

## Local test

Use Node.js 22. `.env.local` is configured on this machine and ignored by Git.

```sh
npm ci
npm run dev
```

Open http://localhost:3000 directly. Settings ? Setup & connections manages provider API keys and Supabase connections. The standalone setup page is `/setup`. Old `/login` links redirect to the workspace.

Every visitor uses the same workspace. Existing records from the previous administrator workspace are preserved. Anyone who can reach the deployed app can read/manage leads and update settings. Saved secrets remain encrypted and are not returned to the browser. Signed email callbacks and scheduler authorization remain in place.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:smoke
```

The browser smoke test requires Google Chrome and the configured Supabase database. It verifies the shared workspace without cookies, setup access, secret masking and mobile layout without sending emails or running paid provider searches.

For deployment, see [Vercel setup](docs/DEPLOYMENT.md). Integration contracts are in [Integrations](docs/INTEGRATIONS.md).

PostgreSQL migrations are in `supabase/migrations`; `lib/setup/migrations.ts` bundles them for dashboard initialization. Historical login tables/migrations are retained for compatibility and are unused by the current application. Historical Cloudflare scripts and SQLite migrations are not used by Vercel.
