ALTER TABLE "accommodations" ADD COLUMN "lockedBy" integer;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "lockedAt" timestamp;--> statement-breakpoint
ALTER TABLE "date_proposals" ADD COLUMN "lockedBy" integer;--> statement-breakpoint
ALTER TABLE "date_proposals" ADD COLUMN "lockedAt" timestamp;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "lockedBy" integer;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "lockedAt" timestamp;--> statement-breakpoint
-- Nullable and not backfilled on purpose. Proposals finalised before this
-- migration have no recorded author, and the screens read null as
-- "Finalised" without a name rather than guessing at one.
