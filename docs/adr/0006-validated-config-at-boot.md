# 0006. Validate configuration at boot, fail fast

- Status: Accepted
- Date: 2026-08-01

## Context

Configuration was a plain object of `process.env` reads with `?? ""` fallbacks,
and other modules read `process.env` directly as well. Nothing was validated.

The failure mode was consistently bad: a missing `JWT_SECRET` produced a signing
error on the first login attempt, not at startup; a missing `DATABASE_URL` made
`getDb()` return `null` and every query silently no-op. Both surfaced far from
the cause, in a deployed environment, as a user-facing bug.

## Decision

`server/_core/env.ts` is the only place the server reads `process.env`. It
declares every variable in a Zod schema and parses once at module load. Failure
throws a message naming each bad variable and pointing at the runbook.

Strictness varies by environment: `DATABASE_URL` and a 32-character `JWT_SECRET`
are required in preview and production, optional locally and in tests, so the app
still boots for frontend-only work.

`APP_ENV` (`development` | `test` | `preview` | `production`) selects the
environment, falling back to `VERCEL_ENV` then `NODE_ENV`.

## Consequences

- A misconfigured deploy fails immediately and legibly, before serving traffic.
- The valid configuration surface is one readable file, and `.env.example` is
  generated from the same understanding.
- `describeConfig()` powers `/api/health`, reporting which capabilities are wired
  up without revealing any values.
- Optional capabilities degrade rather than crash: no AI key disables AI features,
  no SMTP logs magic links instead of sending them. This is deliberate — it keeps
  local development frictionless — but it means a missing optional value shows up
  as a behaviour change rather than an error. `/api/health` exists to make that
  visible.
