# Deployment

Target: **Vercel** — static SPA plus one serverless function — with secrets from
**Doppler** and Postgres from any provider.

> Superseded guides in [../archive/](../archive/) describe migrations away from
> Manus and a Supabase+OpenAI setup that was never adopted. Don't follow them.

## How it's wired

`vercel.json` defines the whole deployment:

- `pnpm install --frozen-lockfile` then `pnpm vite build` → `dist/public`
- `/api/*` rewrites to `api/server.ts`, a single Node function (1024 MB, 60 s)
- everything else rewrites to `index.html` for client-side routing
- hashed assets get immutable caching; baseline security headers on all responses

`api/server.ts` calls the same `createApp()` as the local server, so the two
runtimes cannot drift. It does not serve static files — Vercel does.

## First deployment

### 1. Database

Provision Postgres (Supabase, Neon, or Vercel Postgres) — one instance for
production, ideally a second for preview. Note each connection string.

Supabase: use the **pooled** connection string (port 6543, `pgbouncer=true`).
Serverless functions open many short-lived connections and will exhaust a direct
connection limit.

Apply the schema:

```bash
DATABASE_URL="<production-url>" pnpm db:push
```

See [database.md](database.md) — this uses `drizzle-kit push`, which is not yet
migration-based.

### 2. Secrets

Create the Doppler project `trip-harmony` with configs `dev`, `stg`, `prd`, then
set at minimum, per config:

```bash
doppler secrets set --config prd \
  DATABASE_URL="<production-url>" \
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  APP_ENV=production
```

Repeat for `stg` with the preview database and `APP_ENV=preview`, and a
**different** `JWT_SECRET`.

Add optional values (`AI_INTEGRATIONS_GEMINI_*`, `SMTP_*`, `PUBLIC_BASE_URL`) as
you enable those features — see [secrets.md](secrets.md).

### 3. Vercel

1. Import the repository. Framework preset: **Other** — `vercel.json` supplies
   the build settings; don't override them in the dashboard.
2. Connect Doppler's Vercel integration, mapping `prd` → Production and
   `stg` → Preview.
3. Deploy.

### 4. Verify

```bash
curl -s https://<domain>/api/health
```

Expect `status: ok`, the right `appEnv`, and `database: configured`,
`sessionSecret: configured`. Then:

- load the app and register an account
- create a trip and add a date proposal
- check Vercel runtime logs for the matching `http request` lines

Record the URLs in [../PROJECT_STATUS.md](../PROJECT_STATUS.md).

## Ongoing

- Push to `master` → production. Every PR → a preview deployment with `stg` secrets.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, format check, build and a
  schema push against a scratch Postgres. Keep it green before merging.
- Schema changes must be applied **before** the code that depends on them —
  see [database.md](database.md).

## Rolling back

Vercel keeps every deployment. Promote the previous one from the dashboard
(Deployments → ⋯ → Promote to Production); it is immediate and needs no rebuild.

**A rollback does not revert the database.** If the bad deploy changed the
schema, roll the schema back first — which today means editing
`drizzle/schema.ts` and pushing again. This is the strongest argument for
switching to versioned migrations, tracked in [../ROADMAP.md](../ROADMAP.md).

## Notes and limits

- `maxDuration: 60` needs Fluid Compute (on by default). On a Hobby plan without
  it the ceiling is 10 s, which AI-backed procedures will exceed.
- Cold starts rebuild the Express app once per instance, then reuse it.
- The filesystem is ephemeral and read-only outside `/tmp`; the logger writes to
  stdout when deployed for exactly this reason.
- `dist/` and `logs/` are git-ignored and built on Vercel — never commit them.

## Other hosts

Nothing here is Vercel-specific except `vercel.json`. Any Node host can run:

```bash
pnpm install --frozen-lockfile && pnpm build
APP_ENV=production DATABASE_URL=… JWT_SECRET=… pnpm start
```

`pnpm build` produces `dist/index.js` (server) and `dist/public` (client); the
long-running entrypoint serves both.
