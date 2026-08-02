-- Member roles become Admin / Tripmate / Watcher, plus email invites and a
-- per-user contact book.
--
-- The role change is not a rename: `organizer` and `member` are replaced by a
-- three-value type, so the column is rewritten through an explicit mapping.
-- Postgres cannot drop a value from an enum in use, and ALTER TYPE ... RENAME
-- VALUE would leave the old two-value shape behind, so a new type is created
-- and swapped in.
--
-- Mapping, agreed with the trip owner: organizer -> admin, member -> tripmate.
-- Nobody becomes a watcher here; every existing member keeps the rights they
-- already had.
--
-- HAND-WRITTEN, deliberately. `drizzle-kit generate` produces a version that
-- casts the column to text, recreates the type, and casts back with
-- `USING "role"::"member_role"` — which fails on every existing row, because
-- 'organizer' and 'member' are not values of the new type. It has nowhere to put
-- the mapping. `meta/0003_snapshot.json` is drizzle's, so future generates still
-- diff correctly; only the SQL is ours.

CREATE TYPE "member_role_new" AS ENUM('watcher', 'tripmate', 'admin');
--> statement-breakpoint
ALTER TABLE "trip_members" ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "trip_members"
  ALTER COLUMN "role" TYPE "member_role_new"
  USING (
    CASE "role"::text
      WHEN 'organizer' THEN 'admin'
      WHEN 'member' THEN 'tripmate'
      ELSE 'tripmate'
    END
  )::"member_role_new";
--> statement-breakpoint
DROP TYPE "member_role";
--> statement-breakpoint
ALTER TYPE "member_role_new" RENAME TO "member_role";
--> statement-breakpoint
ALTER TABLE "trip_members" ALTER COLUMN "role" SET DEFAULT 'tripmate';
--> statement-breakpoint
CREATE TYPE "joined_via" AS ENUM('creator', 'link', 'email');
--> statement-breakpoint
CREATE TYPE "invite_status" AS ENUM('pending', 'accepted', 'declined', 'revoked');
--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "invitedBy" integer;
--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "joinedVia" "joined_via";
--> statement-breakpoint
ALTER TABLE "trip_members" ADD COLUMN "respondedAt" timestamp;
--> statement-breakpoint
-- Existing rows predate invite tracking. The trip creator is the one case we
-- can infer with certainty; everyone else is left null rather than guessed at,
-- and the members page reads null as "not recorded".
UPDATE "trip_members" AS m
  SET "joinedVia" = 'creator'
  FROM "trips" AS t
  WHERE t."id" = m."tripId" AND t."organizerId" = m."userId";
--> statement-breakpoint
CREATE TABLE "trip_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" "member_role" DEFAULT 'tripmate' NOT NULL,
	"invitedBy" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp,
	CONSTRAINT "trip_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
-- One live invite per address per trip; re-inviting updates the existing row.
CREATE UNIQUE INDEX "trip_invites_trip_email_idx" ON "trip_invites" ("tripId", lower("email"));
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"contactUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_owner_email_idx" ON "contacts" ("ownerUserId", lower("email"));
