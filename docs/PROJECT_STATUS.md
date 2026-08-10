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
- **Health:** typecheck ✅ · 342 tests ✅ · production build ✅ (2026-08-10) ·
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
- **✅ AI is configured and working in production.** It reported
  `"ai":"missing"` for a day, and there were three separate causes, all now
  fixed. `config.ai.isConfigured` demanded a base URL that Gemini does not
  need, so a correct key would still have read as missing — and
  `accommodations.fetchFromUrl` reads that same flag, so it refused every
  listing-URL import before attempting one. Nobody had ever set
  `AI_INTEGRATIONS_GEMINI_API_KEY` in any environment. And `llm.ts` hardcoded
  `gemini-2.5-flash`, which Google now refuses with
  `404 "no longer available to new users"` — so every AI call would have failed
  even once the key arrived, with `/api/health` still reporting green.
  Only the key is required; `AI_INTEGRATIONS_GEMINI_BASE_URL` stays empty unless
  you are pointing the SDK at a proxy. The model is `AI_MODEL`, defaulting to
  `gemini-3.6-flash`, and `/api/health` reports `aiModel` so the next
  retirement is visible rather than silent.
- **Booking.com serves an AWS WAF challenge, not a 403.** HTTP `202` with an
  empty `<title>` and a `challenge.js`; `looksLikeBotCheck` catches it, which is
  why the ladder degrades rather than importing a captcha as a hotel. Airbnb, by
  contrast, answers a plain server-side fetch with full Open Graph and two
  JSON-LD blocks — measured 2026-08-10, so the scraper rung is for Booking and
  its peers, not for Airbnb, unless Vercel's egress IPs are treated differently.
- **The listing scraper runs on ScraperAPI, in `dev` and in production.** The `dev` Doppler
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
- **✅ Doppler → Vercel syncs, as of 2026-08-10.** The sync was created by hand
  in the Doppler dashboard and has run. **Doppler `dev` is now the source of
  truth for this project's configuration** — edit there, then redeploy, because
  Vercel injects environment variables at build/boot rather than per request.
  Getting here took two corrections worth remembering. The integration
  (`icfg_aMeJc62QWO3IQhXzNK4GeaH5`, slug `doppler`, all projects) had been
  installed since April and had never run: installing an integration is not the
  same as creating a sync, and nothing on the project carried its
  `configurationId`. And an agent cannot create the sync — `POST
/v3/configs/config/syncs` answers `403 "You do not have access to use this
integration."` even with the right integration UUID, because a Doppler
  service token is scoped to one config by design. That step is a human's.
- **The agent no longer has Vercel API access.** `VERCEL_TOKEN` was added to
  Doppler `dev` to do the audit and cleanup, then removed once the sync existed
  — correctly, since a Doppler config syncs wholesale and an agent's operational
  credential has no business becoming an application environment variable. A
  future session that needs to audit Vercel needs a fresh token put there
  temporarily and taken out again.
- **Unverified: which Vercel environments the sync targets.** The variables it
  replaced were set for `production`, `preview` and `development`; a Doppler
  sync targets the environments chosen when it was created. If preview
  deployments start failing on missing configuration, that is the first thing
  to check.
- **How Doppler `dev` got fit to be the source of truth.** It held placeholders
  until 2026-08-10 — `JWT_SECRET` was **1 character**, against a ≥ 32
  requirement that would have failed boot outright, and `DATABASE_URL` was 20 —
  so a sync created before that would have overwritten production with junk.
  The real `DATABASE_URL`, `JWT_SECRET` and `RESEND_API_KEY` were copied in by
  hand, because Vercel returns ciphertext for `encrypted` variables and no tool
  can read them out; `MAIL_FROM` was copied across from Vercel, where it is
  `plain` and therefore readable.
- **Vercel and Doppler `dev` hold the same 11 variables**, and the sync keeps
  them that way. Vercel went 23 → 11: sixteen Supabase-integration variables
  were deleted (eleven read by no code, including two unused high-privilege
  credentials; three `NEXT_PUBLIC_SUPABASE_*`, which are Next.js naming in a
  **Vite** app and duplicates of the `SUPABASE_*` trio besides; and
  `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`, which _are_ read as
  `DATABASE_URL` fallbacks and point at the IPv6-only direct host Vercel cannot
  reach — a live footgun the moment `DATABASE_URL` is unset
  ([ADR 0012](adr/0012-session-pooler-for-the-database-url.md))). The Manus
  OAuth pair went too: `getLoginUrl()` is exported and never called, so no UI
  path has ever reached the portal.
  **The Supabase integration is still installed with `projectSelection: "all"`,
  so it may re-create its sixteen.** If they reappear, restrict or uninstall it
  for this project.
  **The dead OAuth code is still present** — `oauth.ts`, `OAuthService` in
  `sdk.ts`, `getLoginUrl` — and is a good follow-up. It was left out on purpose:
  `sdk.ts` also carries the live session path, and `getUserInfoWithJwt` sits on
  it, so removing the variables is safe while removing the code deserves its own
  review.
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
