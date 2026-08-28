-- Subscriptions, as the stores report them.
--
-- Sold through Apple's and Google's in-app purchase, which is mandatory for
-- digital goods, so no card details ever reach this server. RevenueCat sits in
-- front of both and posts here when anything changes.
--
-- This table is written **only** by that webhook. A purchase is a fact the store
-- owns; every column here comes from a webhook payload and none from a tRPC
-- input, because a client that could write it could grant itself the product.

CREATE TYPE "subscription_status" AS ENUM ('active', 'in_grace_period', 'billing_issue', 'expired');--> statement-breakpoint
CREATE TYPE "subscription_store" AS ENUM ('app_store', 'play_store', 'promotional');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"revenueCatId" varchar(128),
	"productId" varchar(128) NOT NULL,
	"store" "subscription_store" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"expiresAt" timestamp,
	"cancelledAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- One subscription per account. The webhook upserts on this, so an event
-- delivered twice — which RevenueCat does, deliberately, on retry — is one row
-- rather than two and the later one wins.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_idx"
	ON "subscriptions" ("userId");--> statement-breakpoint

-- Close the new table to Supabase's PostgREST roles, per ADR 0009. This one
-- matters more than most: a subscription row readable or writable through
-- PostgREST would be a way to grant yourself the product.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'subscriptions', target);
    END IF;
  END LOOP;
END $$;
