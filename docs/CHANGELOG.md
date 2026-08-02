# Changelog

Notable changes, newest first. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are ISO-8601.

Add an entry for anything user-visible or anything that changes how the project
is built, run or deployed.

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
