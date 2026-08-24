-- "No thanks" to a suggestion, remembered.
--
-- A suggestion that has become a proposal suppresses itself: its fingerprint
-- is then among the trip's, and nothing needs storing. A suggestion somebody
-- turned down has no such trace, so without this row the same card returns on
-- every save and a helpful prompt becomes something to dismiss unread.
CREATE TABLE IF NOT EXISTS "suggestion_dismissals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"userId" integer NOT NULL,
	"kind" varchar(24) NOT NULL,
	"fingerprint" varchar(200) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "suggestion_dismissals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Dismissing twice is one row, so a double-tap is not two.
CREATE UNIQUE INDEX IF NOT EXISTS "suggestion_dismissals_unique_idx"
	ON "suggestion_dismissals" ("tripId", "userId", "kind", "fingerprint");--> statement-breakpoint

-- Close the new table to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'suggestion_dismissals', target);
    END IF;
  END LOOP;
END $$;
