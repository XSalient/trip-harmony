-- Attendees: everyone who is coming, with or without an account.
--
-- The backfill at the bottom is the point of the migration. Without it, a trip
-- that existed before this shipped reports a headcount of zero and every
-- per-person budget figure divides by nothing.
CREATE TYPE "attendee_kind" AS ENUM('adult', 'child', 'pet');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trip_attendees" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"groupId" integer,
	"memberUserId" integer,
	"name" varchar(120) NOT NULL,
	"kind" "attendee_kind" NOT NULL,
	"age" integer,
	"notes" varchar(300),
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "trip_attendees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "trip_attendees_trip_idx" ON "trip_attendees" ("tripId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trip_attendees_group_idx" ON "trip_attendees" ("groupId");--> statement-breakpoint

-- One attendee row per account per trip. This is what stops a re-accepted
-- invite from counting somebody twice; it is partial because most attendees
-- have no account at all.
CREATE UNIQUE INDEX IF NOT EXISTS "trip_attendees_member_idx"
	ON "trip_attendees" ("tripId", "memberUserId")
	WHERE "memberUserId" IS NOT NULL;--> statement-breakpoint

-- Every accepted member becomes an adult attendee. Names come from the user
-- row; 'Member' is the fallback for an account that never set one, because the
-- column is NOT NULL and a blank name reads as a bug on the members page.
INSERT INTO "trip_attendees" ("tripId", "groupId", "memberUserId", "name", "kind")
SELECT m."tripId", NULL, m."userId", COALESCE(NULLIF(u."name", ''), 'Member'), 'adult'
FROM "trip_members" m
JOIN "users" u ON u."id" = m."userId"
WHERE m."status" = 'accepted'
ON CONFLICT DO NOTHING;--> statement-breakpoint

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
  FOREACH tbl IN ARRAY ARRAY['trip_attendees'] LOOP
    FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, target);
      END IF;
    END LOOP;
  END LOOP;
END $$;
