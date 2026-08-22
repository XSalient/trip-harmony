-- DESTRUCTIVE AND IRREVERSIBLE. Every logged expense goes with this.
--
-- The expense journal is replaced by budget proposals (0010), not extended by
-- them: it recorded what had been spent on a trip that had not happened, and it
-- could not express the question a group actually argues about. Nothing reads
-- `budget_items` after this ships.
--
-- Deliberately the last migration and the only thing in it, so it can be held
-- back for a release while everything else lands. Take a backup first if any
-- production row is worth keeping — 0006 and 0007 set this precedent.
DROP TABLE IF EXISTS "budget_items";--> statement-breakpoint
DROP TYPE IF EXISTS "budget_category";--> statement-breakpoint
DROP TYPE IF EXISTS "split_type";
