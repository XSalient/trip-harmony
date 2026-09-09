-- Which sections a trip has switched off.
--
-- The trip page renders eight sections for every trip, whether or not the trip
-- has any use for them: a one-day trip is asked to vote on accommodation, and
-- the AI Referee reports "nobody has proposed a budget" as a gap on a group
-- that was never going to have one.
--
-- Stored as a JSON array of the section keys in `shared/sections.ts`, read back
-- through `parseHiddenSections`. Nullable, and null means nothing is hidden, so
-- every trip that exists today is unchanged by this column arriving.
--
-- It records what is *off*, not what is on. A section added to the app later
-- then appears on every existing trip, rather than being invisible until
-- somebody opts each trip in one at a time.
--
-- `text` rather than `jsonb` to match every other JSON value in this schema
-- (`activity_events.metadata`, `product_events.metadata`,
-- `member_preferences.attributes`). Nothing queries inside it and nothing
-- should: "which trips hide Budget" is a product-measurement question, not a
-- schema one.
--
-- Written by hand, like every migration since 0008: `drizzle/meta/` holds
-- snapshots only up to 0007, so `drizzle-kit generate` would diff against
-- 0007 and re-emit twelve migrations' worth of changes. See
-- `docs/runbooks/database.md`.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "hiddenSections" text;--> statement-breakpoint

-- No index. Nothing filters or joins on this column — it is read with the trip
-- row it belongs to, by primary key, and never on its own.

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
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'trips', target);
    END IF;
  END LOOP;
END $$;
