-- Budget becomes a proposal type.
--
-- Additive only. `budget_items` still exists after this and is dropped by 0011,
-- separately, so the destructive half can be held back.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement
-- that uses the new value, so this migration adds the value and creates tables
-- and does nothing else with 'budget'.
ALTER TYPE "proposal_type" ADD VALUE IF NOT EXISTS 'budget';--> statement-breakpoint

CREATE TYPE "budget_scope" AS ENUM('trip_total', 'per_person', 'per_adult', 'per_group');--> statement-breakpoint
CREATE TYPE "budget_vote" AS ENUM('love', 'fine', 'veto');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "budget_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"proposedBy" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"scope" "budget_scope" NOT NULL,
	"covers" text,
	"selected" boolean DEFAULT false NOT NULL,
	"lockedBy" integer,
	"lockedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "budget_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vote" "budget_vote" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "budget_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "budget_proposals" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "budget_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "budget_votes" FROM anon, authenticated;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "budget_proposals_trip_idx" ON "budget_proposals" ("tripId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_votes_proposal_user_idx"
	ON "budget_votes" ("proposalId", "userId");--> statement-breakpoint

ALTER TABLE "trip_groups" ADD COLUMN IF NOT EXISTS "budgetMax" numeric(12, 2);
