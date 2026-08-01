# Database

PostgreSQL via Drizzle. `drizzle/schema.ts` is the canonical definition; see
[../architecture/data-model.md](../architecture/data-model.md) for what the tables mean.

## Changing the schema

1. Edit `drizzle/schema.ts`.
2. `pnpm db:push` — applies the diff to the database in `DATABASE_URL`.
3. `pnpm check` — the change propagates through `server/db.ts` to every caller,
   so the compiler will point at everything that needs updating.
4. Update [../architecture/data-model.md](../architecture/data-model.md) if the
   change is structural.
5. `pnpm verify` before committing.

```bash
pnpm db:push           # apply schema to DATABASE_URL
pnpm db:push:doppler   # same, with Doppler dev secrets
pnpm db:studio         # browse data in a local UI
pnpm db:generate       # emit SQL migration files (not yet part of the flow)
```

## Known gap: no migration history

`drizzle-kit push` diffs the schema and mutates the database directly. That is
fine locally and dangerous in production:

- there is no reviewable artifact — the change isn't in the diff, only its cause
- there is no rollback: promoting a previous Vercel deployment reverts the code
  but not the schema
- destructive changes (dropping or narrowing a column) are applied without an
  explicit, reviewed step

Migrating to generated, versioned migrations is the second item in
[../ROADMAP.md](../ROADMAP.md). Until then, treat production schema changes as
manual, deliberate operations:

1. Apply the change to the preview database first and exercise the app.
2. Take a backup of production.
3. Deploy the schema change **before** the code that depends on it, and make it
   additive (add a nullable column; backfill; only later make it required).
4. Never combine a destructive change with a feature deploy.

CI runs `pnpm db:push` against a throwaway Postgres on every PR, so a schema that
cannot be applied at all is caught before merge. That is a syntax check, not a
safety check.

## Connections

`getDb()` in `server/db.ts` lazily creates one pooled client per process and
reuses it. Two consequences:

- **Serverless:** each function instance holds its own pool, so instance count
  multiplies connections. Use your provider's pooled endpoint — Supabase: port
  6543 with `pgbouncer=true`, not the direct 5432 URL.
- **No `DATABASE_URL`:** `getDb()` returns `null` and every query no-ops instead
  of throwing, so the app still boots for frontend work. Callers handle the null
  case. `/api/health` reports `"database": "missing"` — check it before assuming
  data loss.

## Local database

See [local-setup.md](local-setup.md). A disposable container is enough:

```bash
docker run -d --name harmony-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=harmony_dev \
  -p 5432:5432 postgres:16
```

To reset completely, drop and recreate the database, then `pnpm db:push`.

## Backups

Not automated by this repository — use your provider's (Supabase and Neon both
offer point-in-time recovery). Take a manual snapshot before any schema change
in production.
