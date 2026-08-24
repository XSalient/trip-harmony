-- "Go with the majority": a vote that states no preference.
--
-- Additive and behaviour-free on its own. Nothing writes 'majority' until the
-- routers accept it, and no existing row changes.
--
-- This file adds the four values and does nothing else, deliberately. ALTER
-- TYPE ... ADD VALUE cannot run in the same transaction as a statement that
-- *uses* the new value, and drizzle's migrate() may apply several pending
-- migrations in one transaction — so no migration after this one may reference
-- 'majority' either. The same reasoning is why 0010 added 'budget' alone.
ALTER TYPE "date_vote" ADD VALUE IF NOT EXISTS 'majority';--> statement-breakpoint

ALTER TYPE "destination_vote" ADD VALUE IF NOT EXISTS 'majority';--> statement-breakpoint

ALTER TYPE "accommodation_vote" ADD VALUE IF NOT EXISTS 'majority';--> statement-breakpoint

ALTER TYPE "budget_vote" ADD VALUE IF NOT EXISTS 'majority';
