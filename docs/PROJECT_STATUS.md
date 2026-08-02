# Project status

**Single source of truth for where this project stands.** Update it when you
finish a piece of work — the next person (or agent) starts here.

- **Last updated:** 2026-08-02
- **Name:** Back To Travelling (formerly Harmony). Two identifiers still read
  `harmony` / `trip-harmony` because they are registered outside this repo —
  `VITE_APP_ID` at the OAuth portal, and the Doppler project. Rename them there
  before changing them here.
- **Stage:** feature-complete MVP; infrastructure hardened, not yet deployed.
  The trip experience overhaul is in flight — see [product/](product/) for the
  eight epics and [product/progress.md](product/progress.md) for what has landed.
- **Health:** typecheck ✅ · 156 tests ✅ · production build ✅ · dev server ✅
  (2026-08-02, after the Travel DNA removal: all three migrations applied to a
  real Postgres, then register → sign in → dashboard → profile walked in a real
  browser). The **passkey** enrol → sign-out → passkey sign-in round trip was
  last verified on 2026-08-01 and has not been repeated since.
- **Pending migration:** `drizzle/0002_drop_travel_dna.sql` has been applied to a
  throwaway database only — **not** to any long-lived one. It is destructive:
  it drops `travel_dna` and every row in it. See
  [runbooks/database.md](runbooks/database.md) before running it anywhere real.

---

## Where it runs

| Environment         | Status                 | Notes                                                                     |
| ------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Local               | ✅ Working             | `pnpm setup && pnpm dev` → http://localhost:5000                          |
| Preview (Vercel)    | ⚠️ Not yet provisioned | Config is in place — see [runbooks/deployment.md](runbooks/deployment.md) |
| Production (Vercel) | ⚠️ Not yet provisioned | Needs a Postgres URL, `JWT_SECRET`, and a Doppler project                 |

Nothing is deployed yet. The repository is ready to deploy; the remaining work is
account setup, which requires credentials no one should commit.

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
- **Trips** — create, list, update, invite by code or email, join, membership roles.
- **Planning** — date proposals, destinations, accommodations, vibe board and
  itinerary, each with proposal/vote/comment/clone/edit/delete. Posting a
  proposal records its author's vote, so a new option never sits at zero.
- **Budget** — expense logging, category breakdown, per-person split, per-member caps.
- **Notifications** — in-app feed with unread counts.
- **Preferences** — per-member, per-trip requirements. Since Travel DNA was
  removed these are the only member signal the AI has, and they feed both match
  analysis and the referee.
- **AI features** — referee mediation, natural-language date parsing,
  accommodation URL import, accommodation↔member match scoring. These require an
  AI key; without one the rest of the app is unaffected. The URL import reads
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

1. **No frontend tests.** All 156 tests are server-side. Page components are
   unverified — the passkey flow was checked with a scripted browser and a
   virtual authenticator, but that check is not committed as a suite.
2. **Client bundle is ~2.2 MB** (585 KB gzipped) in one chunk — no code splitting.
3. **Authorisation is thin.** Most `protectedProcedure`s check that a caller is
   signed in, not that they belong to the trip they're mutating.
4. **Legacy Manus/Replit integrations** (`server/replit_integrations/`,
   `vite-plugin-manus-runtime`, the OAuth portal path) are unused but still wired in.
5. **AI prompts are inline** in router files and unversioned.

## Verifying the current state yourself

```bash
pnpm setup     # bootstrap
pnpm verify    # typecheck + tests + build — the definition of "working"
pnpm dev       # then open http://localhost:5000 and GET /api/health
```
