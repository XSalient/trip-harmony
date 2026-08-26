-- Indexes for the lookups every page load makes.
--
-- `drizzle/schema.ts` declared none, so `0000_initial_schema.sql` created none:
-- the only indexes this database has are the ones migrations 0005 and 0008-0013
-- wrote by hand for the tables they added. Everything from the original schema
-- — memberships, votes, proposals, notifications, comments — was a sequential
-- scan, including `trip_members (tripId, userId)`, which `requireTripRole` runs
-- on every trip-scoped procedure.
--
-- That is cheap on a small table and stops being cheap at exactly the moment
-- there is enough data to care, which is also the moment it is hardest to fix.
-- With the pool capped at three connections (ADR 0012), a scan that takes an
-- extra few milliseconds is holding one of three slots while it does.
--
-- All additive: `CREATE INDEX` takes a brief lock on tables this size and
-- changes no data. `IF NOT EXISTS` throughout, so re-running is a no-op and a
-- database that somebody indexed by hand does not fail the deploy.
--
-- Note for whoever adds the next one: this file is hand-written, as 0008
-- onwards all are. `drizzle-kit generate` cannot be used in this repository —
-- `drizzle/meta/` stops at snapshot 0007, so it would diff against a schema
-- seven migrations stale and emit DDL that recreates everything since. Fixing
-- that drift is its own piece of work; see docs/architecture/data-model.md.

-- The most-executed lookup in the app: `requireTripRole`, `getTripMember`,
-- `setMemberGroup`, and every membership check.
--
-- Not unique, though it morally is — no two rows should share a trip and a
-- user. A unique index that fails to build takes the deploy down with it, and
-- this table has never been checked for duplicate pairs. Tightening it is a
-- migration of its own, after that check.
CREATE INDEX IF NOT EXISTS "trip_members_trip_user_idx"
	ON "trip_members" ("tripId", "userId");--> statement-breakpoint

-- `getUserTrips` — the first screen anybody sees after signing in.
CREATE INDEX IF NOT EXISTS "trip_members_user_status_idx"
	ON "trip_members" ("userId", "status");--> statement-breakpoint

-- `(tripId)` alone is deliberately absent: it leads the composite above, so a
-- lookup by trip alone already uses it.

-- The three proposal listings, one per screen.
CREATE INDEX IF NOT EXISTS "date_proposals_trip_idx"
	ON "date_proposals" ("tripId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "destinations_trip_idx"
	ON "destinations" ("tripId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accommodations_trip_idx"
	ON "accommodations" ("tripId");--> statement-breakpoint

-- The votes those listings read, and that `reconcileGroupVotes` scans across
-- all four types whenever somebody changes group. `budget_votes` already has
-- `budget_votes_proposal_user_idx` from 0010.
CREATE INDEX IF NOT EXISTS "date_votes_proposal_idx"
	ON "date_votes" ("proposalId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "destination_votes_destination_idx"
	ON "destination_votes" ("destinationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accommodation_votes_accommodation_idx"
	ON "accommodation_votes" ("accommodationId");--> statement-breakpoint

-- The unread badge, polled from the bottom bar of every authenticated screen.
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx"
	ON "notifications" ("userId", "read");--> statement-breakpoint

-- One comment thread, and the per-trip sweep the activity feed makes.
CREATE INDEX IF NOT EXISTS "proposal_comments_lookup_idx"
	ON "proposal_comments" ("proposalType", "proposalId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_comments_trip_idx"
	ON "proposal_comments" ("tripId");
