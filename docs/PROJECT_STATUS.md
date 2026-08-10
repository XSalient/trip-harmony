# Project status

**Single source of truth for where this project stands.** Update it when you
finish a piece of work — the next person (or agent) starts here.

- **Last updated:** 2026-08-10
- **Name:** Back To Travelling (formerly Harmony). Two identifiers still read
  `harmony` / `trip-harmony` because they are registered outside this repo —
  `VITE_APP_ID` at the OAuth portal, and the Doppler project. Rename them there
  before changing them here.
- **Stage:** feature-complete MVP, deployed to production on Vercel.
  The trip experience overhaul is **complete** — all eight epics, covering the
  sixteen requested changes. See [product/](product/) for the specifications and
  [product/progress.md](product/progress.md) for the story-by-story record.
- **Health:** typecheck ✅ · 339 tests ✅ · production build ✅ (2026-08-10) ·
  dev server ✅
  (2026-08-02, after E5, E7 and E8: the restructured trip page walked in a real
  browser against a real Postgres — section order, summary figures, collapse
  state surviving a reload, the empty-trip case, renaming a trip from the header,
  the preference summary and its budget cap, and the consolidated edit/clone
  dialogs. Earlier, after E1/E2/E4: admin creates a trip → invites a Watcher by
  email → Watcher accepts and is correctly restricted, with the API payloads
  inspected rather than only the rendering, and the server log checked to confirm
  no model call happens on an ordinary write). The **passkey** enrol → sign-out →
  passkey sign-in round trip was last verified on 2026-08-01 and has not been
  repeated since.
- **Migrations:** all six are applied to the live Supabase database
  (`Trip Harmony`, `eqpqjivaubdbdmyrlczh`), with drizzle's tracking table
  baselined so `pnpm db:migrate` is correct against it. The role mapping landed
  on the real members (creator → admin, the other → tripmate) and `travel_dna`
  is gone. 0005 was applied on 2026-08-02 after it was found missing — the gap
  that broke every vote read that day. Deploys now apply migrations themselves
  ([ADR 0010](adr/0010-migrations-apply-on-deploy.md)), so this was the last
  time that gap could open by omission. `pnpm db:status:doppler` answers "is
  production behind?" at any time.
  `activity_events` was created with RLS enabled and no grants for `anon` /
  `authenticated`, per ADR 0009 — Postgres has no default-on RLS, so every new
  table has to be closed explicitly.
- **⚠️ Production reports no AI provider, and one cause has been removed.**
  `/api/health` reported `"ai":"missing"` on commit `0e55c5c`, so the referee,
  natural-language date parsing, match analysis and **all listing-URL
  extraction** fail. Extraction is a model call: reading the page is only half
  of it, and neither the scraper fallback nor the paste box can work without a
  model.
  Part of this was a bug of ours — `config.ai.isConfigured` demanded a base URL
  that Gemini does not need, so a correct key still read as missing. Fixed on
  2026-08-10; the health summary now also names the variable the key came from
  (`aiKeySource`).
  **Only `AI_INTEGRATIONS_GEMINI_API_KEY` is required, and it does not exist
  anywhere this session could see.** Confirmed after the fix deployed:
  `5e0661c` reports `"ai":"missing"` with `"aiKeySource":null`, so neither the
  Gemini key nor the Forge key reached the running function. A direct audit of
  the Vercel project on 2026-08-10 found no AI variable under any name, and
  Doppler `dev` has none either. **Nobody has set it yet** — this is not a
  delivery problem like the scraper key was. Put it in Doppler `dev` (or
  straight onto Vercel) and redeploy; `/api/health` will flip to
  `"ai":"configured"` and name the variable it came from.
- **Booking.com serves an AWS WAF challenge, not a 403.** HTTP `202` with an
  empty `<title>` and a `challenge.js`; `looksLikeBotCheck` catches it, which is
  why the ladder degrades rather than importing a captcha as a hotel. Airbnb, by
  contrast, answers a plain server-side fetch with full Open Graph and two
  JSON-LD blocks — measured 2026-08-10, so the scraper rung is for Booking and
  its peers, not for Airbnb, unless Vercel's egress IPs are treated differently.
- **The listing scraper rung works in `dev`, on ScraperAPI.** The `dev` Doppler
  config holds `SCRAPER_PROVIDER=scraperapi.com` and a live key; verified
  end-to-end on 2026-08-10 —
  `{"enabled":true,"provider":"scraperapi","endpoint":"https://api.scraperapi.com/"}`,
  `HTTP 200`, page extracted. (The earlier ScrapeOwl trial key was dead; that
  vendor is no longer in the path.)
  A domain like `scraperapi.com` used to be rejected as an unknown service;
  since 2026-08-10 the provider name is reduced to the vendor first, so a
  vendor's own spelling — name, alias, domain or endpoint URL — resolves, and a
  vendor with no preset needs only `SCRAPER_ENDPOINT`. **Switching vendor is
  configuration, never a code change**
  ([ADR 0013](adr/0013-optional-scraper-fallback-for-blocked-listings.md)).
  It is a per-request bill, so switching it on stays a deliberate choice, and
  imports degrade through URL hints, Google Places and the traveller's paste
  when it is off, exactly as
  [ADR 0008](adr/0008-listing-import-degrades-instead-of-evading.md) describes.
- **⚠️ The Doppler → Vercel integration is installed but has never synced.**
  Audited directly against the Vercel API on 2026-08-10. The Doppler
  integration is present on the team — `icfg_aMeJc62QWO3IQhXzNK4GeaH5`, slug
  `doppler`, `projectSelection: "all"`, holding `read-write:project-env-vars` —
  and its `updatedAt` equals its `createdAt`, so it has never run. **Not one
  environment variable on `trip-harmony` carries its `configurationId`.**
  (An earlier note here claimed no integration existed, inferred from
  `GET /v3/integrations` returning `[]`. That was wrong: the agent's Doppler
  token is a config-scoped service token and cannot enumerate workplace
  integrations, so the empty list meant nothing.)
  The integration is installed and authorised; what is missing is the **sync**,
  which is created per Doppler config in the Doppler dashboard. Until one
  exists, Doppler is not the source of truth in practice — Vercel is, and
  everything on it is hand-set.
- **⛔ Do not point a sync at Doppler `dev` yet — it would take production
  down.** `dev` holds placeholders, not real values: `JWT_SECRET` is **1
  character** (a deployed environment requires ≥ 32, so boot would fail
  outright), `DATABASE_URL` is 20 characters, and `MAIL_FROM` and
  `RESEND_API_KEY` are 1 character each. A `dev` → Production sync would
  overwrite the working Vercel values with those. `dev` also carries
  `APP_ENV=development`, which would tell the production server it is a
  development environment; the fix for that one is to **delete `APP_ENV` from
  Doppler entirely** and let `resolveAppEnv()` derive it — it already reads
  `VERCEL_ENV` and gets both environments right on its own.
  Before any sync is created, `dev` needs the real `DATABASE_URL`,
  `JWT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` and `OAUTH_SERVER_URL`. Those
  cannot be copied out of Vercel: the API returns **ciphertext** for
  `encrypted` variables, so only a human with the originals can put them in.
- **Vercel environment variables were audited and cleaned on 2026-08-10:
  23 → 12, no duplicates.** Sixteen variables managed by _Supabase's_
  integration (`icfg_8QNFBNoYm0WGKwlK508VdYy7`) were deleted: eleven that no
  code reads (`SUPABASE_*`, `POSTGRES_HOST/USER/PASSWORD/DATABASE/PRISMA_URL`),
  three `NEXT_PUBLIC_SUPABASE_*` — Next.js naming in a **Vite** app, and
  duplicates of the `SUPABASE_*` trio besides — and `POSTGRES_URL` /
  `POSTGRES_URL_NON_POOLING`, which _are_ read as `DATABASE_URL` fallbacks by
  both `env.ts` and `scripts/lib/migrations.mjs` and point at the IPv6-only
  direct host Vercel cannot reach ([ADR 0012](adr/0012-session-pooler-for-the-database-url.md)) —
  a live footgun the moment `DATABASE_URL` is ever unset. Deleting them also
  removed two unused high-privilege credentials (`SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SECRET_KEY`) from a project that never used Supabase's client.
  Names, targets and ids were backed up before deletion. **The Supabase
  integration is still installed with `projectSelection: "all"`, so it may
  re-create them** — if they reappear, restrict or uninstall it for this
  project.
  `stg` and `prd` in Doppler still could not be inspected — the agent token is
  `dev`-scoped (`This token does not have access to requested config`).
- **The scraper is configured in production as of 2026-08-10.**
  `SCRAPER_API_KEY`, `SCRAPER_PROVIDER`, `SCRAPER_ENABLED` and
  `PUBLIC_BASE_URL` were set on the Vercel project (all three targets) from the
  Doppler `dev` values, so production has the working ScraperAPI setup rather
  than nothing. These are hand-set on Vercel and will be superseded the moment
  a real Doppler sync exists — that is the intended end state, not this one.
- **⚠️ The agent Doppler token is read/write, and should not be.** The service
  token issued for agent sessions ("Claude Dev", `dev`-scoped) accepts writes —
  a `POST /v3/configs/config/secrets` succeeds. Nothing an agent does in a
  session needs write access, and a token that can write can also destroy a
  config. Reissue it read-only at dashboard.doppler.com → Access → Service
  Tokens. See [runbooks/secrets.md](runbooks/secrets.md#agent-sessions).
- **Database access is locked down.** RLS is on for all 23 tables with no
  policies, and `anon` / `authenticated` hold no grants — see
  [ADR 0009](adr/0009-rls-on-with-no-policies.md). Supabase's linter reports 23
  INFO `rls_enabled_no_policy` notices; that is the intended state.

---

## Where it runs

| Environment         | Status                 | Notes                                                                                 |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Local               | ✅ Working             | `pnpm setup && pnpm dev` → http://localhost:5000                                      |
| Database (Supabase) | ✅ Live, migrated      | `Trip Harmony` `eqpqjivaubdbdmyrlczh`, eu-west-1. All six migrations applied          |
| Preview (Vercel)    | ⚠️ Not yet provisioned | Config is in place — see [runbooks/deployment.md](runbooks/deployment.md)             |
| Production (Vercel) | ✅ Live                | `www.backtotravelling.com`, project `trip-harmony`, team `saurabhs-projects-4d5cc478` |

Production serves from `www.backtotravelling.com` (the apex 308-redirects to
`www`). `/api/health` returns `"status":"ok"` with
`"databaseSource":"DATABASE_URL"`.

It was down for a while, and the cause is worth keeping. The build died at the
migration step:

```
[migrate] database from DATABASE_URL
[migrate] failed: connect ENETUNREACH 2a05:…:5432
```

`DATABASE_URL` held Supabase's **direct** host, `db.<ref>.supabase.co`. That
name publishes no A record at all — it is AAAA-only — and Vercel's build
containers have no IPv6 egress, so the migration could not open a connection.
It was a connectivity problem, not a schema one.

The fix is a **pooler** host, which is IPv4. Note the port: `DATABASE_URL` now
uses the **session** pooler on **5432**, not the transaction pooler on 6543
that the runbooks used to prescribe, because `scripts/db-migrate.mjs` takes a
session-scoped `pg_advisory_lock` and holds it across `migrate()` — three
separate round trips. A transaction pooler can route those to different
backends, so the lock would guard nothing and could leak onto a backend where
it later blocks a deploy. See [runbooks/database.md](runbooks/database.md).

The database itself was healthy throughout — all six migrations accounted for,
`activity_events` present, 25 tables, `ACTIVE_HEALTHY`. Preview is still
unprovisioned; the `dev` branch exists on GitHub but is not mapped to a Vercel
environment.

## What works

Verified by running the app against Postgres, not just by reading code:

- **Auth** — registration, email+password login, magic link, logout, session
  cookies (1-year JWT). `auth.me` returns a projected user with no credential
  columns. The sign-in UI asks `auth.capabilities` what this deployment can
  actually deliver, and magic-link accounts can set a password via
  `auth.setPassword` so they always have a way back in.
- **Passkeys** — enrol from the profile page, then sign in with Face ID, Touch
  ID, Windows Hello or a hardware key. Sign-in is usernameless: the browser
  offers whichever discoverable passkey it holds, so nothing is typed. Only
  public keys are stored. See [ADR 0007](adr/0007-passkeys-for-sign-in.md).
- **Profile** — `/profile` shows the account and every sign-in method
  (password state, passkeys) in one place.
- **Trips** — create, list, update, join. Membership is Admin / Tripmate /
  Watcher, enforced server-side by `requireTripRole`; a watcher sees the trip's
  plans but no member's contact details, no who-proposed-what and no votes.
  Invites go by shared link or by email, and the members page shows who accepted,
  who is still pending, and how each person arrived.
- **Contacts** — a private per-user address book, so an email is typed once.
  Saving a contact grants nothing: an invite is still sent and still accepted.
- **Planning** — date proposals, destinations, accommodations, vibe board and
  itinerary, each with proposal/vote/comment/clone/edit/delete. Posting a
  proposal records its author's vote, so a new option never sits at zero.
  Admins finalise proposals: **one** set of dates, but **any number** of places
  and accommodations — a week in Spain is Barcelona _and_ Girona. Who finalised
  what, and when, is recorded and shown.
- **Budget** — expense logging, category breakdown, per-person split, per-member caps.
- **Notifications** — in-app feed with unread counts.
- **Preferences** — per-member, per-trip requirements. Since Travel DNA was
  removed these are the only member signal the AI has, and they feed both match
  analysis and the referee.
- **AI features** — referee mediation, natural-language date parsing,
  accommodation URL import, accommodation↔member match scoring. **Nothing runs
  on its own:** every model call follows a deliberate action, match analysis and
  the referee are admin-only, and the referee has a ten-minute cooldown. These
  require an AI key; without one the rest of the app is unaffected. The URL import reads
  Open Graph and schema.org data when the site allows a server-side fetch, and
  degrades in steps when it does not (Booking.com never does — it refuses any
  datacenter request with a 403): it follows the redirect a share link hides the
  property behind, falls back to what the URL itself encodes, looks the property
  up on Google Places for a real name and address, and then offers a paste box —
  the member's own browser is not blocked, so a copied page fills in the price,
  beds and amenities no server-side fetch can reach. See
  `server/utils/listingPage.ts` and `server/utils/placeLookup.ts`. The client is
  told which step answered, so a half-filled form never claims to be a scrape.
- **Email** — Resend then SMTP, tried in order. Delivery failures are reported
  to the user instead of being swallowed; with no provider, links go to the log.

## Infrastructure (added 2026-08-01)

| Concern       | State                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration | Zod-validated in `server/_core/env.ts`; fails fast with a readable message. `APP_ENV` selects development/test/preview/production.           |
| Secrets       | Doppler (`doppler.yaml`, configs dev/stg/prd) locally; Vercel env vars when deployed. `.env.example` is the contract. Nothing secret in git. |
| Logging       | Structured JSON with levels, per-request correlation ids and secret redaction. JSONL files under `logs/` locally, stdout on Vercel.          |
| API structure | 14 domain routers under `server/routers/` (was one 1,182-line file).                                                                         |
| CI            | GitHub Actions: typecheck, test, format check, build, plus a schema push against a scratch Postgres.                                         |
| Health check  | `GET /api/health` reports which capabilities are configured, leaking no values.                                                              |

## Known gaps

Ordered by how much they'd hurt. Also tracked in [ROADMAP.md](ROADMAP.md).

1. **No frontend tests.** All 237 tests are server-side. Page components are
   unverified — the passkey flow was checked with a scripted browser and a
   virtual authenticator, but that check is not committed as a suite.
2. **Client bundle is ~2.2 MB** (585 KB gzipped) in one chunk — no code splitting.
3. **Legacy Manus/Replit integrations** (`server/replit_integrations/`,
   `vite-plugin-manus-runtime`, the OAuth portal path) are unused but still wired in.
4. **AI prompts are inline** in router files and unversioned.

## Verifying the current state yourself

```bash
pnpm setup     # bootstrap
pnpm verify    # typecheck + tests + build — the definition of "working"
pnpm dev       # then open http://localhost:5000 and GET /api/health
```
