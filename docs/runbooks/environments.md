# Environments

## The four

| `APP_ENV`     | Where            | Database                       | Logs                            | Secrets                           |
| ------------- | ---------------- | ------------------------------ | ------------------------------- | --------------------------------- |
| `development` | Local machine    | Local or personal Postgres     | Pretty console + `logs/*.jsonl` | Doppler `dev`, or `.env`          |
| `test`        | `pnpm test`, CI  | None (routers called directly) | Silent                          | None — env files are not loaded   |
| `preview`     | Vercel, per PR   | **The production database**    | JSON to stdout                  | Doppler `stg` → Vercel Preview    |
| `production`  | Vercel, `master` | The production database        | JSON to stdout                  | Doppler `prd` → Vercel Production |

> **Preview and production share one Supabase database.** The free tier gives
> one project, and that trade was made deliberately — see
> [ADR-0023](../adr/0023-preview-and-production-share-one-database.md). It has
> three consequences you cannot design around:
>
> - **Never set `RUN_MIGRATIONS=1` on Preview.** It would migrate production as
>   a side effect of building any branch, on every push.
> - **A branch with new migrations cannot be tested on preview until they are
>   applied to that one database** — which is a production change. Do it
>   deliberately: `pnpm db:status`, then `pnpm db:deploy`.
> - **Every migration must be backward compatible with `master`**, because the
>   old code keeps serving production against the new schema.
>
> This table used to say "Preview Postgres" and "Production Postgres" as though
> they were two databases. They never were, and the wrong line cost an
> afternoon.

## How the environment is chosen

`server/_core/env.ts` resolves it in this order:

1. `APP_ENV`, if set to a valid value — always wins.
2. `VERCEL_ENV` — `production` or `preview`.
3. `NODE_ENV=test`, or a Vitest run → `test`.
4. `NODE_ENV=production` → `production`.
5. Otherwise `development`.

`NODE_ENV` is then derived from `APP_ENV` if it wasn't already set, so
`pnpm dev` behaves identically on every OS without a shell-specific prefix.

### Never set `APP_ENV` on a Vercel project

Step 1 wins over step 2, so `APP_ENV=development` on the Vercel project makes a
live deployment answer "we're in development" to every check in the table below.
That is what wevotrip.com was doing, discovered 2026-09-11: `/api/health`
reported `appEnv: "development"` from the production domain.

Leave it unset on Vercel and let `VERCEL_ENV` decide. The only reason to set it
there is to deliberately run a deployment in another mode, and it is worth
saying out loud what that costs — debug logs, human-formatted output where the
log pipeline expects JSON, and the boot-time secret rules switched off.

**Check it after any change to the project's environment variables:**

```bash
curl -s https://www.wevotrip.com/api/health | jq .appEnv   # must be "production"
```

Two things that used to follow from this are now independent of it:
`auth.requestMagicLink` returning the link in its response, and raw internal
error text reaching the browser. Both ask `config.onDeployedPlatform`, which
reads Vercel's own `VERCEL` variable and which no value of `APP_ENV` turns off.
The boot-time secret rules are still keyed on `APP_ENV` alone, deliberately:
they `throw`, and a throw at boot takes the whole API down rather than degrading
it.

**Before removing `APP_ENV=development`, confirm `JWT_SECRET` is at least 32
characters on that project.** Flipping to `production` starts enforcing the
table below, and a secret that fails the schema fails the boot.

## What changes between them

|                           | development        | test     | preview            | production         |
| ------------------------- | ------------------ | -------- | ------------------ | ------------------ |
| `DATABASE_URL` required   | no                 | no       | **yes**            | **yes**            |
| `JWT_SECRET` required     | no                 | no       | **yes**, ≥32 chars | **yes**, ≥32 chars |
| Default log level         | `debug`            | `silent` | `info`             | `info`             |
| Log format                | human + JSONL file | —        | JSON stdout        | JSON stdout        |
| Local `.env` files loaded | yes                | **no**   | no                 | no                 |
| Client assets             | Vite dev server    | —        | prebuilt static    | prebuilt static    |

Two of these are deliberate safety choices:

- **Tests never load `.env`.** A developer whose `.env` points at a real database
  would otherwise have tests run against it.
- **Deployed environments demand real secrets at boot.** Preview and production
  fail immediately rather than degrading silently.

## Switching locally

```bash
pnpm dev                                  # development, .env
pnpm dev:doppler                          # development, Doppler dev config
doppler run --config stg -- pnpm dev      # local app, preview secrets
APP_ENV=production pnpm build && pnpm start   # production build locally
```

Running locally against `prd` secrets is possible and almost always a mistake.
Use `stg`.

## Checking which environment you're in

```bash
curl -s <origin>/api/health
```

Returns `appEnv`, `logLevel` and whether the database, AI, SMTP, OAuth and session
secret are configured — never any values.

## Adding an environment variable

1. Add it to the Zod schema in `server/_core/env.ts` and expose it on `config`.
2. Document it in `.env.example`.
3. Add it to the table in [secrets.md](secrets.md).
4. Set it in each Doppler config that needs it.
5. If it is optional, make the degraded behaviour explicit and report it in
   `describeConfig()`.

Do not read `process.env` anywhere else on the server.
