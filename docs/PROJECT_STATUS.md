# Project status

**Single source of truth for where this project stands.** Update it when you
finish a piece of work — the next person (or agent) starts here.

- **Last updated:** 2026-08-30
- **Name:** WeVoTrip (2026-08-30; was Back To Travelling, and Harmony before
  that). The domain is `wevotrip.com`, with the marketing demo at
  `demo.wevotrip.com`. Three identifiers still read the older names because they
  are registered outside this repo — `VITE_APP_ID` (`harmony`) at the OAuth
  portal, the Doppler project (`trip-harmony`), and nothing else. Rename them
  there before changing them here.
- **The native bundle id is `com.wevotrip.app`**, for both stores, chosen
  2026-08-30. It is the fallback in `capacitor.config.ts` and the value set in
  Doppler. Apple does not allow a bundle id to change after the first
  submission, so this one is effectively permanent.
- **Migrations 0016–0018 are applied** to the live database (2026-08-29), by
  hand through the Supabase API — see
  [runbooks/database.md](runbooks/database.md). The branch's schema and the
  database now agree.
- **One database, shared by preview and production.** The Supabase free tier
  gives one project, so a Vercel preview reads and writes the live data. Preview
  builds therefore do not migrate, every migration must be backward compatible
  with `master`, and applying one is a deliberate production change —
  [ADR-0023](adr/0023-preview-and-production-share-one-database.md). Recorded
  2026-08-29 after a branch's three migrations were missing from the preview it
  was being tested on, which is the same failure ADR-0010 exists for, arriving
  from the other direction.
- **In flight — shipping to the app stores.** The web app is being wrapped with
  Capacitor rather than rewritten in React Native: the 21k lines of client UI
  are Radix, Tailwind and DOM throughout, none of which survives a rewrite and
  all of which runs unchanged in a WebView. The server does not change. The
  critical path is store compliance, not Capacitor — account deletion, UGC
  moderation and privacy/terms routes — **all three done** (2026-08-28), none of
  which existed. What remains before a submission is not code: see
  [runbooks/launch.md](runbooks/launch.md). Billing is **done** (2026-08-28): a free
  account organises one trip at a time, sold through the stores' own IAP. What
  remains is the wrap itself:
  the session cookie is `SameSite=None` and iOS drops it in a WebView, so the
  session JWT has to travel as a bearer token, and `passkeys.ts` derives `rpID`
  from the request Host, which is `localhost` there.
- **Stage:** feature-complete MVP, deployed to production on Vercel.
  The trip experience overhaul is **complete** — all eight epics, covering the
  sixteen requested changes. The **groups and budget** programme (E9–E12) is
  complete too: a trip can be organised as families, everyone coming is counted
  whether or not they use the app, a family casts one vote, and Budget is a
  voting section rather than an expense journal. The **planning features**
  programme (E13–E16) is complete: a vote for having no preference and a refusal
  to finalise on nothing but those, self-service groups, families saved in the
  contact book, and preferences that offer themselves as proposals — the last of
  which had its parser corrected on 2026-08-25: a bare three-letter word beside a
  number was being read as a currency code, and the forms people actually write
  ("1200 GBP", "£1200pp", "Sept 12–19") were not being read at all. See
  [product/](product/) for the specifications and
  [product/progress.md](product/progress.md) for the story-by-story record.
- **Health:** typecheck ✅ · 1069 tests ✅ · production build ✅ (2026-08-30) ·
  dev server ✅
  (2026-08-24, after E13–E16: migrations 0000–0014 applied in order to a scratch
  Postgres 16 and the result diffed against `drizzle-kit push` of `schema.ts` —
  **no column disagreement**, the only differences being the functional and
  partial indexes `push` never creates. `ALTER TYPE … ADD VALUE` inside drizzle's
  migration transaction was the risk worth proving and it applied cleanly, as
  0010's did. Then walked through the tRPC caller against that database,
  inspecting payloads rather than renderings: three abstentions on one suggestion
  gave "3/3 voted" with a score of 0 and a `PRECONDITION_FAILED` on finalise,
  which cleared the moment one person voted Yes, and un-finalising was never
  refused; a tripmate created a group, was put in it, pulled a groupmate in, and
  was refused a member of a third group; `voterCount` counted the family once; a
  trip group saved to contacts appended nothing on a second save; importing it
  into a second trip previewed the one conflict **by name and wrote nothing**,
  then on confirmation moved them, added the child, invited the rest, and the
  invited account accepted into the right group with its attendee row in the same
  group and the pet in the headcount but not among the people; "about £1,200 a
  family. Free 12-19 September." produced exactly two suggestions with the budget
  at `per_group`, the £9,000 in the dealbreakers box produced none, accepting the
  budget stopped it being offered and dismissing the date stopped that; and a
  watcher's `groups.list`, `groups.attendees` and `trips.members` carried no
  caps and no ages, with `suggestions.fromPreferences` refused outright.
  Then walked in a real Chromium at phone width, which found the one bug the
  payload checks could not: every accepted member has an attendee row, so the
  new member chips rendered each person twice in their own group card. Fixed —
  the attendee chips are now the people with no account. The abstain button,
  the "1/1 voted · 1 going with the majority" line, the disabled Finalise, the
  two preference suggestions with their scope picker, and the import
  confirmation naming "Sam is already on this trip in The Shahs" were all
  confirmed on screen. Dragging a member chip between families was then added
  and verified the same way — under a Pixel 5 profile with synthesised touch
  events, the chip drags, the target card highlights and the member lands in
  it. Worth recording that the first implementation looked like it did not work
  at all: the chip in hand is under the pointer for the whole gesture, so the
  hit test resolved every drop back to where the drag started.)
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

- **✅ The app was slow everywhere, for three compounding reasons** (2026-08-25).
  Reported as "dragging a member between families does nothing, so people drag
  again", and that turned out to be two bugs sharing a symptom.

  The **drag** one is `dragSnapToOrigin` returning the chip to its origin card on
  pointer-up while `groups.assignMember` had no optimistic update, so nothing
  could move the chip until the mutation and **five** cache invalidations had all
  returned. The mutation now patches `trips.members` and `groups.attendees` in
  `onMutate` and rolls both back on failure, the transform is zeroed rather than
  animated home, and a `layoutId` carries the chip into its new card. Two
  invalidations, and on a member-voting trip, one — `groups.list` cannot change
  on an assign and `trips.get` only moves when the trip votes by group.
  [ADR 0021](adr/0021-optimistic-updates-for-drag-and-drop.md).

  The **everywhere** one is why that window was long enough to notice:
  - `getTripMembers` queried twice per member, sequentially, and is reached five
    or six times per page load via `getTripHeadcount`, `getTripVoterCount` and
    four procedures directly — ~126 round trips for one screen, queued three at a
    time. Now two queries. `getUserTrips` and `getComments` had the same shape.
  - **`drizzle/schema.ts` declared no indexes at all**, so nothing from the
    original schema had one — including `trip_members (tripId, userId)`, which
    `requireTripRole` runs on every trip-scoped procedure. Migration
    `0015_hot_path_indexes.sql` adds eleven.
  - `requireTripRole` did that lookup once per procedure, and the client batches
    eight to ten into one request. Now once per request, via an
    `AsyncLocalStorage` cache that never outlives the request and never caches
    the _decision_. [ADR 0022](adr/0022-membership-is-read-once-per-request.md).
  - `new QueryClient()` had no `staleTime`, and wouter unmounts pages, so every
    navigation refetched the destination's whole query set. Thirty seconds now.
  - All fifteen pages were imported statically: entry chunk 1,917 kB → 561 kB
    (gzip 560 → 172 kB).
  - `lastSignedIn` was written on every request; now at most once per ten minutes
    per user.

  **`DB_POOL_MAX` is deliberately unchanged.** It is the budget these paths had
  to be made to fit inside, not the problem — see the note below, which stands.
  If page loads feel slow again, count the queries before touching it.

  Verified by `pnpm verify` — typecheck, 881 tests, production build — and by the
  chunk report. **Not** walked in a browser, and **migration 0015 has not been
  applied to any database**: this environment cannot reach the pooler, as it
  could not for the pool cap below. The migration is additive, every statement is
  `IF NOT EXISTS`, and it touches no data. Two new tests stand in for the
  generator that cannot run here: every index declared in `schema.ts` must appear
  in a committed migration, and the journal and the `.sql` files must name the
  same set in a strictly forward order.

- **✅ The database pool is capped, after production ran out of pooler slots**
  (2026-08-24). One visit to the demo trip produced 76 failed queries in 18
  seconds — trips, members, sign-in and passkeys all 500ing on
  `(EMAXCONNSESSION) max clients reached in session mode … pool_size: 15`.
  The session pooler shares those 15 slots across every warm Vercel instance
  and `server/db.ts` created its pool with no `max`, taking pg's default of 10;
  a batched page load fans out eight procedures, which is enough to warm a
  second instance and overrun the budget. The pool now caps at `DB_POOL_MAX`
  (default 3), returns idle connections after 10s, and retries a refused
  connection three times — safe, because the pooler refuses before any
  statement is sent. **This does not change [ADR 0012](adr/0012-session-pooler-for-the-database-url.md):
  the app stays on the session pooler at 5432.** If the retry warnings
  (`pooler out of connection slots, retrying`) become common, the answer is a
  smaller fanout or a bigger budget, not a bigger `DB_POOL_MAX` — raising it
  only lets one instance crowd out the others. Verified by unit test and
  typecheck; **not** exercised against the live pooler, which this environment
  cannot reach.

- **Migrations 0012–0014 have not been applied to production yet** (2026-08-24).
  All three are **additive**: nothing is dropped and no existing row changes, so
  they can go out with or ahead of the code. 0012 adds `majority` to the four
  vote enums and contains nothing else — Postgres will not let a value be _used_
  in the transaction that added it, and drizzle may apply several pending
  migrations in one, so **no migration after 0012 may reference `majority`**
  (0013 and 0014 do not). 0013 adds `contact_groups`, `contact_group_members`
  and `trip_invites.groupId`; without that column an imported family accepts
  into ungrouped memberships and an empty group. 0014 adds
  `suggestion_dismissals`.

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
  0019 adds `product_events` and is the first migration to close its own table:
  it enables RLS and revokes the two Supabase roles itself, guarded so a plain
  Postgres without those roles still applies it. It is purely additive, so it
  is backward compatible with `master` as ADR 0023 requires, and it has **not**
  been applied yet — a preview build will not apply it, so it lands with the
  production deploy of this change. `pnpm db:status:doppler` confirms.
- **The beta can now be measured.** Eleven product events — trip created,
  invite sent, invite accepted, preference saved, proposal created, vote cast
  or changed, referee run, dates finalised, accommodation finalised, trip
  completed, trip cancelled — recorded server-side into `product_events`,
  against the contract in `shared/productEvents.ts`. A budget is a proposal
  like any other now, so it is counted as `proposal.created` with
  `kind: "budget"` rather than under an event of its own. No vendor, no
  client-side script, and no free-text column: metadata may only be an enum, a
  boolean or a count, which is why "privacy-safe" is a property of the schema
  rather than a promise. Nothing in the API reads it; the four questions are
  answered with the SQL in
  [runbooks/beta-metrics.md](runbooks/beta-metrics.md). Reasoning and the
  honest costs — rows outlive their trips, no retention policy, two event
  vocabularies to keep straight — are in
  [ADR 0024](adr/0024-first-party-product-measurement.md). Not yet run against
  real traffic: the events are covered by tests, not by a production sample.
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

| Environment         | Status                 | Notes                                                                         |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Local               | ✅ Working             | `pnpm setup && pnpm dev` → http://localhost:5000                              |
| Database (Supabase) | ✅ Live, migrated      | `Trip Harmony` `eqpqjivaubdbdmyrlczh`, eu-west-1. All six migrations applied  |
| Preview (Vercel)    | ⚠️ Not yet provisioned | Config is in place — see [runbooks/deployment.md](runbooks/deployment.md)     |
| Production (Vercel) | ✅ Live                | `www.wevotrip.com`, project `trip-harmony`, team `saurabhs-projects-4d5cc478` |
| Sales demo          | Same deployment        | `demo.wevotrip.com` — one build, two domains; gated on the Host header        |

Production serves from `www.wevotrip.com` (the apex 308-redirects to
`www`). `/api/health` returns `"status":"ok"` with
`"databaseSource":"DATABASE_URL"`.

`demo.wevotrip.com` is the **same deployment**, not a second one. The
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

1. **No frontend tests.** Nearly all 653 tests are server-side. Page components are
   unverified — the passkey flow was checked with a scripted browser and a
   virtual authenticator, but that check is not committed as a suite. The
   nearest thing is `server/routers/roleCoverage.test.ts`, which reads the page
   sources and asserts each one gates its controls on a role. That catches a
   screen shipped without a permission check; it does not catch a screen that
   renders wrongly, and it is not a substitute for a rendering test.
2. **Client bundle is ~2.2 MB** (585 KB gzipped) in one chunk — no code splitting.
3. **Legacy Manus/Replit integrations** (`server/replit_integrations/`,
   `vite-plugin-manus-runtime`, the OAuth portal path) are unused but still wired in.
4. **No retention or erase path for the two event tables.** `activity_events`
   and `product_events` both grow without bound and neither can answer "delete
   everything about this person". Accepted for a beta and recorded in ADR 0016;
   it has to be built before the product is anything more than one.
5. **Most AI prompts are still inline** in router files and unversioned. The
   referee's is not: it lives in `server/prompts/referee.ts` as of 2026-08-15,
   carries a version (`referee/v2`) that is stored with every message it
   produces, and is covered by tests that need no model. Match analysis, the
   listing extractor and the date parser still hold theirs inline.

## Showing it to someone

`pnpm seed:demo` fills a database with three trips, eleven people, three saved
families and 125 votes — enough that every screen has something on it worth
photographing. See
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

The fixture was brought back level with the schema on 2026-08-25: it had been
written before the abstention vote, saved families and preference-derived
proposals shipped, so the demo showed none of them. It now carries a
`majority` vote in each of the four vote tables, three saved families in Ava's
address book (one of them imported into the Lisbon trip, which is why an invite
there carries a group), and one dismissed suggestion. Verified by seeding a
real Postgres and reading the rows back through the app's own
`suggestions.fromPreferences` and `planImport` — not in a browser.

## Verifying the current state yourself

```bash
pnpm setup     # bootstrap
pnpm verify    # typecheck + tests + build — the definition of "working"
pnpm dev       # then open http://localhost:5000 and GET /api/health
```
