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

No usable connection string. `getDb()` returns `null` and queries no-op by
design, so the app boots for frontend-only work. Confirm with `/api/health` —
`"database": "missing"`. If a variable _is_ set, check `databaseIgnored` in the
same response: a value that isn't a Postgres URL is skipped deliberately rather
than handed to the driver.

### `ECONNREFUSED` / `password authentication failed` / `SELF_SIGNED_CERT_IN_CHAIN`

Wrong connection string, or Postgres isn't running. Managed providers' TLS
chains are handled automatically (`sslmode=no-verify` for non-local hosts), so a
certificate error usually means the host is wrong rather than the TLS setup.

```bash
psql "$DATABASE_URL" -c "select 1"
```

Hosted databases usually need `?sslmode=require`.

### `relation "…" does not exist`

The schema was never applied: `pnpm db:migrate` (or `pnpm db:push` locally).

### Connection limit exhausted on a serverless deploy

Each function instance holds a pool. Use your provider's **pooled** connection
string (Supabase: the session pooler on port 5432 — not 6543, which breaks the
deploy-time migration's advisory lock). See [database.md](database.md).

### `ENETUNREACH` against an IPv6 address on a Vercel build or function

`DATABASE_URL` is pointing at Supabase's direct host, `db.<ref>.supabase.co`.
That name is AAAA-only and Vercel has no IPv6 egress, so nothing can connect.
Switch to a pooler host (`…pooler.supabase.com`, user `postgres.<project-ref>`).
`getent ahostsv4 db.<ref>.supabase.co` returning nothing confirms the diagnosis.

---

## Auth

### Signed out immediately after signing in

- `JWT_SECRET` changed or differs between environments — every existing session
  is invalidated. Expected after a rotation.
- Cookie rejected: sessions are `secure` in deployed environments, so the site
  must be served over HTTPS.

### No magic-link email

With no provider configured this is expected — the link is written to the log at
`warn`, which is what local sign-in relies on:

```bash
pnpm logs:tail | grep magic
```

`/api/health` reports one of three states — **to an admin**; anonymously it
answers `{"status":"ok"}` and nothing else. `/admin/health` shows the same
three states, plus a button that sends a real test email to your own address:

| `email`      | Meaning                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `log-only`   | No provider. Set `RESEND_API_KEY` or `SMTP_*`.                                                                                            |
| `owner-only` | Resend is configured but `MAIL_FROM` is still its sandbox sender, so it only delivers to the Resend account owner. Set a verified domain. |
| `configured` | Mail can reach any recipient.                                                                                                             |

On any deployed platform a failed send surfaces as an error to the user rather
than a false "check your inbox" — look for `mailer` in the logs for the
provider's reason. (`onDeployedPlatform`, not `APP_ENV`: see
[PROJECT_STATUS](../PROJECT_STATUS.md) for why that distinction is load-bearing
here.)

### An invite says it was sent but nothing arrives

**Open `/admin/health` first.** Its Email row calls Resend live — reachable?
key valid? is the `MAIL_FROM` domain actually verified? — and its test button
sends a real email to your own address, which is the only thing that settles
delivery end to end.

`/api/health` reporting `email: "configured"` is **not** evidence that mail is
being delivered. It checks only that a provider key exists and that `MAIL_FROM`
is not Resend's sandbox sender — it cannot reach Resend to ask whether the
domain in `MAIL_FROM` is verified. Failing that, read the logs:

```bash
pnpm logs:tail | grep mailer     # locally
```

On Vercel, filter runtime logs for `mailer`. The failure line names what broke:

| Log line                           | Meaning                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Resend responded 401`             | The API key is wrong or revoked.                                                                                 |
| `Resend responded 403`             | Reached Resend, refused the send — almost always an unverified sender domain. Verify it in the Resend dashboard. |
| `Resend responded 429` / `5xx`     | Rate limit or Resend's own outage. Retried automatically; if it still fails, check resend-status.com.            |
| `Resend was unreachable (<errno>)` | The request never got a response. Not an auth or domain problem — see the errno below.                           |

`ENOTFOUND`/`EAI_AGAIN` is DNS from the runtime; `ECONNREFUSED`/`ECONNRESET`/
`UND_ERR_CONNECT_TIMEOUT` is egress or the provider's edge; a certificate error
is the runtime's trust store. None of these are fixed by changing a key.

**`UND_ERR_INVALID_ARG` — "invalid Authorization header" — is none of those.**
It means undici refused to _build_ the request: the API key contains a byte
that cannot appear in an HTTP header, so nothing was ever sent. This is what
broke invitations on wevotrip.com for three weeks. `RESEND_API_KEY` had a
`0x16` at index 0 — ASCII SYN, which is what a literal Ctrl+V leaves behind
when a field takes the keystroke instead of pasting — and `trim()` does not
remove it, because SYN is a control character rather than whitespace.

The app now strips anything outside printable ASCII from header-bound secrets
(`headerSafeSecret` in `server/_core/env.ts`), so a key damaged this way still
works, and the Secret hygiene row on `/admin/health` says it happened. **Fix
the stored value anyway**: re-copy the key and paste it into Doppler, in the
config that actually feeds the deployment. It is a warning and not a failure
only because the repair is possible; the next provider to tighten its key
format turns it back into an outage.

To check a key's bytes without printing it:

```bash
doppler run --command 'node -e "
const k=(process.env.RESEND_API_KEY||\"\").trim();
const bad=[...k].filter(c=>c.charCodeAt(0)<0x21||c.charCodeAt(0)>0x7e);
console.log({len:k.length,headerSafe:bad.length===0,codes:bad.map(c=>c.charCodeAt(0))});
"'
```

The errno matters enough that the mailer walks `err.cause` to find it — Node's
`fetch` reports every one of them as the same `"fetch failed"`, which is
undiagnosable on its own.

Meanwhile the invite is not lost: the invite row and its token are written
before the send, so the members page can still show who was invited, and the
link on that page works when shared by hand.

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
