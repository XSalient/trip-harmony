CREATE TABLE IF NOT EXISTS "product_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" varchar(48) NOT NULL,
	"tripId" integer,
	"actorUserId" integer,
	"metadata" text,
	"occurredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Every query in docs/runbooks/beta-metrics.md is "this event, over this
-- window", so the name leads and the time follows it.
CREATE INDEX "product_events_event_occurred_idx" ON "product_events" ("event", "occurredAt");
--> statement-breakpoint
-- The funnels are per-trip: invites sent against invites accepted, proposals
-- against decisions.
CREATE INDEX "product_events_trip_idx" ON "product_events" ("tripId");
--> statement-breakpoint
-- ADR 0009: RLS on, no policies, and nothing granted to the roles a Supabase
-- anon key authenticates as. Postgres has no default-on RLS, so a new table is
-- open until this runs. Done here rather than by hand this time — the deploy
-- applies migrations (ADR 0010), and a table that has to be remembered is a
-- table that eventually is not. The table is new, so this migration is purely
-- additive and safe on the one database preview and production share (ADR 0023).
ALTER TABLE "product_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither. The
-- revoke is built with format() so no bare REVOKE ever names a missing role.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'product_events', target);
    END IF;
  END LOOP;
END $$;
