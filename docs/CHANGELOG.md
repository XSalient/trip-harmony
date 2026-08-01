# Changelog

Notable changes, newest first. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are ISO-8601.

Add an entry for anything user-visible or anything that changes how the project
is built, run or deployed.

---

## 2026-08-01 — Infrastructure hardening

### Security

- `auth.me` no longer returns credential columns. User rows sent to the browser
  now go through an allow-list projection (`toPublicUser`), so `passwordHash` —
  previously served to every signed-in client — is never exposed, and a column
  added to `users` later cannot leak by default.

### Added

- **Validated configuration** (`server/_core/env.ts`). Every server-side
  environment variable is declared and Zod-validated at boot. A missing or
  malformed value fails startup with a message naming the variable, instead of
  surfacing as a confusing runtime error later.
- **`APP_ENV`** (`development` | `test` | `preview` | `production`) drives
  validation strictness, log level and log format. Falls back to `VERCEL_ENV`
  then `NODE_ENV`.
- **Structured logging** (`server/_core/logger.ts`). Levelled JSON logs with
  automatic secret redaction, per-request correlation ids surfaced as the
  `x-request-id` header, HTTP and tRPC middleware, and crash handlers. Written as
  JSONL to `logs/` locally and to stdout on Vercel.
- **`GET /api/health`** reporting which capabilities are configured, without
  revealing any values.
- **Doppler** for secrets: `doppler.yaml`, `pnpm dev:doppler`,
  `pnpm db:push:doppler`, and a documented `dev`/`stg`/`prd` layout.
- **`.env.example`** documenting every variable the app reads.
- **CI** (GitHub Actions): typecheck, tests, format check, build, and a schema
  push against a throwaway Postgres.
- **`pnpm setup`** — idempotent bootstrap for a fresh clone on any machine.
- **`pnpm verify`** — typecheck + test + build; the single definition of "done".
- **Documentation** under `docs/`: status, roadmap, changelog, architecture,
  ADRs and runbooks. **`AGENTS.md`** as the entry point for any AI tool.

### Changed

- **`server/routers.ts` (1,182 lines) split into 13 domain modules** under
  `server/routers/`, each 23–228 lines, with `index.ts` as a table of contents.
  Editing one domain no longer means loading the whole API surface.
- **Express app construction consolidated** into `server/_core/app.ts`, shared by
  the Node server and the Vercel function so the two runtimes cannot drift.
- All server `console.*` calls replaced with the structured logger.
- `pnpm dev` no longer shells out to `fuser`, so it works on Windows and macOS.
  `NODE_ENV` is derived in code from `APP_ENV`.
- Tests no longer load local `.env` files, so a developer's real `DATABASE_URL`
  can't leak into a test run.
- `vercel.json`: pinned install with a frozen lockfile, explicit function memory
  and timeout, immutable caching for hashed assets, and baseline security headers.
- Repository-wide Prettier formatting; CI now enforces it.

### Moved

- `todo.md` → `docs/ROADMAP.md`
- `replit.md` → `docs/architecture/README.md` (rewritten and corrected)
- `DEPLOYMENT_*.md`, `QUICK_REFERENCE.md` → `docs/archive/` (superseded;
  `docs/runbooks/deployment.md` replaces them)
