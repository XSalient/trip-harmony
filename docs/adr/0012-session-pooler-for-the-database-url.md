# 0012. One `DATABASE_URL`, pointed at Supabase's session pooler

- Status: Accepted
- Date: 2026-08-08

## Context

Production was down. Every deploy failed at the step
[ADR 0010](0010-migrations-apply-on-deploy.md) introduced:

```
[migrate] database from DATABASE_URL
[migrate] failed: connect ENETUNREACH 2a05:…:5432
```

`DATABASE_URL` held Supabase's direct host, `db.<ref>.supabase.co`. That name
publishes no A record — it is AAAA-only — and Vercel's build containers have no
IPv6 egress, so the connection could not be opened at all. ADR 0010 works as
designed here: the deploy refused to promote a version whose schema it could not
confirm. Nothing was wrong with the database or the migrations.

The obvious fix, and the one the runbooks already prescribed, was Supabase's
**transaction** pooler on port 6543: IPv4, and the usual advice for serverless
because each function instance holds its own pool.

It is the wrong endpoint for this repository. `scripts/db-migrate.mjs` takes a
session-scoped `pg_advisory_lock`, runs `migrate()`, then unlocks — three
separate round trips on one logical session. A transaction pooler multiplexes
statements across backends, so:

- the lock can be taken on one backend while the migration runs on another, and
  it excludes nothing — the guarantee ADR 0010 leans on quietly disappears;
- the unlock can miss its backend, returning false into a discarded result and
  stranding the lock until that connection closes;
- a stranded lock is worse than no lock. Advisory locks are cluster-wide by key,
  so a later deploy landing on a different backend blocks on it and the build
  hangs rather than fails.

None of that shows up as a failed deploy on the day it is introduced. It shows
up later, as an intermittent hang, in the step that exists to keep production
safe.

Supabase's **session** pooler on port 5432 is also IPv4, and keeps one backend
per client session, so the lock behaves exactly as it does against a direct
connection.

## Decision

`DATABASE_URL` is a single pooler URL used by both the build-time migration and
the running app:

```
postgresql://postgres.<project-ref>:<password>@aws-N-<region>.pooler.supabase.com:5432/postgres
```

Session pooler, port 5432. Not the direct host, which Vercel cannot reach; not
the transaction pooler, whose semantics break the migration lock.

The pooler requires the tenant-qualified username `postgres.<project-ref>`
rather than plain `postgres` — a detail that turns a host change into an
authentication failure if it is missed.

`scripts/db-migrate.mjs` and `server/db.ts` continue to resolve the same
variable in the same order, so what the deploy verifies is what the app talks
to.

## Consequences

- One variable, one endpoint, and the migration lock means what ADR 0010 says
  it means.
- The app gives up the transaction pooler's connection multiplexing. At current
  traffic this is not the binding constraint; the session pooler still pools.
  **If instance growth makes 5432 the bottleneck, do not simply move
  `DATABASE_URL` to 6543** — that silently reintroduces the lock defect above.
  Give the migration script its own session-mode URL first, then move the app.
  The comment at the lock in `scripts/db-migrate.mjs` says so at the point of
  use.
- The Supabase/Vercel integration on this project is the older style: its
  `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING` and `POSTGRES_HOST` all point at
  the direct, IPv6-only host. They remain in the resolution order as documented
  fallbacks but cannot actually connect from Vercel, so `DATABASE_URL` must
  stay set. `/api/health` reports which variable won, which is how to tell.
- Rotating the database password means rebuilding this string with the pooler
  host _and_ the qualified username, not pasting the URI from the Supabase
  dashboard's default tab. See [runbooks/secrets.md](../runbooks/secrets.md).
