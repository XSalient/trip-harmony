# Roadmap

Planned and in-flight work. Current state lives in [PROJECT_STATUS.md](PROJECT_STATUS.md);
shipped work lives in [CHANGELOG.md](CHANGELOG.md).

Conventions: `[ ]` not started · `[~]` in progress · `[x]` done.
Keep an item here until it ships, then move a one-line summary to the changelog.

---

## Shipped

<details>
<summary>Core platform and MVP features (complete)</summary>

- [x] Database schema — users, trips, membership, proposals, votes, budget, notifications
- [x] tRPC API covering every feature
- [x] Mobile-first theming and layout
- [x] ~~Travel DNA quiz, profile storage, group compatibility analysis~~ (removed 2026-08-02, E1)
- [x] Trip creation, shareable invite links, membership status and roles
- [x] Planning phases — dates, destinations, accommodations
- [x] AI referee — conflict detection, compromise suggestions, nudges
- [x] Budget guardian — per-person tracking, currency, comfort thresholds
- [x] Voting — Love/Fine/Veto, weighting, optimistic UI with unvote
- [x] Trip dashboard, notifications, comment threads
- [x] Vibe board and itinerary builder
- [x] Accommodation URL auto-fill via LLM extraction
- [x] Natural-language date proposals
- [x] Per-member trip preferences and requirement matching
- [x] Server test suite (50 tests)

</details>

<details>
<summary>Infrastructure hardening — 2026-08-01</summary>

- [x] Validated, typed configuration with fail-fast startup
- [x] Structured logging with request correlation and secret redaction
- [x] Domain-split routers
- [x] Doppler secrets management and environment switching
- [x] Vercel deployment configuration
- [x] CI pipeline
- [x] Documentation structure and AI-agent onboarding
- [x] Fixed `auth.me` returning the password hash to the browser

</details>

<details>
<summary>Email delivery, DB resilience and migrations — 2026-08-01</summary>

- [x] Versioned migrations replacing `drizzle-kit push` for deployed environments
- [x] Real email delivery via Resend with SMTP fallback, and honest failure reporting
- [x] Sign-in UI driven by what the deployment can actually deliver
- [x] Password set/change for magic-link accounts
- [x] Connection-string fallback, TLS handling and timeouts for managed Postgres
- [x] Explicit `.js` import extensions for ESM resolution in the serverless runtime

</details>

---

## In flight — trip experience overhaul

Specified in [product/](product/); tracked story by story in
[product/progress.md](product/progress.md). Delivery order is E1 → E2 → E4 → E6 →
E3 → E5 → E7 → E8, and the order matters — E2 builds the permission model the
rest check against.

- [x] **E1** — Remove Travel DNA, including dropping the table
- [x] **E2** — Members, roles (Admin / Tripmate / Watcher), invite tracking, contact book
- [ ] **E3** — Activity trail, proposal attribution, who-voted-when
- [x] **E4** — AI runs only when asked; match analysis stops firing itself
- [ ] **E5** — Trip page restructure: summary, collapsible sections, new order
- [ ] **E6** — Finalising proposals: one locked date, many locked places and stays
- [ ] **E7** — Edit trip name and description; preferences summary
- [ ] **E8** — Add-proposal buttons route to the detail screen

Three items already on this roadmap are absorbed by that work: "Close the
authorisation gap" below is E2.1, "Rate-limit auth and AI endpoints" under Later
is partly E4.4, and "Organizer controls: unlock finalised selections" is E6.2.

## Next — highest value first

### 1. Deploy

- [ ] Create the Doppler project with `dev` / `stg` / `prd` configs
- [ ] Provision Postgres (Supabase or Vercel Postgres) for preview and production
- [ ] Connect the repo to Vercel; sync secrets via the Doppler↔Vercel integration
- [ ] Verify `/api/health` on a preview deployment
- [ ] Record the URLs in [PROJECT_STATUS.md](PROJECT_STATUS.md)

### 2. Close the authorisation gap — done in E2

- [x] `requireTripRole` asserts membership and role for every trip-scoped procedure
- [x] Applied to every trip-scoped mutation
- [x] Tests cover the role ordering and the watcher payload projections

### 3. Frontend confidence

- [ ] Add Vitest + Testing Library for components
- [ ] Cover the dashboard, voting and auth dialog
- [ ] Add a smoke test that boots the app and asserts the shell renders

### 4. Performance

- [ ] Route-level code splitting (`React.lazy`) to break up the 2.2 MB bundle
- [ ] Lazy-load the syntax highlighter and mermaid, which dominate the build
- [ ] Set a bundle-size budget in CI

### 5. Remove dead weight

- [ ] Delete `server/replit_integrations/` if genuinely unused
- [ ] Remove `vite-plugin-manus-runtime` and the Manus debug collector
- [ ] Drop the unused `mysql2` and AWS SDK dependencies
- [ ] Decide whether to keep the Manus OAuth portal path or delete it

## Later

- [ ] Move AI prompts into versioned files with fixtures
- [ ] Rate-limit auth endpoints (AI endpoints done in E4)
- [ ] Real-time updates (currently poll-on-focus)
- [ ] Currency conversion using live rates
- [ ] Organizer controls: unlock finalised selections, transfer ownership
