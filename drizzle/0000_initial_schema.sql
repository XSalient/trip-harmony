CREATE TYPE "public"."accommodation_vote" AS ENUM('love', 'fine', 'veto');--> statement-breakpoint
CREATE TYPE "public"."budget_category" AS ENUM('accommodation', 'transport', 'food', 'activities', 'other');--> statement-breakpoint
CREATE TYPE "public"."date_vote" AS ENUM('available', 'maybe', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."destination_vote" AS ENUM('love', 'fine', 'veto');--> statement-breakpoint
CREATE TYPE "public"."itinerary_item_type" AS ENUM('activity', 'food', 'transport', 'accommodation', 'free', 'other');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('organizer', 'member');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('invite', 'vote_request', 'budget_alert', 'consensus', 'phase_change', 'referee', 'general');--> statement-breakpoint
CREATE TYPE "public"."preference_category" AS ENUM('accommodation', 'destination', 'dates', 'general');--> statement-breakpoint
CREATE TYPE "public"."proposal_type" AS ENUM('date', 'destination', 'accommodation');--> statement-breakpoint
CREATE TYPE "public"."referee_message_type" AS ENUM('nudge', 'mediation', 'compromise', 'celebration', 'summary');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'custom');--> statement-breakpoint
CREATE TYPE "public"."trip_phase" AS ENUM('setup', 'dates', 'destination', 'accommodation', 'activities', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('planning', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vibe_vote" AS ENUM('love', 'fine', 'veto');--> statement-breakpoint
CREATE TABLE "accommodation_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"accommodationId" integer NOT NULL,
	"attributes" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accommodation_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"accommodationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vote" "accommodation_vote" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accommodations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"imageUrl" text,
	"pricePerNight" numeric(12, 2),
	"totalPrice" numeric(12, 2),
	"perPersonCost" numeric(12, 2),
	"bedrooms" integer,
	"bathrooms" integer,
	"singleBeds" integer,
	"doubleBeds" integer,
	"toilets" integer,
	"ensuites" integer,
	"freeParking" boolean DEFAULT false,
	"camperParking" boolean DEFAULT false,
	"amenities" text,
	"preferences" text,
	"location" varchar(500),
	"link" text,
	"comfortScore" numeric(3, 1),
	"matchAnalysis" text,
	"matchAnalysedAt" timestamp,
	"proposedBy" integer NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"category" "budget_category" NOT NULL,
	"description" varchar(500) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"paidBy" integer,
	"splitType" "split_type" DEFAULT 'equal' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"proposedBy" integer NOT NULL,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"label" varchar(255),
	"selected" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vote" date_vote NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"destinationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vote" "destination_vote" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"imageUrl" text,
	"vibes" text,
	"estimatedCost" numeric(12, 2),
	"proposedBy" integer NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"date" text NOT NULL,
	"title" text,
	"notes" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"dayId" integer NOT NULL,
	"tripId" integer NOT NULL,
	"time" text,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"type" "itinerary_item_type" DEFAULT 'other' NOT NULL,
	"cost" numeric(10, 2),
	"link" text,
	"addedBy" integer NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_link_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "member_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"userId" integer NOT NULL,
	"category" "preference_category" NOT NULL,
	"rawText" text NOT NULL,
	"attributes" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"tripId" integer,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"actionUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalType" "proposal_type" NOT NULL,
	"proposalId" integer NOT NULL,
	"tripId" integer NOT NULL,
	"userId" integer NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referee_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"phase" varchar(50) NOT NULL,
	"messageType" "referee_message_type" NOT NULL,
	"content" text NOT NULL,
	"context" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "travel_dna" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"budgetComfort" integer DEFAULT 5 NOT NULL,
	"socialEnergy" integer DEFAULT 5 NOT NULL,
	"adventureLevel" integer DEFAULT 5 NOT NULL,
	"planningStyle" integer DEFAULT 5 NOT NULL,
	"culturalCuriosity" integer DEFAULT 5 NOT NULL,
	"comfortNeed" integer DEFAULT 5 NOT NULL,
	"foodPriority" integer DEFAULT 5 NOT NULL,
	"activityPace" integer DEFAULT 5 NOT NULL,
	"dietaryNeeds" text,
	"accessibilityNeeds" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"status" "member_status" DEFAULT 'pending' NOT NULL,
	"budgetMax" numeric(12, 2),
	"joinedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"coverImage" text,
	"organizerId" integer NOT NULL,
	"inviteCode" varchar(32) NOT NULL,
	"phase" "trip_phase" DEFAULT 'setup' NOT NULL,
	"status" "trip_status" DEFAULT 'planning' NOT NULL,
	"startDate" timestamp,
	"endDate" timestamp,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"totalBudget" numeric(12, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trips_inviteCode_unique" UNIQUE("inviteCode")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" text,
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"avatarUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vibe_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tripId" integer NOT NULL,
	"proposedBy" integer NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"description" text,
	"imageUrl" text,
	"tags" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vibe_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"vibeItemId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vote" "vibe_vote" NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
