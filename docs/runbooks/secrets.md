# Secrets

**Doppler is the source of truth.** Nothing secret belongs in git, in a chat
message, or in a file that outlives a session. See
[ADR-0003](../adr/0003-doppler-for-secrets.md) for why.

## Layout

| Doppler config | `APP_ENV`     | Used by                               |
| -------------- | ------------- | ------------------------------------- |
| `dev`          | `development` | Local development                     |
| `stg`          | `preview`     | Vercel preview deployments (every PR) |
| `prd`          | `production`  | Production                            |

`doppler.yaml` binds this repository to project `trip-harmony`, config `dev`.

## Day-to-day

First time on a machine, or standing up a config that does not exist yet:

```bash
doppler login
bash scripts/doppler-bootstrap.sh dev   # then stg, then prd
```

That script creates the project and config if missing and prompts for each
variable `server/_core/env.ts` declares, reading values without echoing them and
skipping anything already set, so it is safe to re-run. It never writes a secret
to disk and never passes one as a shell argument.

**On Windows, check which `bash` actually runs it.** A `.sh` file needs a
POSIX shell, and typing `bash scripts/doppler-bootstrap.sh` from a native
terminal (PowerShell, or Cursor/VS Code's default integrated terminal) doesn't
guarantee Git Bash. Windows ships a legacy stub at
`C:\Windows\System32\bash.exe` that launches your default WSL distro instead,
and if that resolves first, the script runs inside a separate Linux
environment that has never seen the Doppler CLI you logged in with on Windows
— it fails with "Doppler CLI not found" even though `doppler login` just
worked. Check with `Get-Command bash` (PowerShell) before assuming the script
is broken; if it points under `System32`, either run the script from an
explicit Git Bash terminal, or skip the script entirely and use the **web
dashboard** below.

If a CLI session is inconvenient — Windows shell mismatches, or you'd simply
rather not touch a terminal for this — **dashboard.doppler.com** does
everything the script does, project, configs and secret values, with no CLI
involved and no chat message ever carrying a value.

```bash
doppler login
doppler setup                        # reads doppler.yaml
pnpm dev:doppler                     # run the app with dev secrets injected

doppler secrets                      # list (values masked in shared terminals)
doppler secrets set JWT_SECRET=…     # set one
doppler secrets --config prd         # inspect another environment
doppler run --config stg -- pnpm dev # run locally against preview secrets
```

Never `doppler secrets download` to a file unless you are offline, and delete it
when you're done — a downloaded `.env` is exactly the artifact Doppler exists to
avoid.

## Feeding Vercel

Use Doppler's Vercel integration (Doppler → Integrations → Vercel) and map:

| Doppler config | Vercel environment |
| -------------- | ------------------ |
| `prd`          | Production         |
| `stg`          | Preview            |

Doppler then pushes changes automatically; Vercel environment variables are never
edited by hand. Redeploy for a change to take effect — Vercel injects env vars at
build/boot, not per request.

**Production does not fully match that today.** `DATABASE_URL` is set directly
on the Vercel project — it carries no `configurationId`, so no integration owns
it — and it was last changed there by hand, on 2026-08-08, to bring production
back up ([ADR 0012](../adr/0012-session-pooler-for-the-database-url.md)). The
`POSTGRES_*` and `SUPABASE_*` variables do come from an integration, Supabase's
rather than Doppler's. Until that is reconciled (tracked in
[ROADMAP.md](../ROADMAP.md)), changing the production database URL in Doppler
alone will not reach Vercel, and the next deploy will keep using the value held
there. Change it in both, or finish the migration to Doppler.

## Variables

`server/_core/env.ts` is the authority; `.env.example` is the documented
contract. Adding a variable means updating **both**, plus this table.

### Required in preview and production

| Variable       | Purpose               | Notes                                                                                                                                                                                                                                     |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection   | Must be set on Vercel — the `POSTGRES_*` fallbacks point at the IPv6-only direct host here and cannot connect ([ADR 0012](../adr/0012-session-pooler-for-the-database-url.md)). Boot fails if none is a usable Postgres URL when deployed |
| `JWT_SECRET`   | Signs session cookies | ≥ 32 chars. Rotating it signs everyone out                                                                                                                                                                                                |

### Runtime

| Variable          | Default                        | Purpose                                                       |
| ----------------- | ------------------------------ | ------------------------------------------------------------- |
| `APP_ENV`         | derived                        | `development` \| `test` \| `preview` \| `production`          |
| `PORT`            | `5000`                         | Ignored on Vercel                                             |
| `LOG_LEVEL`       | `debug` local, `info` deployed | `debug`…`silent`                                              |
| `PUBLIC_BASE_URL` | —                              | Origin for magic links, invites and the passkey relying party |
| `VITE_APP_ID`     | `harmony`                      | Application identifier                                        |
| `OWNER_OPEN_ID`   | —                              | This user is granted `admin` on sign-in                       |

### Optional — the app runs without them

| Variable                                                            | Missing behaviour                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL` | AI features (referee, NL date parsing, URL import, match analysis) return an error; everything else is unaffected                                                                     |
| `BUILT_IN_FORGE_API_KEY`, `BUILT_IN_FORGE_API_URL`                  | Legacy aliases; take precedence over the Gemini pair when set                                                                                                                         |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_PROVIDER`                      | No Resend delivery. `MAIL_FROM` must be a verified domain or Resend only delivers to the account owner — the sign-in UI hides passwordless when so                                    |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`     | SMTP fallback unavailable. With no provider at all, magic links and invites are logged at `warn` instead of emailed — intended local behaviour                                        |
| `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`                          | Only consulted when `DATABASE_URL` is unset; set by the Supabase/Vercel integration. On this project both hold the direct, IPv6-only host, so neither is a working fallback on Vercel |
| `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`                         | Legacy Manus portal stays disabled; email and magic-link sign-in are unaffected                                                                                                       |
| `SCRAPER_PROVIDER`, `SCRAPER_API_KEY`, `SCRAPER_*`                  | The listing-import scraper fallback stays off. Imports from sites that refuse us degrade to URL hints, a Places lookup and the paste box — see below                                  |

`GET /api/health` reports which of these are configured, without revealing values.

## The listing scraper fallback

Off until `SCRAPER_API_KEY` is set — that one variable is the whole default
setup, and `SCRAPER_PROVIDER` falls back to `scrapingowl`. It runs only after a
listing site has refused a direct fetch, and never when the traveller pasted the
page — so a working import never touches it, and a bill only arrives for links
that would otherwise have half-filled the form.
[ADR-0013](../adr/0013-optional-scraper-fallback-for-blocked-listings.md)
explains what it costs and why it is opt-in.

Confirm the key and the endpoint in one command, before wondering about any
particular listing site:

```bash
doppler run --config dev -- pnpm diagnose:url --check-scraper
```

It makes the vendor's own smoke-test request the way the app makes it, prints
the status and the first 400 characters of the reply with the key redacted, and
says whether the page was found where the preset expected it.

`SCRAPER_API_KEY` is a secret: Doppler and Vercel only, and it is on the
redaction list, so it never appears in a log line.

The vendor is described by configuration rather than by code, because these
services all make the same call under different names:

| Variable                | Purpose                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `SCRAPER_API_KEY`       | The vendor's key. The only variable the default setup needs                                     |
| `SCRAPER_PROVIDER`      | `scrapingowl` (default) \| `scrapingbee` \| `scraperapi` \| `zenrows` \| `scrapfly` \| `custom` |
| `SCRAPER_ENDPOINT`      | Overrides the preset's URL; **required** for `custom`                                           |
| `SCRAPER_METHOD`        | `GET` or `POST`                                                                                 |
| `SCRAPER_URL_PARAM`     | What the vendor calls the parameter holding the listing URL                                     |
| `SCRAPER_API_KEY_PARAM` | What it calls the key, and `SCRAPER_API_KEY_IN` where it goes                                   |
| `SCRAPER_PARAMS`        | Anything else, as `a=b&c=d` or a JSON object                                                    |
| `SCRAPER_HTML_PATH`     | Dotted path to the HTML in a JSON reply; `none` when the body is the page                       |
| `SCRAPER_RENDER_JS`     | Default `true`. Airbnb renders to nothing without it, and it costs more                         |
| `SCRAPER_TIMEOUT_MS`    | Default `30000`                                                                                 |
| `SCRAPER_HOSTS`         | Narrow the spend to these hosts; empty means any host that blocks us                            |

**Switching vendor is these variables and nothing else** — the presets in
`server/utils/scraper/providers.ts` are a convenience, not a contract we
control. If a vendor renames a parameter or your plan uses a different
endpoint, override the field rather than waiting for a code change. A provider
name with no preset fails loudly at the first import rather than posting your
key at a guessed endpoint.

To see what any given link does, with or without the fallback configured:

```bash
pnpm diagnose:url "https://www.booking.com/Share-xTk9pQ"
```

It prints every rung of the ladder and which one answered.

## Rotation

1. Generate the new value.
2. `doppler secrets set NAME=… --config prd`
3. Redeploy (Vercel picks up the change at build/boot).
4. Revoke the old credential at its provider.

Rotating `JWT_SECRET` invalidates every session — users must sign in again. Do it
deliberately, and immediately if it may have leaked.

### Rotating the database password

The order matters, because the password is embedded in a URL that three places
may hold: Doppler, Vercel, and the Supabase dashboard.

1. Supabase → Settings → Database → **Reset database password**.
2. Rebuild the connection string with the new password
   **percent-encoded** — `#` `&` `@` `:` `/` `?` are URI-significant, and a raw
   one silently mis-parses. `#mH…&…@v` becomes `%23mH…%26…%40v`. A password that
   is not encoded fails as `ENOTFOUND <fragment-of-your-password>`, which looks
   nothing like an authentication error.
3. Use a **pooler** string — `…pooler.supabase.com`, user
   `postgres.<project-ref>`, **port 5432** (session pooler). Serverless
   functions open many short-lived connections and exhaust a direct pool, and
   the direct host is AAAA-only, which Vercel cannot reach at all. Not 6543:
   see [database.md](database.md) for why the migration needs session mode.
4. `doppler secrets set DATABASE_URL --config prd` and let the Vercel
   integration push it. If Vercel holds the value directly rather than through
   Doppler, update it there too — otherwise the next deploy fails at the
   migration step, which now needs the database at build time.
5. Redeploy, then confirm with `pnpm db:status:doppler`.

## If a secret leaks

1. Revoke it at the provider first. Do not start with the git history.
2. Set a new value in Doppler and redeploy.
3. If it was committed, rewrite history (`git filter-repo`) and force-push, then
   tell every collaborator to re-clone. Assume the old value is public regardless
   — it was in a clone, a CI log or a fork the moment it was pushed.
4. Note the incident in [../CHANGELOG.md](../CHANGELOG.md) without naming the value.

## Rules

- Never commit a real value. `.env` and `.env.*` are git-ignored;
  `.env.example` is the one exception and holds placeholders only.
- Never log a secret. The logger redacts common key names, but that is a
  backstop, not permission.
- Never send a secret over chat or email. Grant Doppler access instead.
- Never reuse a production secret in preview or local. That is what separate
  configs are for.
