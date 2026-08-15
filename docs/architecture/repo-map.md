# Repo map

Where everything lives. **Use this instead of searching the tree** — it exists so
neither a person nor an agent has to spend time (or tokens) rediscovering the
layout.

## Top level

```
AGENTS.md          Instructions for AI tools. Read first.
CLAUDE.md          Pointer to AGENTS.md.
README.md          Human entry point.
docs/              All documentation (this directory).
client/            React SPA.
server/            Express + tRPC API.
shared/            Types and constants used by both sides.
drizzle/           Database schema.
api/server.ts      Vercel serverless entrypoint.
scripts/           Bootstrap, deploy-time migrations, test selection.
```

## `scripts/` — build and deploy tooling

Plain `.mjs`, not TypeScript: these run during the Vercel build, before anything
is compiled and with no tsx on the path.

| File                      | What it is                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `setup.sh`                | One-command bootstrap.                                                                 |
| `doppler-bootstrap.sh`    | Creates the Doppler project/configs and prompts for each secret. Run by a human.       |
| `db-migrate.mjs`          | Applies pending migrations, or reports them. `--deploy` is what `vercel.json` runs.    |
| `lib/migrations.mjs`      | Reads the journal, resolves the database URL, decides whether a deploy should migrate. |
| `affected-tests.mjs`      | Runs only the tests the current change can reach.                                      |
| `lib/affected.mjs`        | The import-graph walk and selection rules. Pure; unit-tested beside it.                |
| `diagnose-listing-url.ts` | `pnpm diagnose:url <link>` — why an import filled nothing. Dev only, so TypeScript.    |
| `seed-demo.ts`            | `pnpm seed:demo` — fills a database with the marketing demo. Dev only, so TypeScript.  |
| `demo/story.ts`           | The demo's content: three trips, eleven people, the argument. Pure data — edit freely. |
| `demo/options.ts`         | Which databases the seeder may write to. Pure; unit-tested beside it.                  |

## `server/` — API

| File                     | Lines | What it is                                                                                 |
| ------------------------ | ----: | ------------------------------------------------------------------------------------------ |
| `_core/app.ts`           |    78 | Builds the Express app. The only place middleware is registered.                           |
| `_core/index.ts`         |    25 | Long-running server entrypoint (local, containers).                                        |
| `_core/env.ts`           |   553 | **All** server configuration, Zod-validated. Start here for anything config-related.       |
| `_core/logger.ts`        |   170 | Structured logger, levels, secret redaction.                                               |
| `_core/httpLogging.ts`   |    75 | Request-id middleware, error handler, crash handlers.                                      |
| `_core/trpc.ts`          |    75 | Procedure builders: `publicProcedure`, `protectedProcedure`, `adminProcedure`.             |
| `_core/context.ts`       |    38 | Per-request context: user, request id, bound logger.                                       |
| `_core/sdk.ts`           |   300 | Session JWTs, cookie auth, OAuth client.                                                   |
| `_core/cookies.ts`       |    51 | Cookie options (secure/sameSite per environment).                                          |
| `_core/vite.ts`          |    67 | Vite dev middleware and static file serving.                                               |
| `_core/llm.ts`           |   184 | LLM invocation wrapper.                                                                    |
| `_core/systemRouter.ts`  |    29 | Built-in system procedures.                                                                |
| `db.ts`                  |  1883 | Every database query. Large but flat — jump to the function you need.                      |
| `routers/`               |     — | The API surface, one file per domain (below).                                              |
| `utils/mailer.ts`        |    65 | Magic-link and invite emails; logs instead when SMTP is unset.                             |
| `utils/tripInvite.ts`    |     — | Recording and sending one invite. Both invite paths go through it; authorisation does not. |
| `utils/listingPage.ts`   |   720 | Listing URL → facts for the accommodation extractor (fetch, HTML, URL hints).              |
| `utils/listingSource.ts` |   180 | The import ladder in order: paste → page → scraper → place → url. Start here.              |
| `utils/scraper/`         |     — | The optional unblocking-service rung. `providers.ts` is the vendor-as-config table.        |
| `replit_integrations/`   |     — | **Legacy, unused.** Don't read or extend.                                                  |
| `prompts/referee.ts`     |   508 | The AI Referee's prompt, its version, and the facts it may reason about.                   |

### `server/routers/`

Each file exports one router; `index.ts` composes them. To change an endpoint,
open only its domain file.

| File                | Lines | Covers                                                                |
| ------------------- | ----: | --------------------------------------------------------------------- |
| `index.ts`          |    41 | Table of contents — the whole API in one screen                       |
| `_shared.ts`        |   180 | `requireTripRole`, role projections, `toPublicUser`, password hashing |
| `matchAnalysis.ts`  |   142 | AI accommodation↔member scoring (fire-and-forget)                    |
| `auth.ts`           |    86 | Register, login, magic link, logout, `me`                             |
| `passkeys.ts`       |   386 | WebAuthn enrolment and usernameless passkey sign-in                   |
| `trips.ts`          |   450 | Trips, membership, roles, invites, delete and clone                   |
| `contacts.ts`       |     — | A user's private address book, and the families saved in it           |
| `groups.ts`         |     — | Families/households, the trip's voting unit, and attendees            |
| `dates.ts`          |   223 | Date proposals, votes, natural-language parsing                       |
| `destinations.ts`   |   254 | Suggestions and votes — the UI calls the section "Suggestions"        |
| `accommodations.ts` |   354 | Stays, votes, URL import, match refresh                               |
| `budget.ts`         |     — | Budget proposals, votes and the normalised figures                    |
| `referee.ts`        |   183 | AI mediation. The prompt itself is in `server/prompts/referee.ts`     |
| `preferences.ts`    |    36 | Per-trip member requirements                                          |
| `suggestions.ts`    |     — | Turning what a member wrote into proposals they can put to the group  |
| `comments.ts`       |    41 | Comment threads                                                       |
| `notifications.ts`  |    23 | Notification feed                                                     |

## `client/` — SPA

| Path                              | What it is                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                    | Entry: tRPC client, React Query, providers                                                                                                                                                                          |
| `src/App.tsx`                     | Route table, and `ScrollRestoration` — new screen to the top, back to where you were                                                                                                                                |
| `src/pages/*.tsx`                 | One file per screen — the bulk of the UI                                                                                                                                                                            |
| `src/components/`                 | App-specific components (`AppShell`, `AuthDialog`, `Map`, `AIChatBox`, …)                                                                                                                                           |
| `src/components/ui/`              | **shadcn/ui primitives — vendored, unmodified. Don't read or edit.**                                                                                                                                                |
| `src/lib/trpc.ts`                 | Typed tRPC React client                                                                                                                                                                                             |
| `src/pages/TripMembers.tsx`       | Members, roles, groups, invites, and the contact book picker with its saved families                                                                                                                                |
| `src/components/trip/`            | Shared trip UI (`ScreenHeader`, `TripActionsMenu`, `FinalisedBy`, `AddedBy`, `VotedCount`, `AbstainButton`, `ProposalSuggestions`, `DraggableChip`, `DraggableMemberChip`, `AttendeePill`) for the proposal screens |
| `src/_core/hooks/useAuth.ts`      | Session hook, and `useSessionSwitch` — empties the cache when the tab changes who it is signed in as                                                                                                                |
| `src/_core/hooks/useTripRole.ts`  | The caller's role on one trip, and what it lets them do. Every trip screen gates on this                                                                                                                            |
| `src/contexts/ThemeContext.tsx`   | Dark mode                                                                                                                                                                                                           |
| `src/pages/ComponentShowcase.tsx` | **Demo gallery (1,437 lines), not app code. Skip it.**                                                                                                                                                              |

Pages worth knowing: `TripDashboard.tsx` (691 lines — the hub),
`TripAccommodations.tsx` (810 lines — the most complex screen) and
`Profile.tsx` (the account screen: password, passkeys, sign out).

`DashboardLayout.tsx` is scaffold from the project template — no route renders
it. Don't add features there expecting anyone to see them.

## `shared/`, `drizzle/`

| File                      | What it is                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- |
| `shared/const.ts`         | Cookie name, TTLs, shared error messages                                        |
| `shared/votes.ts`         | Vote values, labels, weights, and the finalise rule                             |
| `shared/suggestions.ts`   | Reading a budget or dates out of preference text                                |
| `shared/budget.ts`        | Budget scopes and the arithmetic both sides share                               |
| `shared/roles.ts`         | Trip roles and their ordering — imported by both sides                          |
| `shared/productEvents.ts` | Product-measurement contract: every event, and the only metadata each may carry |
| `shared/types.ts`         | Types used by both client and server                                            |
| `shared/_core/errors.ts`  | `HttpError` and constructors                                                    |
| `drizzle/schema.ts`       | Every table and enum — the canonical data model                                 |

## Deliberately noisy — never read

`pnpm-lock.yaml` · `node_modules/` · `dist/` · `logs/` · `attached_assets/` ·
`.manus/` · `client/src/components/ui/**` · `client/src/pages/ComponentShowcase.tsx` ·
`docs/archive/**`
