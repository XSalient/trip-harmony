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
scripts/setup.sh   One-command bootstrap.
```

## `server/` — API

| File                    | Lines | What it is                                                                           |
| ----------------------- | ----: | ------------------------------------------------------------------------------------ |
| `_core/app.ts`          |    78 | Builds the Express app. The only place middleware is registered.                     |
| `_core/index.ts`        |    25 | Long-running server entrypoint (local, containers).                                  |
| `_core/env.ts`          |   210 | **All** server configuration, Zod-validated. Start here for anything config-related. |
| `_core/logger.ts`       |   170 | Structured logger, levels, secret redaction.                                         |
| `_core/httpLogging.ts`  |    75 | Request-id middleware, error handler, crash handlers.                                |
| `_core/trpc.ts`         |    75 | Procedure builders: `publicProcedure`, `protectedProcedure`, `adminProcedure`.       |
| `_core/context.ts`      |    38 | Per-request context: user, request id, bound logger.                                 |
| `_core/sdk.ts`          |   300 | Session JWTs, cookie auth, OAuth client.                                             |
| `_core/cookies.ts`      |    51 | Cookie options (secure/sameSite per environment).                                    |
| `_core/vite.ts`         |    67 | Vite dev middleware and static file serving.                                         |
| `_core/llm.ts`          |   184 | LLM invocation wrapper.                                                              |
| `_core/systemRouter.ts` |    29 | Built-in system procedures.                                                          |
| `db.ts`                 |   820 | Every database query. Large but flat — jump to the function you need.                |
| `routers/`              |     — | The API surface, one file per domain (below).                                        |
| `utils/mailer.ts`       |    65 | Magic-link and invite emails; logs instead when SMTP is unset.                       |
| `replit_integrations/`  |     — | **Legacy, unused.** Don't read or extend.                                            |

### `server/routers/`

Each file exports one router; `index.ts` composes them. To change an endpoint,
open only its domain file.

| File                | Lines | Covers                                                |
| ------------------- | ----: | ----------------------------------------------------- |
| `index.ts`          |    41 | Table of contents — the whole API in one screen       |
| `_shared.ts`        |    70 | `toPublicUser`, password hashing, LLM text extraction |
| `matchAnalysis.ts`  |   142 | AI accommodation↔member scoring (fire-and-forget)    |
| `auth.ts`           |    86 | Register, login, magic link, logout, `me`             |
| `trips.ts`          |    98 | Trips, membership, invites                            |
| `dates.ts`          |   158 | Date proposals, votes, natural-language parsing       |
| `destinations.ts`   |   108 | Destination suggestions and votes                     |
| `accommodations.ts` |   228 | Stays, votes, URL import, match refresh               |
| `budget.ts`         |    74 | Expenses and summaries                                |
| `referee.ts`        |    88 | AI mediation                                          |
| `travelDna.ts`      |    29 | Personality profile                                   |
| `preferences.ts`    |    36 | Per-trip member requirements                          |
| `comments.ts`       |    41 | Comment threads                                       |
| `notifications.ts`  |    23 | Notification feed                                     |
| `vibeBoard.ts`      |    50 | Inspiration board                                     |
| `itinerary.ts`      |    76 | Day-by-day plan                                       |

## `client/` — SPA

| Path                              | What it is                                                                |
| --------------------------------- | ------------------------------------------------------------------------- |
| `src/main.tsx`                    | Entry: tRPC client, React Query, providers                                |
| `src/App.tsx`                     | Route table                                                               |
| `src/pages/*.tsx`                 | One file per screen — the bulk of the UI                                  |
| `src/components/`                 | App-specific components (`AppShell`, `AuthDialog`, `Map`, `AIChatBox`, …) |
| `src/components/ui/`              | **shadcn/ui primitives — vendored, unmodified. Don't read or edit.**      |
| `src/lib/trpc.ts`                 | Typed tRPC React client                                                   |
| `src/_core/hooks/useAuth.ts`      | Session hook                                                              |
| `src/contexts/ThemeContext.tsx`   | Dark mode                                                                 |
| `src/pages/ComponentShowcase.tsx` | **Demo gallery (1,437 lines), not app code. Skip it.**                    |

Pages worth knowing: `TripDashboard.tsx` (1,085 lines — the hub) and
`TripAccommodations.tsx` (810 lines — the most complex screen).

## `shared/`, `drizzle/`

| File                     | What it is                                         |
| ------------------------ | -------------------------------------------------- |
| `shared/const.ts`        | Cookie name, TTLs, shared error messages           |
| `shared/types.ts`        | Types used by both client and server               |
| `shared/_core/errors.ts` | `HttpError` and constructors                       |
| `drizzle/schema.ts`      | All 21 tables and enums — the canonical data model |

## Deliberately noisy — never read

`pnpm-lock.yaml` · `node_modules/` · `dist/` · `logs/` · `attached_assets/` ·
`.manus/` · `client/src/components/ui/**` · `client/src/pages/ComponentShowcase.tsx` ·
`docs/archive/**`
