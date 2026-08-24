-- Families in the contact book, so the same five people are not retyped for
-- every trip.
--
-- Additive. A contact group is a saved label over the address book: it grants
-- nothing, exactly as a contact does not, and importing one into a trip still
-- sends invites that still have to be accepted.
--
-- References no enum value added by 0012 — drizzle may apply both migrations in
-- one transaction, and a value cannot be used in the transaction that added it.
CREATE TABLE IF NOT EXISTS "contact_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "contact_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"groupId" integer NOT NULL,
	"contactId" integer,
	"name" varchar(255) NOT NULL,
	"email" varchar(320),
	"kind" "attendee_kind" DEFAULT 'adult' NOT NULL,
	"age" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "contact_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Owner-scoped and case-insensitive: "the Patels" and "The Patels" are one
-- family, and saving the second one is how a book ends up with both.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_groups_owner_name_idx"
	ON "contact_groups" ("ownerUserId", lower("name"));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contact_group_members_group_idx"
	ON "contact_group_members" ("groupId");--> statement-breakpoint

-- Saving the same family twice appends the people who are new and nothing
-- else. These two are what make that true under a double-tap rather than only
-- when the code remembers to check.
CREATE UNIQUE INDEX IF NOT EXISTS "contact_group_members_group_email_idx"
	ON "contact_group_members" ("groupId", lower("email"))
	WHERE "email" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "contact_group_members_group_name_idx"
	ON "contact_group_members" ("groupId", lower("name"))
	WHERE "email" IS NULL;--> statement-breakpoint

-- The group an invited person joins on acceptance.
--
-- Without it, importing a family of five produces five ungrouped members and an
-- empty group: the invite is the only thing that survives between the import
-- and the moment they accept, so it is the only place the intent can live.
ALTER TABLE "trip_invites" ADD COLUMN IF NOT EXISTS "groupId" integer;--> statement-breakpoint

-- Close the new tables to Supabase's PostgREST roles, per ADR 0009.
--
-- Guarded on the roles existing: `anon` and `authenticated` are Supabase's, and
-- a bare Postgres — CI's, and any local scratch database — has neither.
DO $$
DECLARE
  target text;
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['contact_groups', 'contact_group_members'] LOOP
    FOREACH target IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, target);
      END IF;
    END LOOP;
  END LOOP;
END $$;
