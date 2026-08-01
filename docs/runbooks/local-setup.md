# Local setup

Getting from a fresh clone to a running app. Works on macOS, Linux and Windows
(WSL recommended on Windows).

## Prerequisites

- **Node.js 20+** (22 recommended — CI and Vercel both run 22)
- **pnpm** — `corepack enable` is enough; the version is pinned in `package.json`
- **PostgreSQL** — local, or a hosted database (Supabase, Neon, Vercel Postgres)
- **Doppler CLI** _(recommended)_ — https://docs.doppler.com/docs/install-cli

## Fast path

```bash
git clone <repo> && cd trip-harmony
pnpm setup      # installs deps, prepares secrets, pushes schema, runs checks
pnpm dev        # http://localhost:5000
```

`pnpm setup` is idempotent — re-run it any time.

## Secrets

**With Doppler** (nothing sensitive touches disk):

```bash
doppler login
doppler setup          # reads doppler.yaml → project trip-harmony, config dev
pnpm dev:doppler
```

**Without Doppler:**

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # JWT_SECRET
```

Fill in `DATABASE_URL` and `JWT_SECRET`. Everything else is optional — see
[secrets.md](secrets.md) for what each variable does and what degrades without it.

## A local database

Docker:

```bash
docker run -d --name harmony-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=harmony_dev \
  -p 5432:5432 postgres:16
```

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/harmony_dev
```

Native Postgres works equally well; only the connection string matters. Then:

```bash
pnpm db:push     # apply drizzle/schema.ts
```

## Everyday commands

```bash
pnpm dev          # API + SPA on :5000, hot reload
pnpm verify       # typecheck + tests + build — run before you call something done
pnpm check        # typecheck only (fast)
pnpm test:watch   # tests in watch mode
pnpm format       # prettier; CI enforces it
pnpm db:push      # apply schema changes
pnpm db:studio    # browse the database
pnpm logs:tail    # follow local structured logs
```

## Confirming it works

```bash
curl -s localhost:5000/api/health
```

```json
{
  "status": "ok",
  "appEnv": "development",
  "database": "configured",
  "ai": "missing",
  "smtp": "console-fallback",
  "sessionSecret": "configured"
}
```

`ai: missing` and `smtp: console-fallback` are normal locally — AI features need
a key, and without SMTP magic links are written to the log instead of emailed.
Register an account at http://localhost:5000, then watch the console for the
sign-in link.

## Something's wrong

See [troubleshooting.md](troubleshooting.md).
