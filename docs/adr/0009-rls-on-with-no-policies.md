# 0009. RLS on with no policies, and no grants for anon

- Status: Accepted
- Date: 2026-08-02

## Context

The production Supabase project had Row Level Security **disabled on all 23
tables**, and the `anon` and `authenticated` roles held
`SELECT/INSERT/UPDATE/DELETE/TRUNCATE` on every one of them.

Those two roles are what a Supabase project's **anon key** authenticates as, and
an anon key is designed to be shipped in client-side code — it is not a secret.
Anyone holding it could read or modify every row through PostgREST or the
GraphQL endpoint: `users.passwordHash`, every email address,
`magic_link_tokens`, and `webauthn_credentials`.

The usual objection to enabling RLS — "with no policies it blocks everything" —
does not apply to this application:

- It has **no Supabase client dependency**. Nothing imports `@supabase/*`.
- `server/db.ts` connects with `pg` over a connection string as the `postgres`
  role, which has `rolbypassrls = true`.
- Authorisation is done in the application, in `requireTripRole` and the
  projections in `server/routers/_shared.ts` — not in the database.

So the roles that RLS restricts are exactly the roles this app never uses.

## Decision

Enable RLS on every table in `public` and **add no policies**. Separately,
revoke all table and sequence privileges from `anon` and `authenticated`, and
change the schema's default privileges so tables added later do not inherit
them.

`service_role` keeps its grants: its key is secret by design and it is the
legitimate admin path.

## Consequences

- The PostgREST and GraphQL surfaces are closed. `anon` and `authenticated` now
  get `permission denied` on every table — verified by assuming each role and
  attempting a read.
- The application is unaffected, because it never authenticated as those roles.
- Supabase's linter now reports 23 INFO-level `rls_enabled_no_policy` notices.
  **That is the intended state here, not a gap to close.** Adding permissive
  policies would reopen what this ADR closes.
- If the app ever adopts Supabase client libraries — realtime subscriptions,
  storage, or their auth — this becomes a real constraint: that work would have
  to write policies, and would have to move some authorisation into the database
  that currently lives in the router layer. Weigh that before adopting them.
- Anyone restoring this database elsewhere, or creating a new environment, must
  repeat this **for the tables that existed when this ADR was written**. It is a
  property of the deployment, not of `drizzle/schema.ts`, so `pnpm db:push`
  against a fresh Supabase project will **not** reproduce it.

## Amended 2026-08-22 — new tables close themselves

Tables added from migration `0008` onwards carry their own closure: the
migration that creates a table also enables RLS on it and revokes from `anon`
and `authenticated`. Leaving it to a remembered manual step meant every new
table was open until somebody remembered, and four arrived at once.

The revoke is **guarded on the roles existing**, because the same migration has
to apply to three databases and only one of them is Supabase — CI's Postgres and
any local scratch database have neither role, and an unguarded
`REVOKE ... FROM anon` is a hard error there. The first version of 0008–0010
was unguarded; it passed locally only because the roles had been created by hand
in the scratch database, and turned CI red on the first push.

Enabling RLS needs no guard and is portable, so it is a plain statement.

`scripts/lib/migrationSql.test.mjs` asserts both halves across every migration:
no bare `REVOKE` naming a role that may not exist, and RLS enabled on every
table a migration creates. That test, not this paragraph, is what stops the next
one.
