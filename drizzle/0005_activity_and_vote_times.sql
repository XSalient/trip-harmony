CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"actorUserId" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"entityType" varchar(32),
	"entityId" integer,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accommodation_votes" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "date_votes" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "destination_votes" ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
-- The trail is always read newest-first for one trip.
CREATE INDEX "activity_events_trip_created_idx" ON "activity_events" ("tripId", "createdAt" DESC);
--> statement-breakpoint
-- Existing votes were cast before this column existed. Defaulting them to now()
-- would claim every historical vote changed at migration time; their creation
-- time is the honest answer, since none of them has been changed since.
UPDATE "date_votes" SET "updatedAt" = "createdAt";
--> statement-breakpoint
UPDATE "destination_votes" SET "updatedAt" = "createdAt";
--> statement-breakpoint
UPDATE "accommodation_votes" SET "updatedAt" = "createdAt";
