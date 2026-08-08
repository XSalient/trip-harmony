# Deployment

Target: **Vercel** — static SPA plus one serverless function — with secrets from
**Doppler** and Postgres from any provider.

> Superseded guides in [../archive/](../archive/) describe migrations away from
> Manus and a Supabase+OpenAI setup that was never adopted. Don't follow them.

## How it's wired

`vercel.json` defines the whole deployment:

- `pnpm install --frozen-lockfile` then `pnpm vite build` → `dist/public`
- then `node scripts/db-migrate.mjs --deploy`, which applies any pending
  migrations to the production database before the deployment is promoted
  ([ADR 0010](../adr/0010-migrations-apply-on-deploy.md)). It requires the
  database URL to be visible to the **Build** step, not just the runtime, and
  fails the deploy if it is not.
- `/api/*` rewrites to `api/server.ts`, a single Node function (1024 MB, 60 s)
- everything else rewrites to `index.html` for client-side routing
- hashed assets get immutable caching; baseline security headers on all responses

`api/server.ts` calls the same `createApp()` as the local server, so the two
runtimes cannot drift. It does not serve static files — Vercel does.

## First deployment

### 1. Database

Provision Postgres (Supabase, Neon, or Vercel Postgres) — one instance for
production, ideally a second for preview. Note each connection string.

Supabase: use a **pooler** connection string (`…pooler.supabase.com`, user
`postgres.<project-ref>`) — specifically the **session pooler on port 5432**.
Never the direct `db.<ref>.supabase.co` host: it is AAAA-only and Vercel has no
IPv6 egress, so builds and functions both fail with `ENETUNREACH`. Serverless
functions also open many short-lived connections and will exhaust a direct
connection limit.

The transaction pooler (6543) is deliberately _not_ used here — the deploy-time
migration needs session semantics for its advisory lock. The reasoning is in
[database.md](database.md); read it before changing the port.

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
- CI (`.github/workflows/ci.yml`) runs typecheck, format check, build, and the
  migrations against a scratch Postgres. Keep it green before merging.
- **Tests are narrowed to the change.** `pnpm test:affected` runs only the tests
  that import something the change touched, which is why a small PR no longer
  waits on the whole suite ([ADR 0011](../adr/0011-affected-tests-from-the-import-graph.md)).
  Anything the import graph cannot reason about — a lockfile bump, a change under
  `scripts/` or `.github/` — still runs everything, and the full suite runs
  nightly at 03:00 UTC and on `workflow_dispatch`. Use `pnpm test:affected:list`
  to see what a change would select without running it.
- Schema changes are applied by the deploy itself — see [database.md](database.md).

## Rolling back

Vercel keeps every deployment. Promote the previous one from the dashboard
(Deployments → ⋯ → Promote to Production); it is immediate and needs no rebuild.

**A rollback does not revert the database.** Promoting an older deployment
restores the old code against the _current_ schema; nothing un-applies a
migration. This is why the deploy only runs additive migrations safely: a rolled
-back code version can tolerate a column it does not know about, but not a
missing one it still reads. Reverting a schema change means writing a new
migration that undoes it and deploying that.

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
