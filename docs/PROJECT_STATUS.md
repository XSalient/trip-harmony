# Project status

**Single source of truth for where this project stands.** Update it when you
finish a piece of work — the next person (or agent) starts here.

- **Last updated:** 2026-08-02
- **Name:** Back To Travelling (formerly Harmony). Two identifiers still read
  `harmony` / `trip-harmony` because they are registered outside this repo —
  `VITE_APP_ID` at the OAuth portal, and the Doppler project. Rename them there
  before changing them here.
- **Stage:** feature-complete MVP, deployed to production on Vercel.
  The trip experience overhaul is **complete** — all eight epics, covering the
  sixteen requested changes. See [product/](product/) for the specifications and
  [product/progress.md](product/progress.md) for the story-by-story record.
- **Health:** typecheck ✅ · 237 tests ✅ · production build ✅ · dev server ✅
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
- **Database access is locked down.** RLS is on for all 23 tables with no
  policies, and `anon` / `authenticated` hold no grants — see
  [ADR 0009](adr/0009-rls-on-with-no-policies.md). Supabase's linter reports 23
  INFO `rls_enabled_no_policy` notices; that is the intended state.

---

## Where it runs

| Environment         | Status                 | Notes                                                                        |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Local               | ✅ Working             | `pnpm setup && pnpm dev` → http://localhost:5000                             |
| Database (Supabase) | ✅ Live, migrated      | `Trip Harmony` `eqpqjivaubdbdmyrlczh`, eu-west-1. All six migrations applied |
| Preview (Vercel)    | ⚠️ Not yet provisioned | Config is in place — see [runbooks/deployment.md](runbooks/deployment.md)    |
| Production (Vercel) | ✅ Live                | Vercel project `trip-harmony`, team `saurabhs-projects-4d5cc478`             |

Production is deployed and serving traffic, and its database now matches the
deployed code. Preview is still unprovisioned.

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
