-- An account its owner deleted, kept only as a tombstone.
--
-- Apple has required in-app account deletion since 2022 and checks it in
-- review, but deleting the row is the wrong shape here: this schema declares no
-- foreign keys, and `proposedBy`, `addedBy` and friends are NOT NULL. A deleted
-- row would leave a proposal the group is still voting on pointing at nothing,
-- with nothing in the database to catch it.
--
-- So the row survives and everything identifying it does not: `server/db.ts`
-- clears `email`, `name`, `passwordHash`, `avatarUrl` and `loginMethod`, and
-- replaces `openId` with a fresh `deleted:` value, so there is no address to
-- send to, no credential to present and no session token that still resolves.
-- This column is what marks the result as a tombstone rather than an account
-- that merely never filled its profile in.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;--> statement-breakpoint

-- Deleted accounts are read through joins from other people's rows, never
-- listed on their own, so this needs no index: nothing filters on it, and a
-- partial index on a column that is null for every live account would earn
-- nothing.

-- Close the changed table to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'users', target);
    END IF;
  END LOOP;
END $$;
