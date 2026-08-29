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
