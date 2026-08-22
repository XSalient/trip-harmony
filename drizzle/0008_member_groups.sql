-- Member groups: the family or household a trip actually plans in.
--
-- Nothing here changes behaviour on its own. `votingUnit` defaults to 'member',
-- which is what every existing trip already does, and `groupId` is null for
-- everyone. A trip that never creates a group is untouched by this migration.
CREATE TYPE "voting_unit" AS ENUM('member', 'group');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trip_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"budgetMax" numeric(12, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "trip_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Two groups called "The Patels" on one trip is a data-entry slip, not a plan.
-- Drizzle cannot express a functional index, so it lives only here.
CREATE UNIQUE INDEX IF NOT EXISTS "trip_groups_trip_name_idx"
	ON "trip_groups" ("tripId", lower("name"));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "trip_groups_trip_idx" ON "trip_groups" ("tripId");--> statement-breakpoint

ALTER TABLE "trips" ADD COLUMN "votingUnit" "voting_unit" DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "groupId" integer;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "trip_members_group_idx" ON "trip_members" ("groupId");--> statement-breakpoint

-- Close the new table to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither. An
-- unguarded REVOKE fails there, which is how this first reached CI red.
DO $$
DECLARE
  target text;
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['trip_groups'] LOOP
    FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, target);
      END IF;
    END LOOP;
  END LOOP;
END $$;
