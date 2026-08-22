# Project status

**Single source of truth for where this project stands.** Update it when you
finish a piece of work — the next person (or agent) starts here.

- **Last updated:** 2026-08-22
- **Name:** Back To Travelling (formerly Harmony). Two identifiers still read
  `harmony` / `trip-harmony` because they are registered outside this repo —
  `VITE_APP_ID` at the OAuth portal, and the Doppler project. Rename them there
  before changing them here.
- **Stage:** feature-complete MVP, deployed to production on Vercel.
  The trip experience overhaul is **complete** — all eight epics, covering the
  sixteen requested changes. The **groups and budget** programme (E9–E12) is
  complete too: a trip can be organised as families, everyone coming is counted
  whether or not they use the app, a family casts one vote, and Budget is a
  voting section rather than an expense journal. See [product/](product/) for
  the specifications and [product/progress.md](product/progress.md) for the
  story-by-story record.
- **Health:** typecheck ✅ · 704 tests ✅ · production build ✅ (2026-08-22) ·
  dev server ✅
  (2026-08-22, after E9–E12: walked in a real browser against a real Postgres
  built by applying migrations 0000–0011 in order. Two members of one family
  voted on one proposal and the family kept **one** vote; moving a member
  between groups dropped 14 duplicate votes across all four proposal types and
  recorded each as `vote.superseded`; a trip with no groups behaved exactly as
  before. Budget figures were checked arithmetically — 620 per person × 11
  people = 6,820 for the trip, and a family of five paid 3,100 of it, with the
  two pets in the headcount and in no divisor. Finalising notified exactly the
  one person over their cap. A watcher's `groups.list`, `groups.attendees`,
  `trips.members`, `budget.list` and `budget.summary` payloads were inspected
  rather than the rendering: no ages, no caps, no over-cap count, no proposer,
  no vote authorship.)
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
- **A tripmate can invite a watcher** (2026-08-22). Inviting was admin-only,
  which on a trip of families meant asking somebody else to add your own family.
  `trips.sendInviteEmail` requires a tripmate, and an admin for any role but
  `watcher`; the shared invite link stays admin-only because it makes tripmates.
  This supersedes an E2 acceptance criterion — the story says so rather than the
  box being quietly unticked. **If a watcher ever gains a vote, or is ever
  counted in a vote denominator, this has to go back to admin-only in the same
  commit**; `server/routers/invites.test.ts` asserts the rule and the properties
  it rests on together, so that connection is not left to memory.

- **Migrations 0008–0011 have not been applied to production yet** (2026-08-22).
  0008 adds `trip_groups` and the trip's voting unit; 0009 adds `trip_attendees`
  and **backfills one adult attendee per accepted member** (without it, an
  existing trip reports a headcount of zero and every per-person budget figure
  divides by nothing); 0010 adds `budget_proposals` and `budget_votes`.
  **0011 drops `budget_items` and is destructive and irreversible** — every
  logged expense goes with it. It is deliberately the last migration and the
  only thing in it, so it can be held back for a release while the rest lands.
  Take a backup first if any production row is worth keeping. All twelve
  migrations were applied in order to a scratch Postgres 16 and the result was
  diffed against `drizzle-kit push` of `schema.ts`: no column or type
  disagreement, the only differences being the RLS statements and functional
  indexes `push` never creates (as with `contacts` and `trip_invites` already).

- **Migrations:** the first six are applied to the live Supabase database
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
  **0006 and 0007 have not been applied to production yet** (2026-08-19). 0006
  drops the vibe-board and itinerary tables; 0007 drops `destinations.vibes`.
  Both are destructive and irreversible: the deploy applies them, and the rows
  in `vibe_items`, `vibe_votes`, `itinerary_days`, `itinerary_items` and that
  column go with them. Take a backup first if anything in production is worth
  keeping.
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
- **Page navigation no longer traps the back button.** Five defects, one
  symptom pair — a trip page you could not back out of, and a trip that would
  not open when tapped. The back arrow pushed instead of popping (`backHref` is
  passed on every screen, so the `history.back()` branch was unreachable); both
  unauthenticated redirects used `location.href`, which pushes, so back returned
  to the screen that had just bounced you and it bounced you again; a transient
  database error was reported to the client as a signed-out session; `auth.me`'s
  15s abort was applied by URL sniffing and so killed whatever batch it rode in,
  which on the trip page is fifteen other queries; and `getUserTrips` listed
  memberships that `requireTripRole` refuses. Fixed 2026-08-15 — see the
  changelog. History depth now lives in `client/src/lib/navigationDepth.ts`; the
  rule it encodes is that popping is only safe while a screen of ours is behind.

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
- **✅ The sync targets Production only, as of 2026-08-12.** Previously recorded
  here as unverified. Vercel's environment-variables screen settles it by
  inspection: every row carrying the Doppler icon is scoped to _Production_, and
  every other row — `MAIL_FROM`, `JWT_SECRET`, `DATABASE_URL`,
  `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_ENABLED`, `PUBLIC_BASE_URL` — is a
  hand-set copy scoped to _All Pre-Production Environments_. The same name
  appearing twice is Vercel scoping per environment, not a duplicate to clean
  up.

  Two things follow. **Pre-production configuration is maintained by hand** and
  does not inherit anything from Doppler, so a variable added to the synced
  config reaches production and nowhere else. And **the sync rewrites the
  Production set wholesale**, so a variable added directly in Vercel for
  Production can be removed again by a later sync run — durable additions belong
  in the source config.

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
| Sales demo          | Same deployment        | `demo.backtotravelling.com` — one build, two domains; gated on the Host header        |

Production serves from `www.backtotravelling.com` (the apex 308-redirects to
`www`). `/api/health` returns `"status":"ok"` with
`"databaseSource":"DATABASE_URL"`.

`demo.backtotravelling.com` is the **same deployment**, not a second one. The
demo entry point — the landing-page button and the seat-picker API — is shown
only when the request arrives on that hostname, because one process serving two
domains sees one environment and the `Host` header is the only thing that
differs. `isDemoTourHost` in `shared/demo.ts` is the check;
[runbooks/demo.md](runbooks/demo.md) has the table of what each domain does.
The domain has to be attached to the project in Vercel for any of this to
appear; until it is, the demo is hidden everywhere, which is the safe direction
to fail.

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
  plans but no member's contact details, no who-proposed-what, no votes and no
  AI match analysis. The client half of that rule now lives in one hook,
  `client/src/_core/hooks/useTripRole.ts`, used by all ten trip screens — it
  used to be applied on the dashboard only, so every other screen offered a
  watcher controls the server then refused. `server/routers/roleCoverage.test.ts`
  is the sweep that keeps both halves honest.
  Invites go by shared link or by email, and the members page shows who accepted,
  who is still pending, and how each person arrived.
- **Contacts** — a private per-user address book, so an email is typed once.
  Saving a contact grants nothing: an invite is still sent and still accepted.
- **Planning** — date proposals, suggestions and accommodations, each with
  proposal/vote/comment/clone/edit/delete. Posting a proposal records its
  author's vote, so a new option never sits at zero.
  Admins finalise proposals: **one** set of dates, but **any number** of
  suggestions and accommodations. Who finalised what, and when, is recorded and
  shown. The green/red number on a card is a weighted vote total
  (Yes +2, Maybe +1, No −3) and is tappable for the arithmetic; the weights live
  once, in `client/src/components/trip/VoteScore.tsx`, which is also what the
  cards sort by.
  The **Suggestions** section is the `destinations` router and table under
  another name (2026-08-19): the group votes on anything, not only on places.
  The table keeps its original name — renaming it would cost a data migration
  and change no behaviour.
- **Budget** — expense logging, category breakdown, per-person split, per-member caps.
- **Notifications** — in-app feed with unread counts.
- **Preferences** — per-member, per-trip requirements. Since Travel DNA was
  removed these are the only member signal the AI has, and they feed both match
  analysis and the referee.
- **AI features** — referee mediation, natural-language date parsing,
  accommodation URL import, accommodation↔member match scoring. **Nothing runs
  on its own:** every model call follows a deliberate action, match analysis and
  the referee are admin-only, and the referee has a ten-minute cooldown.
  **The referee is honest about what it did and did not read** (2026-08-15). Its
  prompt lives in `server/prompts/referee.ts`, versioned `referee/v2`, and the
  version is stored inside the `context` JSON of every message it writes. A run
  the model cannot answer now says "Analysis unavailable — I have not read this
  trip" instead of the encouraging nudge it used to store as a mediation, and it
  is deliberately **not** persisted: the cooldown is the age of the newest stored
  message, so an outage of seconds would otherwise have cost ten minutes. The
  referee is also shown each stay's saved match analysis — flags, resentment risk
  and per-member verdicts — because it previously reported a group in harmony
  while the accommodations screen showed `42/100` and a failed must-have on the
  same stay.
  Import and match analysis are separate calls, and a stay imported from a
  listing is correctly un-analysed until an admin asks — the card's empty state
  says so, having previously read like a failed import. These
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

1. **No frontend tests.** Nearly all 593 tests are server-side. Page components are
   unverified — the passkey flow was checked with a scripted browser and a
   virtual authenticator, but that check is not committed as a suite. The
   nearest thing is `server/routers/roleCoverage.test.ts`, which reads the page
   sources and asserts each one gates its controls on a role. That catches a
   screen shipped without a permission check; it does not catch a screen that
   renders wrongly, and it is not a substitute for a rendering test.
2. **Client bundle is ~2.2 MB** (585 KB gzipped) in one chunk — no code splitting.
3. **Legacy Manus/Replit integrations** (`server/replit_integrations/`,
   `vite-plugin-manus-runtime`, the OAuth portal path) are unused but still wired in.
4. **Most AI prompts are still inline** in router files and unversioned. The
   referee's is not: it lives in `server/prompts/referee.ts` as of 2026-08-15,
   carries a version (`referee/v2`) that is stored with every message it
   produces, and is covered by tests that need no model. Match analysis, the
   listing extractor and the date parser still hold theirs inline.

## Showing it to someone

`pnpm seed:demo` fills a database with three trips, eleven people and 150
votes — enough that every screen has something on it worth photographing. See
[runbooks/demo.md](runbooks/demo.md) for sign-in details and the shots worth
taking, and [ADR-0015](adr/0015-demo-data-lives-in-its-own-namespace.md) for
why it cannot delete anything it did not create.

Walked in a real browser against a real Postgres on 2026-08-11: sign-in, all
three trips, and the eleven screens the runbook lists. Two things to know. The
demo calls no model — the match scores and referee messages are seeded text, so
it runs with no AI key and costs nothing, but pressing **Get Referee Analysis**
on camera will overwrite the seeded copy if a key is configured. And the
photographs are hotlinked from Wikimedia Commons, which serves only thumbnail
widths it has already rendered; the seeded URLs use `960px-`, and an invented
width answers HTTP 400.

## Verifying the current state yourself

```bash
pnpm setup     # bootstrap
pnpm verify    # typecheck + tests + build — the definition of "working"
pnpm dev       # then open http://localhost:5000 and GET /api/health
```
