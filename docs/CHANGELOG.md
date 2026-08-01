# Changelog

Notable changes, newest first. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are ISO-8601.

Add an entry for anything user-visible or anything that changes how the project
is built, run or deployed.

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
