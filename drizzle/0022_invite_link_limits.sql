-- The shared invite link stops being an open door.
--
-- Following a trip's invite link used to write an accepted membership: a vote
-- on every proposal, a head in every per-person figure, and sight of every
-- member's email and budget ceiling. Possession of a URL was membership, and a
-- URL travels — forwarded, pasted into a group chat, left in a browser on a
-- shared laptop. See `docs/adr/0028-the-shared-link-is-off-by-default.md`.
--
-- Three columns, one per fact an admin now decides:
--
--   inviteLinkEnabled    is the link answering at all
--   inviteUsesLeft       how many more people it may admit, counting down
--   inviteLinkExpiresAt  when it stops regardless
--
-- `inviteLinkEnabled` defaults to false, so **this migration closes the link
-- on every trip that exists**. That is the point of it: the column cannot
-- default to the behaviour it was added to end, and an admin re-opens the link
-- in one tap with a number beside it. The emailed invitations are untouched —
-- they are addressed to a person and are not affected by this switch.
--
-- `inviteUsesLeft` counts down rather than up so that "3 left" is the number
-- the admin set and the number the screen shows, with nothing to subtract. It
-- is spent with a conditional UPDATE (`spendInviteLinkUse` in `server/db.ts`),
-- which is what makes two people tapping the link at the same moment unable to
-- both take the last use.
--
-- Backward compatible with `master`, as ADR-0023 requires: nothing on `master`
-- reads these columns, and the trips they land on keep working exactly as they
-- did — minus the link, which is the change.
--
-- Written by hand, like every migration since 0008: `drizzle/meta/` holds
-- snapshots only up to 0007, so `drizzle-kit generate` would diff against 0007
-- and re-emit fourteen migrations' worth of changes. See
-- `docs/runbooks/database.md`.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "inviteLinkEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "inviteUsesLeft" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "inviteLinkExpiresAt" timestamp;--> statement-breakpoint

-- The seeded demo trips are the one exception in the code (`isDemoTrip`), and
-- they need none here: `trips.join` bypasses this switch for them, so the sales
-- tour keeps working without a row being special-cased in the database.

-- No index. All three are read with the trip row they belong to, by primary
-- key, and never filtered on.

-- Close the changed table to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither.
DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'trips', target);
    END IF;
  END LOOP;
END $$;
