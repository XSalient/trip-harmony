# Architecture

## What WeVoTrip is

A group-trip planning app. A group proposes dates, destinations, accommodations
and activities; everyone votes; an AI "referee" surfaces conflicts and suggests
compromises that respect each member's stated budget and preferences.

## Shape of the system

One TypeScript project producing two artifacts from the same source: a React SPA
and an Express API. No monorepo tooling, no service boundaries — the app is small
enough that a modular monolith is the right size, and splitting it would add
deployment complexity without buying anything. See
[adr/0002-modular-monolith.md](../adr/0002-modular-monolith.md).

```
Browser (React SPA)
   │  tRPC over HTTP, superjson-encoded, session cookie
   ▼
Express app  ──────────────────────────────────────────────┐
   ├── requestLogging()        correlation id per request   │  server/_core/app.ts
   ├── /api/health             capability report            │  is the only place
   ├── /api/oauth/callback     legacy Manus portal           │  these are wired up
   ├── /api/trpc/*             the entire API                │
   └── errorLogging()          terminal handler              │
   │                                                        ┘
   ▼
appRouter (server/routers/index.ts)
   └── 11 domain routers — auth, trips, contacts, dates, destinations,
       accommodations, budget, referee, notifications,
       comments, preferences
   │
   ▼
server/db.ts  →  Drizzle ORM  →  PostgreSQL
```

Cross-cutting concerns live in `server/_core/` and are wired once:

| Concern             | Module                               | Guarantee                                                       |
| ------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Configuration       | `env.ts`                             | Every server `process.env` read happens here, validated at boot |
| Logging             | `logger.ts`                          | JSON, levelled, secret-redacted                                 |
| Request correlation | `httpLogging.ts`                     | Every request has an id, echoed as `x-request-id`               |
| Auth / sessions     | `sdk.ts`, `cookies.ts`, `context.ts` | JWT session cookie resolved into `ctx.user`                     |
| Procedure base      | `trpc.ts`                            | All procedures are logged; `protectedProcedure` requires a user |

## Why tRPC

The client and server share one TypeScript program, so the API contract is the
compiler's problem rather than a hand-maintained schema. Renaming a procedure or
changing an input type breaks `pnpm check` immediately. There is no code
generation step and no client/server drift.

The cost: the client is coupled to the server's types, so this only works while
both live in one repo. That is a deliberate trade — see
[adr/0002-modular-monolith.md](../adr/0002-modular-monolith.md).

## Request lifecycle

1. `requestLogging()` assigns a correlation id and starts a timer.
2. `createContext` reads the session cookie, verifies the JWT, loads the user,
   and builds a logger already bound to `requestId` and `userId`.
3. `withLogging` (in `trpc.ts`) wraps every procedure: success at `debug`, client
   errors at `warn`, server faults at `error` with a stack.
4. The procedure validates its input with Zod, then calls `server/db.ts`.
5. On completion, one `http request` line records method, path, status and duration.

Every line from a single request shares one `requestId`, so a user-reported
failure is a single log search.

## Frontend

- **Routing** — `wouter`, routes declared in `client/src/App.tsx`.
- **Server state** — TanStack Query via `@trpc/react-query`. Votes update
  optimistically and reconcile on settle.
- **Local state** — React state and context. No Redux/Zustand; nothing yet needs it.
- **Styling** — Tailwind v4 with shadcn/ui primitives in
  `client/src/components/ui/` (vendored, unmodified — don't edit or read them).

## Deployment topology

Vercel serves `dist/public` as static assets and routes `/api/*` to a single
serverless function (`api/server.ts`) that builds the same Express app.
Everything else rewrites to `index.html` for client-side routing.

The Node entrypoint (`server/_core/index.ts`) and the serverless entrypoint both
call `createApp()`; the only difference is whether the app also serves the client.
That is why there is no "works locally, breaks in prod" class of bug here.

## Related

- [tech-stack.md](tech-stack.md) — what each dependency is for
- [data-model.md](data-model.md) — tables and relationships
- [repo-map.md](repo-map.md) — where every file lives
- [../adr/](../adr/) — why things are the way they are
