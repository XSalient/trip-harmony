# Changelog

Notable changes, newest first. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are ISO-8601.

Add an entry for anything user-visible or anything that changes how the project
is built, run or deployed.

---

## 2026-08-01 — Renamed to "Back To Travelling"

### Changed

- **Project renamed from "Harmony" to "Back To Travelling."** Page title, landing
  copy, the Travel DNA and referee screens, magic-link and trip-invite emails,
  the referee's system prompt, and the outbound `User-Agent` all use the new
  name. `package.json` is now `back-to-travelling`.
- **Local and CI database names** are `back_to_travelling_dev` /
  `back_to_travelling_ci` (were `harmony_dev` / `harmony_ci`). CI creates its own
  each run; for a local database either recreate it under the new name or keep
  your existing `DATABASE_URL` — only the connection string matters.

Two identifiers keep the old name on purpose, because they are registered with
services outside this repository and renaming only here would break them:
`VITE_APP_ID` (`harmony`, the app's id at the OAuth portal) and the Doppler
project `trip-harmony`. Rename those in the respective service first, then here.

---

## 2026-08-01 — Email delivery, database resilience, migrations

Developed in parallel with the infrastructure work below and merged together.

### Added

- **Real email delivery.** Resend (over HTTPS) is tried first, SMTP second —
  serverless platforms commonly block outbound SMTP ports. Sends report a
  `DeliveryResult` rather than throwing, so a failed magic link surfaces as an
  honest error instead of "check your inbox" for a mail that never left.
- **Capability-aware sign-in.** `auth.capabilities` tells the UI what this
  deployment can actually deliver, so passwordless is not offered when mail
  cannot reach the recipient — Resend's sandbox sender only reaches the account
  owner, which `MAIL_FROM` on a verified domain fixes.
- **`auth.setPassword` / `auth.hasPassword`.** Accounts created by magic link
  had no password and therefore no way back in if email broke.
- **Versioned migrations** under `drizzle/`, replacing `drizzle-kit push` for
  deployed environments. CI applies them to a scratch Postgres on every PR.
- **Database resilience:** connection-string fallback (`DATABASE_URL`, then the
  Supabase integration's `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`), a
  Postgres scheme check so a wrong URL fails legibly instead of as an opaque SSL
  error, relaxed TLS verification for managed providers, and connect/query
  timeouts so an unreachable database stops hanging the loading screen.

### Changed

- Server imports carry explicit `.js` extensions and `api/package.json` is ESM,
  which is what the Vercel Node runtime needs to resolve them.
- `lastSignedIn` is written fire-and-forget, so a slow database no longer delays
  an already-resolved session.
- tRPC failures log their whole `cause` chain — pg buries the useful part
  (error code, host, port) several levels down.

### Merge notes

- Mail settings are read lazily rather than frozen at boot. Unlike the database
  URL or session secret, email is optional and its absence only degrades
  behaviour; reading it live keeps the provider tests honest. Every read still
  happens inside `server/_core/env.ts`.
- The connection-string fallback moved into the validated config, so `db.ts`
  keeps only pool concerns (TLS, timeouts) and no `process.env` reads.
- `logTrpcError` now routes through the structured logger and skips client
  errors, which the procedure middleware already records at `warn`.

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
