# Troubleshooting

Start with `GET /api/health` and the logs — see [logging.md](logging.md).

---

## Startup

### `Invalid environment configuration for APP_ENV=…`

The config validator rejected a variable and named it. This is working as
intended — see [ADR-0006](../adr/0006-validated-config-at-boot.md).

- **Local:** the variable is missing from `.env`. Compare against `.env.example`.
- **Deployed:** it isn't set in the Vercel environment. Check Doppler, then
  confirm the integration pushed it, then **redeploy** — env vars are injected at
  build/boot, not per request.
- `JWT_SECRET … must be at least 32 characters`: generate a real one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Port 5000 already in use

```bash
lsof -ti:5000 | xargs kill      # macOS/Linux
```

Or run on another port: `PORT=5001 pnpm dev`.

### `client build directory missing — run pnpm build first`

Production mode with no `dist/public`. Run `pnpm build`, or use `pnpm dev`.

---

## Database

### Everything returns empty, no errors

`DATABASE_URL` is unset. `getDb()` returns `null` and queries no-op by design, so
the app boots for frontend-only work. Confirm with `/api/health` —
`"database": "missing"`. Set `DATABASE_URL` and restart.

### `ECONNREFUSED` / `password authentication failed`

Wrong connection string, or Postgres isn't running.

```bash
psql "$DATABASE_URL" -c "select 1"
```

Hosted databases usually need `?sslmode=require`.

### `relation "…" does not exist`

The schema was never applied: `pnpm db:push`.

### Connection limit exhausted on a serverless deploy

Each function instance holds a pool. Use your provider's **pooled** connection
string (Supabase: port 6543 with `pgbouncer=true`). See [database.md](database.md).

---

## Auth

### Signed out immediately after signing in

- `JWT_SECRET` changed or differs between environments — every existing session
  is invalidated. Expected after a rotation.
- Cookie rejected: sessions are `secure` in deployed environments, so the site
  must be served over HTTPS.

### No magic-link email

Expected without SMTP. The link is written to the log at `warn`:

```bash
pnpm logs:tail | grep magic
```

`/api/health` shows `"smtp": "console-fallback"`. Configure `SMTP_*` to send real
mail.

---

## AI features

### "AI unavailable" or empty results

No AI key. `/api/health` shows `"ai": "missing"`. Set
`AI_INTEGRATIONS_GEMINI_API_KEY` and `AI_INTEGRATIONS_GEMINI_BASE_URL`. Everything
that isn't AI-backed is unaffected.

### AI calls time out when deployed

They exceed the function's `maxDuration`. `vercel.json` sets 60 s, which requires
Fluid Compute; without it a Hobby plan caps at 10 s.

### Match analysis never updates

It runs fire-and-forget after an accommodation or preference changes, so a
failure won't surface in the UI. Look for `matchAnalysis` in the logs:

```bash
jq 'select(.scope=="matchAnalysis")' logs/*.jsonl
```

---

## Build and types

### `pnpm check` fails after changing a router

The client is typed from the server. A renamed or removed procedure breaks every
call site — that's the type safety working. Update the callers.

If errors mention _"collides with a built-in method"_, a router key clashes with
a tRPC React reserved name (`useContext`, `useUtils`, `Provider`, `createClient`).
Rename the router.

### `pnpm build` succeeds, `vercel build` fails

Usually a lockfile mismatch: CI and Vercel install with `--frozen-lockfile`.
Commit the updated `pnpm-lock.yaml`.

### Formatting failures in CI

`pnpm format` and commit.

---

## Deployed behaviour

### 500s with no detail

By design — clients get `{ "error": "Internal Server Error", "requestId": "…" }`
and never a stack trace. Take that `requestId` to the Vercel logs for the full
error.

### Works locally, not on Vercel

Almost always configuration. Compare `/api/health` in both. Both runtimes build
the app through the same `createApp()`, so genuine behavioural divergence is rare.

---

## Still stuck

1. `curl -s <origin>/api/health` — what's actually configured?
2. Reproduce with `LOG_LEVEL=debug` and follow one `requestId` end to end.
3. `pnpm verify` — does the baseline pass?
4. If you found something this document should cover, add it.
