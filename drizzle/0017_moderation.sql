-- Reporting and blocking, for Apple guideline 1.2.
--
-- An app carrying user-generated content must offer a filter, a way to report
-- content, a way to block an abusive user, and a published contact. The filter
-- is code (`shared/moderation.ts`) and the contact is configuration
-- (`SUPPORT_EMAIL`); these two tables are the other half.

CREATE TYPE "reported_content" AS ENUM ('comment', 'proposal', 'trip', 'member');--> statement-breakpoint
CREATE TYPE "report_reason" AS ENUM ('spam', 'harassment', 'hate', 'sexual', 'violence', 'other');--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM ('open', 'actioned', 'dismissed');--> statement-breakpoint

-- Something a member reported, and what an admin did about it.
--
-- These go to *app* admins — `users.role = 'admin'`, what `adminProcedure`
-- checks — not to the trip's own admins. A trip admin can already delete any
-- comment on their trip, but reporting a trip admin to that same trip admin is
-- not a moderation path, and theirs is the behaviour most worth escalating.
--
-- `tripId` is nullable because reporting an account is not reporting a trip.
CREATE TABLE IF NOT EXISTS "content_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporterUserId" integer NOT NULL,
	"tripId" integer,
	"contentType" "reported_content" NOT NULL,
	"contentId" integer NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" varchar(500),
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"reviewedByUserId" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "content_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- The queue: open reports, oldest first.
CREATE INDEX IF NOT EXISTS "content_reports_status_idx"
	ON "content_reports" ("status", "createdAt");--> statement-breakpoint

-- Reporting the same thing twice is one row, so a double-tap does not inflate
-- the queue — and so "how many people reported this" counts people, not taps.
CREATE UNIQUE INDEX IF NOT EXISTS "content_reports_once_idx"
	ON "content_reports" ("reporterUserId", "contentType", "contentId");--> statement-breakpoint

-- One person choosing not to hear from another.
--
-- Deliberately not mutual invisibility. Everyone in a trip shares it: a blocked
-- member keeps their place in the members list and their vote keeps counting,
-- because a trip somebody is legitimately on must not quietly lose a voter, and
-- a vote count that differed per viewer would be reported as data loss rather
-- than read as a block. What it does instead is collapse their comments and
-- stop them inviting the blocker or adding them to a contact book.
CREATE TABLE IF NOT EXISTS "user_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"blockerUserId" integer NOT NULL,
	"blockedUserId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "user_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_pair_idx"
	ON "user_blocks" ("blockerUserId", "blockedUserId");--> statement-breakpoint

-- "Who have I blocked?" — read on every thread the blocker opens.
CREATE INDEX IF NOT EXISTS "user_blocks_blocker_idx"
	ON "user_blocks" ("blockerUserId");--> statement-breakpoint

-- Close the new tables to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither.
DO $$
DECLARE
  target text;
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['content_reports', 'user_blocks'] LOOP
    FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, target);
      END IF;
    END LOOP;
  END LOOP;
END $$;
