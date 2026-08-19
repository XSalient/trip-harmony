# Changelog

Notable changes, newest first. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are ISO-8601.

Add an entry for anything user-visible or anything that changes how the project
is built, run or deployed.

---

## 2026-08-19 — Not a travel planner

### Removed

- **The Vibe Board and the Itinerary are gone.** Both were built for a
  group-travel product; neither has a role in an app whose job is proposing
  things and voting on them. Gone with them: the `vibeBoard` and `itinerary`
  tRPC routers, their screens (`TripVibeBoard.tsx`, `TripItinerary.tsx`) and
  routes, their sections on the trip page, the itinerary line on the trip
  summary, and their query functions in `server/db.ts`. Clone and delete no
  longer carry or clear rows that no longer exist.

- **The vibe tags on a suggestion are gone too** — the twelve-chip picker
  ("Beach", "Mountains", "Foodie", …) in the add and edit dialogs, the badges on
  each card, and the `vibes` column behind them. They described a destination,
  and a suggestion is no longer necessarily one.

- **`vibe_items`, `vibe_votes`, `itinerary_days` and `itinerary_items` are
  dropped**, along with the `vibe_vote` and `itinerary_item_type` enums
  (migration `0006_drop_vibe_board_and_itinerary`), and so is
  `destinations.vibes` (migration `0007_drop_destination_vibe_tags`). **Both are
  destructive and irreversible.** The deploy applies them, so take a backup
  first if any production row is worth keeping.

### Changed

- **"Places" is now "Suggestions".** The section takes anything the group wants
  to discuss and vote on, not only a destination, so the heading, the summary
  line, the empty states, the dialogs and the route (`/trips/:id/destinations`
  → `/trips/:id/suggestions`) all say so. **Any bookmark to the old path now
  404s.** The router, the tRPC namespace and the `destinations` table keep their
  original names — renaming them would cost a data migration and change no
  behaviour — so expect the two names side by side; `drizzle/schema.ts` and
  `docs/architecture/data-model.md` say as much.

## 2026-08-15 — Back means back

### Fixed

- **The back arrow pushed history instead of unwinding it.** Every screen passes
  `backHref`, so `AppShell` always took the `navigate(backHref)` branch — and
  `navigate` is `pushState`. Backing out of a screen therefore _appended_ to the
  history stack rather than popping it, and the browser's own back button then
  replayed the trail forwards: from a trip page it took you into the section you
  had just closed. The arrow now pops when a screen of ours is behind it, and
  falls back to `backHref` — replacing, not pushing — when none is, which is the
  case on a deep link or the first paint after a redirect. Depth is counted from
  the history events wouter already dispatches and stamped onto
  `history.state`, so it survives a reload; see `client/src/lib/navigationDepth.ts`.

- **Being bounced to the landing page trapped the back button.** Both redirects
  — the `useAuth` watcher and the global unauthorised-error subscriber —
  assigned `window.location.href`, which pushes. The screen you were bounced out
  of stayed behind you, so pressing back returned to it, it asked the same
  unauthorised question, and it bounced you forward again. Both now use
  `location.replace`.

- **A database blip signed you out.** `createContext` caught every error from
  `authenticateRequest` and set `user = null`, so a dropped connection or a pool
  timeout was indistinguishable from a missing cookie: protected procedures
  answered `Please login (10001)`, and the client redirects on exactly that
  message. Tapping a trip could throw you straight back to the list. Errors that
  are not an `HttpError` — the class `authenticateRequest` raises for verdicts it
  reaches itself — are now flagged as indeterminate and refused as
  `INTERNAL_SERVER_ERROR` by `requireUser` and by `auth.me`, and the cause is
  logged rather than swallowed.

- **`auth.me`'s timeout aborted whatever it was batched with.** The 15-second
  abort was applied by sniffing the request URL for `auth.me`, but a batched
  tRPC URL names every procedure in the batch — so it matched whenever `auth.me`
  merely travelled alongside the trip page's fifteen queries, and aborting the
  request aborted all of them. A slow batch failed `auth.me`, which reads as
  signed out, which bounced you home. `auth.me` now travels on its own unbatched
  link via `splitLink`, so the timeout applies to it and nothing else.

- **The trips list offered trips the trip page refuses.** `getUserTrips`
  selected every membership row regardless of status while `trips.get` runs
  `requireTripRole`, which rejects anything that is not `accepted` — so a
  declined membership rendered as a tappable card that could only land on "Trip
  not found". The list is now filtered to accepted memberships.

---

## 2026-08-15 — The AI Referee says what it saw, and admits when it saw nothing

### Fixed

- **A failed referee run read exactly like a trip with no conflicts.** When the
  model call threw, the referee stored an encouraging nudge — "Keep the momentum
  going — every vote counts! 🎯" — as a mediation message, and the error was
  swallowed without a log line. Nobody looking at the screen could tell an
  outage from harmony, and nobody debugging it had anything to read. A run that
  fails now answers **"Analysis unavailable — I have not read this trip"**,
  which says in as many words that silence is a failed request and not a trip
  without conflicts.

  Two consequences worth knowing. The failure is **not stored**: the cooldown is
  the age of the newest stored message, so persisting it would have locked the
  button for ten minutes over an outage that may last seconds, and would have
  left "Analysis unavailable" standing as the group's most recent read. And a
  deployment with **no AI provider** now says that specifically, checked before
  the trip is read rather than after seven queries — the same lesson
  `accommodations.fetchFromUrl` learned. Successful runs keep the ten-minute
  cooldown exactly as before.

- **The referee could not see what the accommodations screen had already
  found.** A stay could show `AI Match 42/100`, `High risk` and a failed
  must-have on `/trips/:id/accommodations` while the referee, which had only
  ever been given vote tallies, reported the group in harmony. Two AI features
  reading the same trip disagreed because one was never shown what the other
  had recorded. The referee's context now carries each stay's stored
  `matchAnalysis` — group fit, resentment risk, flags and the per-member
  verdicts — and a stay that has never been analysed is named as such, which is
  not the same as a stay that scored well.

- **Money is divided by the server now.** `perPersonShare` and
  `exceedsBudgetCapFor` are computed from the stored price and each member's own
  cap, and the prompt tells the model to quote them rather than recompute them.
  A model asked to split a total across four people and compare it against three
  different caps will eventually get one wrong and say so with complete
  confidence.

### Changed

- **The referee's prompt moved out of the router into
  `server/prompts/referee.ts`**, with a version — `referee/v2` — persisted in
  the `context` JSON that referee messages already store. No migration: that
  column is text holding JSON. Messages written before this carry no
  `promptVersion` and are v1, the inline prompt.

  The prompt itself now demands what a mediator should always have been asked
  for: observed facts and the recommendation under separate headings; only
  proposals, people, votes, preferences and prices that appear in the supplied
  context; missing data named rather than inferred; must-haves treated as
  constraints that disqualify a proposal rather than preferences to be averaged
  away; the specific trade-off behind the recommendation, including who is worse
  off; and no claim to have decided anything, because it hasn't.

  The context it reasons about is assembled by a pure function, and includes a
  `dataGaps` list written in plain English — who set no preferences, what nobody
  has voted on, which stays were never analysed — so "I don't know" is a fact
  the referee can repeat rather than an absence it has to notice.

### Added

- **`server/prompts/referee.test.ts` and `server/routers/referee.test.ts`** — 42
  tests, no model, no database, no network. The four situations the referee
  exists for are asserted directly on the facts it is handed (an accessibility
  must-have nothing satisfies, a stay that breaks two members' caps, a group
  who never filled the preference form in, a proposal nobody has voted on), and
  the endpoint's behaviour is asserted against a stubbed model: the failure is
  reported as a failure and stored nowhere, an empty completion counts as a
  failure, admin-only access and the cooldown are unchanged.

## 2026-08-14 — Signing in and out works again

### Fixed

- **Taking a demo seat put you back on the landing page instead of into the
  trip.** The sign-in itself worked — the cookie was set, and reloading the page
  showed the seat's three trips — so the whole of the failure was that the
  screen was never told. Emptying the query cache on every change of session had
  just been introduced, which was the right intent and the wrong call:
  `queryClient.clear()` removes each query from the cache and destroys it, but a
  React Query observer is subscribed to the _query_, not to the cache, so
  removal notifies nobody. `Home` went on rendering the signed-out landing page
  from an observer bound to a query that no longer existed, and the
  `auth.me` refetch that followed walked an empty cache and fetched nothing.

  Confirmed on the deployed demo before it was changed: after `auth.demoSignIn`
  answered 200, the network log shows `auth.capabilities` and
  `trips.getByInviteCode` refetched and **no second `auth.me` request at all**.
  Signing out, which reaches `auth.me` by a different route, does show one.

  Every way into a session goes through `useSessionSwitch`, so this was all four
  of them — password, register, passkey, magic link — and the demo seat picker,
  where it is most visible because switching seats is the point of it.

  The reset now goes through `resetSessionCache`, which uses `resetQueries`: the
  queries stay where their observers can see them, are put back to a dataless
  state (so no frame is drawn with the last session's data, which was the point
  of clearing), and the ones still mounted are re-answered under the new
  session.

- **Signing out asked a dead session three questions.** `resetQueries` is right
  on the way into a session and wrong on the way out of one, where what is
  mounted is a dashboard full of protected queries and a cookie that has just
  been cleared: `trips.list` and `notifications.unreadCount` would both have
  refetched and both answered 401, in the console, for answers discarded a frame
  later when the screens unmounted. `discardSessionCache` resets each query
  directly instead — the same notification to the same observers, which is all
  `resetQueries` does beyond the refetch — and asks nobody anything.

### Added

- **`client/src/_core/hooks/sessionCache.test.ts`** — the first test under
  `client/`, which `vitest.config.ts` now collects. It mounts a real
  `QueryObserver` on a real `QueryClient`, which is the whole of the bug: an
  observer is what a rendered component amounts to as far as the cache is
  concerned. Four assertions, two per direction — the mounted query is
  re-answered for the new session and nothing of the previous one survives; the
  way out notifies the same observer and fires no request. The first fails
  against `clear()`, which is how this was found and how it stays found.

---

## 2026-08-14 — The watcher role, applied everywhere instead of on one screen

### Fixed

- **Watchers no longer see controls they cannot use — on any screen.** The
  contribute rule was written once, on the trip dashboard, and nowhere else:
  every other screen asked only "am I an admin?", so a watcher opening Dates,
  Places, Accommodations, Itinerary, Vibe Board, Budget or Preferences was
  offered vote buttons, Add buttons, edit and delete menus and a comment box,
  each of which the server then refused. All ten trip screens now take their
  permissions from one hook, `useTripRole`, and say in a line why the buttons
  are missing rather than looking broken.
- **The AI match analysis is no longer sent to watchers.** The per-member
  breakdown names each member and quotes the requirement they wrote ("needs
  step-free access after surgery") — the most personal thing in the app, and
  the one field the watcher projection had missed. The vibe board's proposer
  was leaking the same way, under a second spelling (`proposedByUser`).
- **`comments.list` checked nothing at all.** Any signed-in account could read
  any proposal's comment thread by guessing an id, member or not. It now
  requires tripmate on the thread's own trip, and the query is scoped to that
  trip so a guessed id cannot reach another one.
- **`notifications.markRead` took an id and trusted it.** Now scoped to the
  caller in the query itself.
- **Three AI endpoints were open to any signed-in account** —
  `dates.parseNatural`, `accommodations.fetchFromUrl` and
  `accommodations.parseAttributes` each spend a model call and took no trip.
  They now take the trip they are proposing into, and require tripmate on it.
- **Switching demo seats showed the previous seat's data.** Signing in only
  invalidated `auth.me`, leaving every other cached query — so taking Nina's
  watcher seat after Ava's admin seat painted Ava's three trips and Ava's
  controls first. Every path that changes who the session belongs to now goes
  through `useSessionSwitch`, which empties the cache before anything is read
  back. That covers signing out too.

### Added

- **`server/routers/roleCoverage.test.ts`** — a sweep, not a sample. Every
  trip-scoped procedure must state the role it needs (with a written reason for
  each of the eleven that legitimately need none), and every trip screen must
  take its role from the hook and gate its write controls. It fails when the
  _next_ endpoint or screen arrives without a role on it, which is the failure
  this release was.

---

## 2026-08-11 — A seeded demo, for showing the product to people who don't have one

### Added

- **`pnpm seed:demo` fills a database with three trips worth photographing.**
  An empty app demonstrates nothing, and the screens that make this product
  worth explaining — the vote tallies, the AI match scores, the referee naming
  a conflict — only exist once a group has argued in it. The demo is a group
  of seven mid-argument over the Algarve, a group of five who cannot find a
  week in March, and a Kyoto trip that finished under budget: 11 people, 150
  votes, 8 referee messages, 5 accommodations scored against every member's
  stated requirements, and the accessibility conflict that the referee refuses
  to treat as a matter of taste. Copy lives in `scripts/demo/story.ts`; a
  marketer can rewrite the whole demo without touching the runner.
- **`docs/runbooks/demo.md`** — sign-in details, the eight screens worth
  photographing in the order they sell, and the two buttons not to press on
  camera.

### Changed

- Nothing in the app. The seeder writes rows the app already understands; no
  server or client code was touched.

### Safety

- **The seeder cannot delete a row it did not create.** Demo users carry a
  `demo:` prefix on `openId` and demo trips a `DEMO-` prefix on `inviteCode`;
  the reset selects on those and nothing else, and trips go through the same
  `deleteTripCascade` the app's own delete path uses. Re-running replaces the
  demo rather than duplicating it.
- **It refuses a database it was not told about twice.** Not-localhost needs
  `--allow-remote`; `APP_ENV=production` needs `--allow-production` as well,
  and refuses the published default password on top. The policy is pure and
  unit-tested in `scripts/demo/options.test.ts` — 17 tests, mostly about
  refusing. See [ADR-0015](adr/0015-demo-data-lives-in-its-own-namespace.md).

---

## 2026-08-10 — The vote score says what it is, and "not analysed" says what it isn't

### Changed

- **The green number on an accommodation or destination card explains itself.**
  It is a weighted vote total — Yes +2, Maybe +1, No −3 — so a stay with a
  single Yes read "+2" with nothing on the screen saying what was being counted.
  Tapping it now opens the arithmetic: the tally per vote, what each is worth,
  and the total. The weights and the sort comparator moved into
  `client/src/components/trip/VoteScore.tsx`, replacing the copy of the formula
  each page kept, so the badge and the card order cannot disagree.
- **"Not analysed yet" now distinguishes itself from the listing import.**
  Importing a Booking.com URL fills the form in with a model call, and AI match
  analysis is a second, admin-triggered model call that scores the stay against
  every member's preferences — so a stay whose every field arrived from the
  listing still, correctly, had no analysis. The old copy read as though the
  import had failed. It now names what has not run and what it would do.

---

## 2026-08-10 — Doppler and Vercel finally agree, and AI is configured

### Fixed

- **Every AI call would have 404'd, with `/api/health` reporting
  `ai: configured`.** `llm.ts` hardcoded `gemini-2.5-flash`, and Google now
  answers that model with
  `404 NOT_FOUND: "no longer available to new users"` — a retirement wearing a
  not-found error. Caught by calling the API with the project's own key rather
  than trusting the health check, which only ever knew whether a key was
  present. The model is now `AI_MODEL`, defaulting to `gemini-3.6-flash`
  (verified end-to-end against that key), and `/api/health` reports `aiModel`
  so the next retirement is visible instead of silent. Pinned rather than
  `gemini-flash-latest`: an alias changes which model answers production
  traffic with no deploy and no notice, which is the same surprise.

- **AI works.** `AI_INTEGRATIONS_GEMINI_API_KEY` had never been set in any
  environment — not on Vercel under any name, not in Doppler. It is now in
  both, so the referee, natural-language date parsing, listing-URL import and
  match analysis have a provider for the first time.
- **`MAIL_FROM` in Doppler was a single control character.** Copied across from
  Vercel, where it is a `plain` variable and therefore readable — unlike the
  `encrypted` ones, which the API only ever returns as ciphertext.

### Removed

- **`APP_ENV` is gone from Doppler.** It said `development`, and Doppler pushes
  a whole config, so a `dev` → Production sync would have told the production
  server it was a development environment — relaxed validation, debug logging,
  development cookie settings. `resolveAppEnv()` already derives it from
  `VERCEL_ENV` and gets local and deployed right unaided, so the variable was
  not merely wrong in one place, it was unnecessary in all of them.
- **The Manus OAuth pair, `OAUTH_SERVER_URL` and `VITE_OAUTH_PORTAL_URL`.**
  `getLoginUrl()` is exported from `client/src/const.ts` and never called, so no
  UI path has ever reached the portal, and `OAUTH_SERVER_URL` only fed a
  `/api/oauth/callback` route nothing links to. `/api/health` now says
  `oauth: disabled`, which is accurate rather than a regression. The code is
  still present and is a good follow-up; it was left alone here because
  `sdk.ts` also carries the live session path.

### Changed

- **Vercel and Doppler `dev` now hold the same 11 variables**, with no
  duplicates on either side. Vercel went 23 → 11 across the two passes.

---

## 2026-08-10 — Kill switches, and a Vercel environment with 16 variables nobody read

### Added

- **`AI_ENABLED` and `SCRAPER_ENABLED`.** Until now the only way to stop
  calling a provider was to delete its key, which conflates "pause this
  feature" with "rotate this secret" — and the scraper's key is one you pay
  for. Both flags are opt-out: empty or unset means on, and only an explicit
  `0`/`false`/`no`/`off`/`disabled` turns a feature off, so a typo cannot
  silently disable a paid feature and adding the variable somewhere it is
  missing cannot switch a working one off. `/api/health` now distinguishes
  `off` (turned off deliberately) from `missing`/`disabled` (never set up).

### Changed

- **The Vercel environment went from 23 variables to 12, with no duplicates.**
  Sixteen managed by _Supabase's_ integration were deleted. Eleven were read by
  no code at all (`SUPABASE_*`, `POSTGRES_HOST`/`USER`/`PASSWORD`/`DATABASE`/
  `PRISMA_URL`) — including two unused high-privilege credentials,
  `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY`, sitting in a project
  that has never used Supabase's client. Three were `NEXT_PUBLIC_SUPABASE_*`:
  Next.js naming in a Vite app, where the prefix does nothing, and duplicates of
  the `SUPABASE_*` trio besides. The last two, `POSTGRES_URL` and
  `POSTGRES_URL_NON_POOLING`, _are_ read as `DATABASE_URL` fallbacks by both
  `env.ts` and `scripts/lib/migrations.mjs`, and point at the IPv6-only direct
  host Vercel cannot reach — a live footgun the moment `DATABASE_URL` is unset
  or mistyped ([ADR 0012](adr/0012-session-pooler-for-the-database-url.md)).
- **Production has the scraper configuration it was missing.**
  `SCRAPER_API_KEY`, `SCRAPER_PROVIDER`, `SCRAPER_ENABLED`, `AI_ENABLED` and
  `PUBLIC_BASE_URL` are now set on the Vercel project. `PUBLIC_BASE_URL` had
  never been set in any environment, though it fixes the passkey relying party
  and the origin of magic-link and invite URLs.

### Fixed

- **A correction to the previous entry's diagnosis.** It concluded that no
  Doppler → Vercel integration existed, inferred from `GET /v3/integrations`
  returning an empty list. That inference was wrong: the agent's Doppler
  credential is a config-scoped service token and cannot enumerate workplace
  integrations, so the empty list carried no information. Audited properly
  against the Vercel API, the Doppler integration **is** installed
  (`icfg_aMeJc62QWO3IQhXzNK4GeaH5`, `projectSelection: "all"`, holding
  `read-write:project-env-vars`) — but its `updatedAt` equals its `createdAt`
  and not one variable on the project carries its `configurationId`. The
  integration is installed and authorised; the per-config **sync** was never
  created. The observation was right and the explanation was not.

---

## 2026-08-10 — Switching scraper vendor is configuration; trips can be copied and deleted

### Added

- **Admins can duplicate or delete a trip.** A ⋮ menu on the trip header holds
  edit, duplicate and delete. A copy carries the dates, places,
  accommodations, vibe board and itinerary and gets its own invite code;
  votes, comments, locks, budget spend, referee messages, activity and members
  stay with the original, because a clone is the same trip run again for a
  different group. Deleting asks for the trip's name to be typed back — it
  removes the trip for everyone on it — and notifies the other members before
  the rows go. `db.deleteTripCascade` removes all fourteen trip-scoped tables
  plus the vote and attribute rows that key off a proposal id, in one
  transaction; a test compares that list against the schema so the next
  trip-scoped table cannot be forgotten.
- **Anyone on a trip can be saved to your contact book.** The book used to fill
  up only as a side effect of sending an email invite, so the people you had
  actually travelled with were the ones missing from it — anyone who joined by
  following the shared link left no trace. Every tripmate and admin now gets
  "Save to my contacts" beside a member's name. `contacts.addFromTrip` takes a
  trip and a user id and reads the address from the membership, never from the
  caller; watchers are excluded, since they are never shown member emails.
- **`SCRAPER_RENDER_PARAM`**, and `basic` as a value for `SCRAPER_API_KEY_IN`
  (HTTP Basic with the key as the username). Between them, a vendor that names
  its render flag differently or authenticates at the transport is now
  configurable rather than a code change. Presets added for ScrapingAnt,
  ScrapingDog, Crawlbase (alias `proxycrawl`) and Zyte.

### Fixed

- **`ai: missing` with a valid Gemini key.** `config.ai.isConfigured` required a
  base URL as well as a key, but `@google/genai` already knows Google's
  endpoint — `AI_INTEGRATIONS_GEMINI_BASE_URL` is an override for a proxy or the
  legacy Forge gateway. The cost was not cosmetic: `accommodations.fetchFromUrl`
  reads the same flag and refused every listing-URL import before attempting
  one. The key alone now counts, and `/api/health` reports `aiKeySource` — the
  name of the variable the key came from, never its value.
- **A vendor's own spelling of its name switched the scraper off.** The `dev`
  config held `SCRAPER_PROVIDER=scraperapi.com`, which is what ScraperAPI's
  dashboard calls itself and what the resolver rejected as an unknown service.
  Provider names are now reduced to the vendor first — a URL to its host, a host
  to its name minus `api.`/`www.` and its public suffix — so `scraperapi`,
  `ScraperAPI`, `scraper-api`, `scraperapi.com` and
  `https://api.scraperapi.com/` are one service. Verified end-to-end against the
  real `dev` key: `HTTP 200`, page extracted.
- **A misconfigured scraper reported itself as switched off.**
  `isScraperConfigured()` demanded a provider name as well as a key, so a name
  the resolver would have rejected read as "this rung was left off" — and a rung
  that reports itself off is one nobody goes looking at. The key alone decides
  now, and `/api/health` has a third state, `misconfigured`, with a
  `scraperError` saying why. It also reports the resolved endpoint and where the
  key goes, since "right key, wrong URL for this plan" is the failure this rung
  actually has.
- **Proposal screens opened part-way down.** Wouter swaps the component tree
  and leaves the scroll offset alone, so opening Places from halfway down the
  trip page landed halfway down Places, with its heading and its "Unlock all" /
  "Add" buttons already scrolled past. A new screen now starts at its top;
  going _back_ still restores where you were.
- **"Unlock all" and "Add" could sit off the right edge.** The header strip on
  Dates, Places and Accommodations was written three times and had the same bug
  three times: the left column could not shrink while its "3 finalised ·
  Barcelona, Girona, Sitges" line grew with the trip. It is now one
  `ScreenHeader` — the summary truncates, the buttons never shrink, and they
  wrap to their own line before anything leaves the screen.

### Changed

- **A vendor with no preset needs no preset.** `SCRAPER_ENDPOINT` alone now
  describes a service, with or without a name for it; an unrecognised name is
  only an error when there is no endpoint to go with it, since the one thing
  worth refusing is posting a live key at an address nobody supplied.
  `SCRAPER_PROVIDER=custom` still works and is no longer special.

---

## 2026-08-10 — The scraper rung was configured, and off

### Fixed

- **The dev scraper key was named `SCRAPER_API_LET`.** `server/_core/env.ts`
  declares `SCRAPER_API_KEY`, so the typo meant no key, and no key means the
  whole rung is off — imports from sites that refuse us degraded silently, as
  though the fallback had never been set up. The Doppler `dev` config now holds
  the value under the right name.
- **`SCRAPER_PROVIDER` was `scrapeowl.com`, which is not a preset.** Provider
  names are lowercased and stripped to letters before lookup, so the `.com`
  made it an unknown service; the preset is `scrapingowl` (and `scrapeowl`
  is an accepted alias). Corrected in `dev`. These two mistakes compound in one
  direction only: the missing key is checked first, so it hid the bad provider
  name entirely rather than letting it fail loudly.
- **`scripts/doppler-bootstrap.sh` said it was derived from `env.ts` and
  wasn't.** It prompted for 8 of the 36 declared variables and omitted every
  `SCRAPER_*` — including the secret `SCRAPER_API_KEY`, the one variable that
  turns the rung on — and every `SMTP_*`. It now covers all 36: 30 prompted
  (SMTP and the scraper's per-field overrides behind a prompt, since they are
  only needed for a fallback or a `custom` vendor) and 6 named in a `SKIPPED`
  list with the reason each needs no answer. A check at the end of every run
  compares both lists against `env.ts` and reports anything new, so the header's
  claim now enforces itself.
- **The bootstrap script no longer half-configures an environment.** With stdin
  redirected, the first `read` hit EOF and `set -e` abandoned the run after
  `APP_ENV` had already been written. It now refuses to start without a
  terminal, and a `Ctrl-D` at one prompt skips that variable instead of the
  rest of the run.

### Changed

- **Secrets are listed by name, not by value.** `docs/runbooks/secrets.md` now
  points at `doppler secrets --only-names` and spells out that bare
  `doppler secrets`, `secrets get` and `secrets delete` all print values, and
  that masking does not survive a pipe, a log or a transcript. The bootstrap
  script's "is this already set?" check reads names only, where it used to read
  the value back and discard it.
- **A new "Agent sessions" section** in the same runbook: an agent's terminal
  output is a durable transcript, so listing by name, testing presence with
  `[ -n "$VAR" ]`, and holding a **read-only** `dev`-scoped token are rules
  rather than preferences.

---

## 2026-08-10 — Listing imports that used to fill nothing

### Fixed

- **"That site blocked our request" no longer hides a missing AI provider.**
  Extraction is a model call, so with `AI_INTEGRATIONS_GEMINI_API_KEY` unset
  every listing URL failed — including pages we had read perfectly — and the
  message sent people to the paste box, which needs the same model. The
  endpoint now returns `error: "ai-unavailable"` before spending the request,
  and `"extraction-failed"` when the model call itself fails; the UI says which.
  Production is in exactly this state today: `/api/health` reports
  `"ai":"missing"`.

- **An Airbnb room link no longer imports as "Could not extract details".**
  `airbnb.com/rooms/36276450` encodes a number and nothing else, so when the
  site refused a server-side fetch there was no property name for the URL-hint
  or Google Places rungs to work from, and the endpoint returned
  `success: false, source: "none"` with an empty form. It now has a page to
  read whenever the scraper fallback below is configured, and the diagnosis is
  visible either way (`pnpm diagnose:url`).
- **A Booking.com share link no longer names the stay after the share code.**
  `booking.com/Share-ZPdrnKD` was turned into a property called
  "Share ZPdrnKD", which was then used as a Google Places search. Path tokens
  that are identifiers wearing letters — no vowel, or a case change mid-word —
  are no longer treated as words.
- **Share links now resolve to the page they point at.** Booking.com answers
  `/Share-…` with a `302` and only puts the robot check at the destination, so
  the redirect is readable even when the page is not. Following it turns a
  share link back into a property name, a country and the stay dates. Hops into
  private address space are neither followed nor returned.

### Added

- **An optional scraper fallback for sites that refuse us**, off by default and
  turned on with `SCRAPER_PROVIDER` + `SCRAPER_API_KEY`
  ([ADR 0013](adr/0013-optional-scraper-fallback-for-blocked-listings.md),
  amending [ADR 0008](adr/0008-listing-import-degrades-instead-of-evading.md)).
  It runs only after a direct fetch has failed or come back as a robot check,
  and never when the traveller pasted the page, so a working import never
  touches it. With the variables unset nothing changes and no third party is
  contacted. `source` gains a `scraper` value and the client says so.
- **The vendor is configuration, not code.** Presets ship for ScrapingOwl,
  ScrapingBee, ScraperAPI, ZenRows and Scrapfly, and every field of every preset
  — endpoint, method, parameter names, where the key goes, where the HTML is —
  is an environment variable. A service with no preset is
  `SCRAPER_PROVIDER=custom` plus `SCRAPER_ENDPOINT`. `SCRAPER_HOSTS` narrows
  the spend; `SCRAPER_RENDER_JS` and `SCRAPER_TIMEOUT_MS` tune it.
- **`pnpm diagnose:url <link>`** prints every rung of the import ladder for a
  given URL and which one answered — what the fetch returned, where redirects
  led, what the scraper said, what the URL alone encodes.

### Changed

- **The import ladder moved into `server/utils/listingSource.ts`**, one module
  holding all five sources in order and testable without a network. The
  accommodations router now only turns its result into a prompt.
- **The ScrapeOwl preset is the GET form**, `GET /v1/scrape?api_key=…&url=…`,
  which is the call confirmed against a real key. The JSON POST body it also
  accepts is still available as `SCRAPER_METHOD=POST` plus
  `SCRAPER_API_KEY_IN=body`.
- **`SCRAPER_API_KEY` alone is enough to switch the fallback on.**
  `SCRAPER_PROVIDER` now defaults to `scrapingowl`. Requiring both variables
  meant the obvious setup — paste the key into Doppler — left the fallback off,
  and the failure looked identical to the site blocking us.
- **A page arriving without its JSON envelope is still a page.** Some endpoints
  and plans return the HTML bare; taking it (when it is a real page and not a
  gateway's `<h1>502</h1>`) beats reporting a block while holding the listing.
- **`pnpm diagnose:url --check-scraper`** makes the vendor's smoke-test request
  the way the app makes it and prints the reply with the key redacted — the
  fastest way to tell a wrong key from a site that refuses the service too.

---

## 2026-08-08 — Production is back up

### Fixed

- **The site is serving again at `www.backtotravelling.com`.** Every deploy
  since 2026-08-02 had failed, so production was stuck on an older build and
  then stopped being promoted at all. `DATABASE_URL` pointed at Supabase's
  direct host, `db.<ref>.supabase.co`, which publishes no IPv4 address; Vercel
  has no IPv6 egress, so the deploy-time migration could not open a connection
  and failed the build with `ENETUNREACH`. It now points at Supabase's session
  pooler, which is reachable. The database was healthy the whole time — all six
  migrations applied, nothing to repair.

### Changed

- **`DATABASE_URL` uses the session pooler (port 5432), not the transaction
  pooler (6543)** that the runbooks previously prescribed
  ([ADR 0012](adr/0012-session-pooler-for-the-database-url.md)). The deploy
  migration holds a session-scoped advisory lock across three round trips, and
  transaction pooling would spread those over different backends — leaving the
  lock guarding nothing and able to strand itself where a later deploy hangs on
  it. `.env.example`, the deployment, database, secrets and troubleshooting
  runbooks, and `scripts/doppler-bootstrap.sh` were all corrected; several of
  them still recommended 6543.

---

## 2026-08-02 — The deploy applies its own migrations

### Fixed

- **Voting, dates, places and accommodations stopped returning errors.**
  Migration `0005_activity_and_vote_times` added `updatedAt` to the three vote
  tables and was never applied to production, while the code that reads the
  column shipped. Every load of the dates, places or accommodations list — and
  every attempt to propose a date — failed on the missing column: 61 errors in
  the seven minutes before it was found. Migration 0005 has been applied to the
  live database, and the column now arrives with the code that needs it.
  Historical votes were backfilled from `createdAt` rather than stamped with the
  migration time, so none of them claims to have changed when the fix landed.
  `activity_events`, created by the same migration, was closed with RLS and no
  grants per [ADR 0009](adr/0009-rls-on-with-no-policies.md).

### Changed

- **Deploys apply pending migrations themselves**, after the build and before
  the new version is promoted, so the schema and the code can no longer ship
  apart ([ADR 0010](adr/0010-migrations-apply-on-deploy.md)). Production
  migrates automatically; a preview only when asked, since a preview usually
  points at the production database. A deploy that cannot reach its database
  fails rather than shipping quietly.
- **CI runs only the tests the change can reach**, chosen from the real import
  graph rather than a hand-written map
  ([ADR 0011](adr/0011-affected-tests-from-the-import-graph.md)). A change to one
  leaf module runs a handful of files instead of seventeen. Lockfile, config and
  tooling changes still run everything, and the full suite runs nightly.

### Added

- `pnpm db:status` — what is this database missing? The question nobody could
  answer quickly during the incident. `pnpm db:status:doppler` asks it of
  production.
- **CI fails when `drizzle/schema.ts` and the committed migrations disagree**,
  catching the sibling mistake: a column added to the schema with no migration
  to create it.

---

## 2026-08-02 — The trip page fits on a phone

### Added

- **A summary at the top of the trip page**, expanded, answering "where are we
  with this?" in four lines: the finalised dates, how many places and
  accommodations are settled out of how many proposed, and how many itinerary
  days are planned. Each line links to the section it summarises.
- **The trip description is on a screen at last.** It was collected at creation
  and displayed nowhere. It sits below the summary, collapsed; an admin looking
  at a trip without one is offered the chance to write it.
- **Admins can rename a trip and edit its description.** `trips.update` has
  always accepted both — nothing in the UI ever called it.
- **A summary above the preference form**: your budget cap for this trip
  (editable in place, rather than only from the budget screen), whether your
  preferences are saved and when, and how many of the group have submitted
  theirs. The page used to open on four blank-looking textareas whether or not
  you had filled them in last week.

### Changed

- **Every section on the trip page collapses**, and only the summary starts
  open. What is left open is remembered per trip, so a group deep in choosing
  dates does not re-open that section on every visit. The collapsed header still
  carries the finalised badge and the count of proposals awaiting your vote.
- **The section header toggles; "View all details" navigates.** The whole card
  used to navigate on click, which a header that expands cannot also do.
- **New order**: Summary · Trip Description · My Trip Preferences · Dates ·
  Accommodations · Places · Budget · Vibe Board · Itinerary · AI Referee.
  Accommodations now come before places.
- **"Destinations" reads Places and "Stays" reads Accommodations** throughout
  the UI — headings, empty states, dialog titles and toasts. Routes, tRPC
  procedures and tables keep their names; renaming those buys a migration and no
  user benefit.
- **The Add buttons open the real form.** They used to open a thinner copy on
  the trip page — `QuickAddStay` asked for a name, a link and a price while the
  accommodations screen asks for all that plus beds, parking, amenities, URL
  import and a paste fallback. They now go to the detail screen with its add
  dialog open, and the three duplicate dialogs are deleted.

### Internal

- `TripDashboard.tsx` is down from ~1,995 lines to under 800 of page. The
  section card, the collapsible row, the lock toggle and the proposal rows are
  components in `client/src/components/trip/`.
- `getMyTripPreferences` returns the row's `updatedAt`; it parsed the stored
  JSON and dropped everything around it, so the screen could not say when you
  last saved.

---

## 2026-08-02 — A trip remembers what happened

### Added

- **Every action on a trip is recorded** — proposals created, edited, deleted,
  finalised and un-finalised; votes cast, changed and withdrawn; comments;
  members invited, joined, declined, removed and re-roled; trip edits;
  preference saves; and each AI run. Recording never fails the thing you
  actually asked for: it logs and moves on.

  There is **no activity feed**, deliberately. The history is there so questions
  asked later have an answer; what reaches a screen is only what earns its place.

- **"Added by … · date" beneath a proposal**, on the dates, places and
  accommodations screens — quiet side information in the same register as
  "Finalised by …", not a headline.
- **`x/x voted` now opens the answer.** Who voted, what they chose, when — and
  who is still to vote, which is the question people actually have. Admins and
  tripmates only; a watcher keeps the count as plain text.
- **Places and accommodations show `x/x voted` at all.** The dashboard and the
  dates screen had it; those two never did.

### Fixed

- **A changed vote reported the wrong time.** Re-voting updated the row but left
  `createdAt` at the original vote, so "when did they decide this?" answered
  with the moment they first made up their mind, not the moment they changed it.
  Vote rows now carry `updatedAt`, set on every change; existing rows were
  backfilled from `createdAt` rather than stamped with the migration time.
- **The three proposal listings were N+1** — a query per proposal for its votes,
  then one per vote for the voter's name. They now fetch votes in one query and
  resolve every name in one more.

---

## 2026-08-02 — Closed the database to the public API key

### Security

- **Row Level Security was disabled on all 23 tables of the production
  database, and `anon` / `authenticated` held full read and write privileges on
  every one of them.** Those are the roles a Supabase project's **anon key**
  authenticates as, and an anon key is meant to be shipped in client-side code —
  it is not a secret. Anyone with it could have read or modified
  `users.passwordHash`, every email address, `magic_link_tokens` and
  `webauthn_credentials` through the REST or GraphQL endpoints.

  RLS is now enabled on every table with **no policies**, and all table and
  sequence grants are revoked from both roles, including the schema's default
  privileges so a table added later cannot quietly reopen it. Verified by
  assuming each role: both now get `permission denied`.

  The application is unaffected and never was affected — it has no Supabase
  client dependency and connects as the `postgres` role, which bypasses RLS.
  See [ADR 0009](adr/0009-rls-on-with-no-policies.md), which also explains why
  the linter's 23 `rls_enabled_no_policy` notices are the intended state.

### Changed

- **The live database is migrated and drizzle-tracked.** It had been built with
  `db:push`, so drizzle held no record of the baseline and `pnpm db:migrate`
  would have tried to re-create every table. A baseline row was inserted, then
  0002, 0003 and 0004 applied: the two real members mapped creator → Admin and
  the other → Tripmate, `travel_dna` is gone, and invites, contacts and the lock
  attribution columns exist.

---

## 2026-08-02 — A trip can finalise more than one place to go and stay

### Changed

- **Places and accommodations can each have several finalised options.** A week
  in Spain is Barcelona _and_ Girona, with two different apartments — and the app
  could not say so. Finalising one destination silently un-finalised every other,
  because the database cleared the whole trip before setting a single row.
  Locking now touches only the option you picked. **Dates are unchanged and
  deliberately so:** a trip goes away on exactly one set of dates, so finalising
  one still replaces any other.
- **Finalising is admin-only, and available from the trip page.** Each proposal
  carries a padlock beside its name — a control for admins, a state for everyone
  else. Previously the trip page rendered a padlock that told you a decision had
  been made but offered no way to make or undo one without opening the section's
  own screen.
- **Section headers count.** "2 finalised" for places and accommodations, where a
  boolean "Decided" no longer describes anything; dates keep "Decided", since one
  is the only number they can have.
- **Who finalised what, and when, is recorded and shown.** `lockedBy` and
  `lockedAt` are captured on every lock and cleared on unlock, so a decision no
  longer appears from nowhere. A watcher sees that something is finalised but not
  by whom, consistent with the rest of what a watcher can see. Anything finalised
  before this shows "Finalised" without a name rather than inventing one.
- **`select` / `deselect` are now `lock` / `setLock` / `unlock` / `unlockAll`**
  across the dates, destinations and accommodations routers. The rename was the
  point: `find(proposal => proposal.selected)` reads perfectly well when it
  returns an arbitrary one of three finalised places, so renaming the procedures
  is what made the compiler show every screen that needed rethinking.

---

## 2026-08-02 — AI runs only when someone asks

### Changed

- **Match analysis no longer runs itself.** Adding an accommodation fired an
  analysis on the spot — usually before anyone had set the preferences it scores
  against — and saving your preferences re-analysed **every** stay in the trip.
  A group of six with ten stays spent about seventy model calls nobody asked
  for, most superseded before they were read. Both triggers are gone. Saving
  preferences now returns in milliseconds and starts no background work.
- **Analysis is an admin action.** Re-run one stay, or "Analyse all" for a single
  pass over the trip at a moment someone chose. Runs are sequential; the old
  code fired every accommodation at the model simultaneously. A second click
  while one is running is refused rather than paying twice.
- **Stale results say so.** A stay analysed before the group last changed its
  preferences is marked "May be out of date", and one that has never been
  analysed says that instead of showing a spinner that promised a background job
  which no longer exists. Nothing re-runs on its own — the label reports, an
  admin decides.
- **The AI Referee is admin-only and rate-limited.** Ten minutes between runs,
  shown as a countdown on a disabled button; a call inside the window returns
  the last read rather than an error. Each run costs a pass over every member's
  preferences and every vote on every proposal.

### Fixed

- **`accommodations.refreshMatch` trusted a client-supplied `tripId`** that was
  never checked against the accommodation, so the permission check could be
  satisfied with a trip you administer while analysing a stay on one you don't.
  The trip is now read from the accommodation itself.
- **The five proposal and detail screens still decided permissions from
  `trips.organizerId`**, left behind when roles landed. A second admin saw no
  lock/unlock or itinerary controls, and a demoted creator saw controls the
  server would refuse. All five now read the caller's role.

---

## 2026-08-02 — Admin / Tripmate / Watcher, invite tracking, and a contact book

### Added

- **Three roles instead of two.** **Admin** does everything the trip creator
  could. **Tripmate** votes, proposes and comments. **Watcher** follows the trip
  and changes nothing — and sees other members' names and nothing else: no email
  addresses, no who-proposed-what, no who-voted-how, no budget ceilings, no
  referee feed, no notifications. `0003_member_roles.sql` maps existing
  `organizer → admin` and `member → tripmate`; nobody becomes a watcher by
  migration, so every current member keeps the rights they had.
- **A members page** at `/trips/:id/members`, reached from the members icon in
  the trip header. It lists everyone with their role and status, who is still
  pending, which address an invite went to, and how each person arrived — shared
  link, email invite, or creating the trip. Admins change roles and remove
  people from here; the last admin cannot be demoted or removed, and nobody can
  change their own role.
- **Invites are recorded, not just sent.** `trip_invites` holds an invitation to
  an email address, which `trip_members` could not: its `userId` is NOT NULL and
  most invitees have no account yet. An emailed invite carries a token that sets
  the role and marks the join as "by email" rather than "followed a link", and
  it can be declined or revoked. Re-inviting the same address updates the
  existing invite instead of stacking up rows.
- **A contact book.** Save someone once and invite them from a picker thereafter.
  Saving grants nothing — an invite is still sent and still has to be accepted.

### Fixed

- **`trips.update` had no authorisation check at all.** Any signed-in user could
  rename any trip and change its phase, status, currency and budget. It now
  requires admin, as do finalising a proposal, inviting, changing roles and
  running the referee.
- **Authorisation was ad-hoc everywhere else.** Inline `isTripOrganizer()` calls
  compared against `trips.organizerId`, so they could not see a second admin;
  most other procedures checked only that the caller was signed in, not that
  they belonged to the trip they were mutating. Every trip-scoped procedure now
  goes through one `requireTripRole` helper, and the several
  `throw new Error("Not authorized")` calls — which reached the client as
  `INTERNAL_SERVER_ERROR` — are `TRPCError`s with real codes.

---

## 2026-08-02 — Travel DNA removed; the referee reads the trip instead

### Removed

- **Travel DNA is gone**, quiz and all. It asked every member to rate themselves
  1–10 on eight abstract axes — budget comfort, social energy, adventure level,
  planning style, cultural curiosity, comfort need, food priority, activity pace
  — before they could be scored against anything, and the answers were
  self-reported personality rather than anything actionable about a particular
  trip. Per-trip preferences already collect what the AI needs, in the member's
  own words, about the trip in front of them.

  The `/quiz` route, the quiz page, the profile section, the bottom-nav "DNA"
  tab, `client/src/lib/travelDna.ts`, the `travelDna` router and the three
  `db.ts` query functions are all deleted. `drizzle/0002_drop_travel_dna.sql`
  drops the table; the data is not recoverable after it runs.

### Changed

- **The AI referee now reasons about the trip rather than about personalities.**
  Removing the eight-axis averages would have left it commenting on counts, so
  its context was rebuilt from data the app already had: each member's
  must-haves, avoids and notes; a per-proposal vote tally for every date,
  destination and accommodation; and — the blocker on most stalled trips — the
  names of members who have not voted on each one. It is now asked to name the
  proposal and the person, not to observe that there is "some disagreement".
  Preference text is trimmed per field so a large group cannot outgrow the
  prompt.
- **Accommodation match analysis** scores against trip preferences alone, and is
  asked for an entry per member so someone who has set no preferences gets a
  neutral score instead of vanishing from the results.
- **The landing page** advertises Trip Preferences where it advertised Travel
  DNA; the dashboard's Quick Actions is a single New Trip button.

---

## 2026-08-01 — Import a blocked listing from the page you can see

### Added

- **Paste the page when the site refuses us.** Booking.com answers a
  server-side fetch with a 403 no header will talk it out of — its bot
  protection judges the IP and the TLS handshake, not the request, so a
  datacenter is refused whatever it claims to be. The browser that just
  rendered the listing is not refused, so after a block the add-stay dialog now
  offers a paste box: open the listing, select all, copy, paste. The pasted
  page goes through `condenseListingText` — noise lines dropped, repeats
  collapsed, the head kept plus every line carrying a price, a count or an
  amenity, capped at 12k characters — and then to the same extractor.
  `accommodations.fetchFromUrl` takes an optional `pageText`, skips the fetch
  and the Places lookup when it has one, and reports `source: "paste"`. This is
  the only path that ever fills in the price a blocked site quoted for these
  dates.

---

## 2026-08-01 — Share links and a map fallback for blocked listings

### Added

- **A share link now imports.** `fetchListingPage` reports the URL the redirects
  ended up on, and the hints are merged across the canonical URL, that landing
  URL and the pasted one — each field from the first that has it. A pasted
  `booking.com/Share-xTk9pQ` encodes nothing, but the page it lands on encodes
  the property and country, while the pasted URL keeps the dates and guest
  counts a canonical URL never carries. The stay length is recomputed after the
  merge, since the winning dates can come from different URLs.
- **A blocked site no longer means an empty form.** When the page gives us
  nothing and the URL yields a property name, that name plus its country is
  looked up through Google Places (`server/utils/placeLookup.ts`), which returns
  the real name and postal address — a lookup, not a scrape: nothing is fetched
  from the site that refused us. It runs only on the blocked path, so it costs
  no quota when a page answers. Places knows what a property is called, not what
  a stay costs, so price, beds and amenities stay empty and the model is told
  as much. The toast says the details came from the map, and `source` is
  `"place"` alongside the existing `"page"` and `"url"`.

### Fixed

- **A share link was named after its id.** `booking.com/Share-xTk9pQ` produced a
  property called "Share XTk9pQ". A path token that mixes letters and digits is
  an id, not a word, and a segment that is nothing but furniture once the ids are
  dropped now names nothing at all — which is the better answer.

---

## 2026-08-01 — Proposals count as votes, listing import, dialog sizing

### Changed

- **Proposing is voting.** Adding a date, destination, stay or vibe-board item
  now records the proposer's own vote (`available` for dates, `love` elsewhere),
  including when a proposal is cloned. Nobody proposes an option they are
  against, and the previous behaviour made every new proposal open on a score of
  0 until its author voted for it by hand.

### Fixed

- **Booking.com and friends now import.** `accommodations.fetchFromUrl` sent a
  bot-shaped `User-Agent`, never checked the response status, and matched
  Open Graph tags with a regex that required `property` before `content`. A
  Booking.com URL therefore fed the LLM a refusal page — or nothing but the
  URL — and the UI still reported "Details fetched from URL!". The import now:
  - asks with browser headers, follows redirects and treats 401/403/405/406/418/429
    (and a 200 that is really a robot check) as blocked;
  - reads Open Graph, Twitter and `application/ld+json` data with attributes in
    any order and HTML entities decoded;
  - falls back to what the URL itself encodes — property slug, ISO country code,
    check-in/check-out, nights, guests — so a blocked page still prefills the
    name and country;
  - coerces the model's output to what the columns accept ("€1,234.50" → `1234.5`,
    amenities to an array, `name` truncated to 255 chars);
  - tells the client which source was used, so the toast says the site blocked us
    instead of claiming success.

  Checked across Booking.com, Airbnb, Vrbo, Expedia, Agoda, Hotels.com,
  TripAdvisor and an independent hotel's own site, which turned up four more
  defects, now fixed: Vrbo's `VacationRental` schema type was not recognised;
  `arrival`/`departure`/`chkin` date parameters were not read; a generic path
  segment produced a property called "Rooms" (the wordiest name-like segment is
  used instead, so Agoda's `/the-sukhothai-bangkok/hotel/bangkok-th.html` gives
  "The Sukhothai Bangkok"); and accented named entities were left raw, so
  `H&ocirc;tel` reached the model as-is rather than as "Hôtel".

- **Dialogs were laid out differently on mobile and desktop.** Every dialog
  carried `max-w-sm mx-4`, which `tailwind-merge` resolved by dropping the
  primitive's `max-w-[calc(100%-2rem)]` while keeping its `sm:max-w-lg`. Phones
  got a full-width panel shifted 16 px right (right edge clipped, no left
  gutter); desktops got a 512 px panel, not the intended 384 px. Dialogs now use
  `sm:max-w-sm`: even gutters on a phone, 384 px and centred everywhere else.

### Security

- `fetchFromUrl` refuses non-HTTP(S) schemes and private/link-local hosts, so an
  authenticated user cannot use it to probe the deployment's own network.

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

## 2026-08-01 — Profile page, passkeys, reachable password setup

### Added

- **Profile page** at `/profile`, reachable from a new tab in the bottom
  navigation. Shows the account, the saved Travel DNA played back trait by trait
  (there was previously no way to see an answered quiz — only to retake it), and
  every sign-in method in one place. Sign out moved here too.
- **Passkeys.** Sign in with Face ID, Touch ID, Windows Hello or a hardware key.
  Enrol from the profile; sign in from the sign-in dialog with one tap and no
  email typed, since the browser offers whichever discoverable passkey it holds.
  New `passkeys` router, `webauthn_credentials` and `webauthn_challenges`
  tables, migration `0001_passkeys`. Rationale in
  [ADR 0007](adr/0007-passkeys-for-sign-in.md).
- **`travelDna` axis definitions** extracted to `client/src/lib/travelDna.ts`,
  so the quiz and the profile cannot describe the same trait differently.

### Fixed

- **Password setup was unreachable.** `auth.setPassword` and
  `SetPasswordDialog` shipped previously, but the only entry point was the
  user menu in `DashboardLayout` — a scaffold component no route renders. A
  magic-link account had a documented way to set a password and no way to click
  it. The profile page now surfaces it, with the account's current state.

### Notes for operators

- `PUBLIC_BASE_URL` should be set wherever passkeys are used. It fixes the
  WebAuthn relying party; without it the request's `Host` header is trusted
  instead, which weakens the phishing resistance passkeys are there for.

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
