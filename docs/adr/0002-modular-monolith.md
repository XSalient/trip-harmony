# 0002. Modular monolith with tRPC, not services

- Status: Accepted
- Date: 2026-08-01

## Context

WeVoTrip is a single product with a single database, built by a very small team
plus AI agents. The API is roughly 100 procedures across 13 domains.

The alternatives considered were a REST or GraphQL API with a generated client,
and splitting the backend into separate services.

## Decision

Keep one deployable: a React SPA and an Express + tRPC API in one TypeScript
project, sharing types directly. Modularity is enforced inside the process — one
router file per domain, cross-cutting concerns isolated in `server/_core/` —
rather than across network boundaries.

## Consequences

**What this buys**

- The API contract is checked by the compiler. Renaming a procedure or changing
  an input type fails `pnpm check` before it can reach a client.
- No code generation step, so no drift between a schema and its implementation.
- One deploy, one log stream, one place to look when something breaks.
- Local development is a single command.

**What it costs**

- The client is coupled to the server's TypeScript types, so both must live in
  one repository. Splitting them later means introducing a real API contract.
- tRPC is not a public API. Exposing one to third parties would need a separate
  REST or GraphQL surface.
- Everything scales together. Acceptable while the workload is uniform; if AI
  calls come to dominate, they are the first candidate to extract.

**Boundary discipline**

Because the boundaries aren't enforced by the network, they have to be enforced
by convention: domain logic stays in its own router file, database access stays
in `server/db.ts`, and configuration stays in `server/_core/env.ts`.
