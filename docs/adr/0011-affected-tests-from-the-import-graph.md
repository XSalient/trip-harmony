# 0011. Test selection comes from the import graph

- Status: Accepted
- Date: 2026-08-02

## Context

Every push ran the whole suite — 208 tests at the time — typechecked and built.
The suite is fast in
absolute terms, but it runs on every commit of every branch, and an agent
iterating on one router waits for — and pays for — the whole thing each time.

The obvious way to narrow it is a table: "changes under `server/utils/` run
`server/utils/*.test.ts`". That table is a second description of the
dependencies, maintained by hand, and it fails in the direction that hurts: when
it goes stale it _skips_ the test that would have caught the bug, silently. This
repository had just spent a day on an outage caused by two descriptions of the
schema drifting apart. Adding another pair was not attractive.

## Decision

Derive the selection from the import graph the code already has.

`scripts/lib/affected.mjs` parses each test file's imports, resolves them the
way this project resolves them (`.js` specifiers pointing at TypeScript sources,
the `@/` and `@shared/` aliases, directory indexes), and follows them
transitively. A test runs when its closure contains a changed file. Nothing is
written down twice; the graph is regenerated from source on every run.

Where the graph cannot see, the whole suite runs:

- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and the vite/vitest configs
- anything under `scripts/` — including the selector itself
- anything under `.github/`
- any change where the base ref cannot be resolved (a shallow clone)

The selection logic is pure and takes its file reads as an argument, so it is
unit-tested without a repository on disk — the runner that decides what CI runs
is itself tested.

## Consequences

- A change to one leaf module runs a handful of files instead of seventeen.
  A change to `server/db.ts` still runs eight, correctly: eight tests reach it.
- Coverage is traded for speed, so the full suite also runs nightly and on
  `workflow_dispatch`. That is the other half of the trade and should not be
  removed without replacing it.
- The selector over-selects rather than under-selects wherever it is unsure —
  an unresolvable import, a config change, an unknown base. Every mode that
  could be wrong errs toward running more.
- It only sees **static** imports. A module reached solely through a runtime
  string — a dynamic path built at execution time, a plugin loaded by name —
  is invisible to it. Nothing in this repository does that today; if something
  starts, add it to the full-suite list.
- The runner always logs what it chose and why. A narrowing run that explains
  itself can be trusted; a silent one cannot.
