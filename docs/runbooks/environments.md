# Environments

## The four

| `APP_ENV`     | Where            | Database                       | Logs                            | Secrets                           |
| ------------- | ---------------- | ------------------------------ | ------------------------------- | --------------------------------- |
| `development` | Local machine    | Local or personal Postgres     | Pretty console + `logs/*.jsonl` | Doppler `dev`, or `.env`          |
| `test`        | `pnpm test`, CI  | None (routers called directly) | Silent                          | None — env files are not loaded   |
| `preview`     | Vercel, per PR   | Preview Postgres               | JSON to stdout                  | Doppler `stg` → Vercel Preview    |
| `production`  | Vercel, `master` | Production Postgres            | JSON to stdout                  | Doppler `prd` → Vercel Production |

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
