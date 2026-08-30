import {
  index,
  uniqueIndex,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  decimal,
} from "drizzle-orm/pg-core";
export const proposalTypeEnum = pgEnum("proposal_type", [
  "date",
  "destination",
  "accommodation",
  "budget",
]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const tripPhaseEnum = pgEnum("trip_phase", [
  "setup",
  "dates",
  "destination",
  "accommodation",
  "activities",
  "finalized",
]);
export const tripStatusEnum = pgEnum("trip_status", [
  "planning",
  "active",
  "completed",
  "cancelled",
]);
/**
 * What a member may do on a trip. Ordered least to most capable; the ordering
 * itself lives in `shared/roles.ts`, which both sides import.
 *
 * Replaced the original `organizer` / `member` pair — see
 * `drizzle/0003_member_roles.sql` for the mapping applied to existing rows.
 */
export const memberRoleEnum = pgEnum("member_role", [
  "watcher",
  "tripmate",
  "admin",
]);
export const memberStatusEnum = pgEnum("member_status", [
  "pending",
  "accepted",
  "declined",
]);
/**
 * Whether a proposal carries one vote per person or one per group.
 *
 * `member` is the default and is what every trip did before groups existed: a
 * trip that never creates a group behaves exactly as it always has.
 */
export const votingUnitEnum = pgEnum("voting_unit", ["member", "group"]);
/**
 * What an attendee is. A pet is deliberately one of these rather than a flag:
 * every question the app asks about an attendee — is there an age, is this a
 * chargeable head — is answered by the kind alone.
 */
export const attendeeKindEnum = pgEnum("attendee_kind", [
  "adult",
  "child",
  "pet",
]);
/** How someone came to be on the trip — a shared link, an emailed invite, or creating it. */
export const joinedViaEnum = pgEnum("joined_via", ["creator", "link", "email"]);
export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
]);
/** `majority` is an abstention worth nothing — see `shared/votes.ts`. */
export const dateVoteEnum = pgEnum("date_vote", [
  "available",
  "maybe",
  "unavailable",
  "majority",
]);
/** `majority` is an abstention worth nothing — see `shared/votes.ts`. */
export const destinationVoteEnum = pgEnum("destination_vote", [
  "love",
  "fine",
  "veto",
  "majority",
]);
/** `majority` is an abstention worth nothing — see `shared/votes.ts`. */
export const accommodationVoteEnum = pgEnum("accommodation_vote", [
  "love",
  "fine",
  "veto",
  "majority",
]);
/**
 * What a budget proposal's amount means. Proposals written in different scopes
 * are compared by normalising both to a trip total — see `shared/budget.ts`,
 * which is the only place that arithmetic lives.
 */
export const budgetScopeEnum = pgEnum("budget_scope", [
  "trip_total",
  "per_person",
  "per_adult",
  "per_group",
]);
/** `majority` is an abstention worth nothing — see `shared/votes.ts`. */
export const budgetVoteEnum = pgEnum("budget_vote", [
  "love",
  "fine",
  "veto",
  "majority",
]);
export const refereeMessageTypeEnum = pgEnum("referee_message_type", [
  "nudge",
  "mediation",
  "compromise",
  "celebration",
  "summary",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "invite",
  "vote_request",
  "budget_alert",
  "consensus",
  "phase_change",
  "referee",
  "general",
]);
export const preferenceCategoryEnum = pgEnum("preference_category", [
  "accommodation",
  "destination",
  "dates",
  "general",
]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /**
   * When this account was deleted by the person who owned it, or null.
   *
   * A deleted account keeps its row and loses everything that identifies it:
   * `email`, `name`, `passwordHash` and `avatarUrl` are cleared and `openId` is
   * replaced with a fresh `deleted:` value, so there is nothing left to sign in
   * with and nothing left to recognise. What survives is an integer other
   * people's rows already point at — `proposedBy` on a proposal the group is
   * still voting on, `addedBy` on an accommodation somebody booked.
   *
   * Deleting the row instead would take those with it, or leave them dangling:
   * `proposedBy` is NOT NULL and this schema declares no foreign keys, so
   * nothing would stop a proposal outliving its proposer and nothing would
   * catch it when it did. The tombstone is what lets one person leave without
   * deleting everyone else's trip.
   */
  deletedAt: timestamp("deletedAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Trip groups — the core container for a trip.
 */
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  coverImage: text("coverImage"),
  organizerId: integer("organizerId").notNull(),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  phase: tripPhaseEnum("phase").default("setup").notNull(),
  status: tripStatusEnum("status").default("planning").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  totalBudget: decimal("totalBudget", { precision: 12, scale: 2 }),
  /** One vote per person, or one per group. See `votingUnitEnum`. */
  votingUnit: votingUnitEnum("votingUnit").default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

/**
 * Trip members — who is in each trip and their role.
 */
export const tripMembers = pgTable(
  "trip_members",
  {
    id: serial("id").primaryKey(),
    tripId: integer("tripId").notNull(),
    userId: integer("userId").notNull(),
    role: memberRoleEnum("role").default("tripmate").notNull(),
    status: memberStatusEnum("status").default("pending").notNull(),
    /**
     * The member's group, or null. **Null is a first-class state**, not a
     * missing value: an ungrouped member is a group of one everywhere it
     * matters. Nobody is auto-assigned a singleton group — that doubles the
     * rows and makes the members page unreadable for the trips that never
     * wanted groups.
     */
    groupId: integer("groupId"),
    /** Personal spending ceiling. Superseded by the group's when the member is in one. */
    budgetMax: decimal("budgetMax", { precision: 12, scale: 2 }),
    /** Who invited them, when it is known. Null for the creator and for pre-invite rows. */
    invitedBy: integer("invitedBy"),
    joinedVia: joinedViaEnum("joinedVia"),
    /** When they accepted or declined — distinct from `joinedAt`, which is when the row appeared. */
    respondedAt: timestamp("respondedAt"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  t => [
    /**
     * The most-executed lookup in the app. `requireTripRole` runs it on every
     * trip-scoped procedure, and `getTripMember`, `setMemberGroup` and every
     * membership check go through the same pair. It was a sequential scan.
     *
     * Not unique, though it morally is: a unique index that fails to build
     * takes the deploy down, and this table has never been checked for
     * duplicate pairs. Making it unique is a migration of its own, after that
     * check.
     */
    index("trip_members_trip_user_idx").on(t.tripId, t.userId),
    /** `getUserTrips` — the first screen after signing in. */
    index("trip_members_user_status_idx").on(t.userId, t.status),
    // `(tripId)` alone needs nothing: it leads the composite above.
  ]
);

export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

/**
 * A family or household on a trip.
 *
 * The unit a trip of families actually plans in: one opinion, one wallet. A
 * member belongs to at most one, and belonging to none is normal — see
 * `tripMembers.groupId`.
 *
 * A case-insensitive unique index on `(tripId, lower(name))` is created in
 * `0008_member_groups.sql`. Drizzle cannot express a functional index, so that
 * migration is part of this table's definition — this file is not the whole story.
 */
export const tripGroups = pgTable("trip_groups", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  /** The group's shared ceiling. Supersedes `tripMembers.budgetMax` for anyone in it. */
  budgetMax: decimal("budgetMax", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TripGroup = typeof tripGroups.$inferSelect;
export type InsertTripGroup = typeof tripGroups.$inferInsert;

/**
 * Everyone who is coming, whether or not they use the app.
 *
 * Members are attendees too — one row each, written when they accept — so
 * headcount is one number rather than "members plus attendees, mind the
 * overlap". Everyone else (children, a partner who will not install anything,
 * the dog) exists only here: no login, no vote, no notifications.
 */
export const tripAttendees = pgTable("trip_attendees", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  /** Null means on the trip but in no group — the same first-class state as an ungrouped member. */
  groupId: integer("groupId"),
  /**
   * The account this attendee is, when they have one. A partial unique index on
   * `(tripId, memberUserId)` in `0009_trip_attendees.sql` is what stops a
   * re-accepted invite from counting somebody twice.
   */
  memberUserId: integer("memberUserId"),
  name: varchar("name", { length: 120 }).notNull(),
  kind: attendeeKindEnum("kind").notNull(),
  /**
   * Years. Null for two different reasons that share a column: a pet has no
   * meaningful one, and an adult need not give theirs.
   */
  age: integer("age"),
  notes: varchar("notes", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TripAttendee = typeof tripAttendees.$inferSelect;
export type InsertTripAttendee = typeof tripAttendees.$inferInsert;

/**
 * Invitations sent to an email address.
 *
 * These cannot live in `trip_members`, whose `userId` is NOT NULL: most invites
 * go to someone with no account yet, and inventing a placeholder user to hold
 * the row would put a person on the trip who never agreed to be there.
 *
 * A case-insensitive unique index on `(tripId, lower(email))` is created in
 * `0003_member_roles.sql`. Drizzle cannot express a functional index here, so it
 * lives in the migration only — do not assume this file is the whole story.
 */
export const tripInvites = pgTable("trip_invites", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  /** The role they get on acceptance. */
  role: memberRoleEnum("role").default("tripmate").notNull(),
  invitedBy: integer("invitedBy").notNull(),
  /** Distinguishes "joined by email invite" from "followed the shared link". */
  token: varchar("token", { length: 64 }).notNull().unique(),
  /**
   * The group they join on acceptance, when the invite came from importing a
   * family. Null for every ordinary invite. The invite is the only thing that
   * survives between "add the Patels to this trip" and the moment a Patel
   * accepts, so it is the only place that intent can be kept.
   */
  groupId: integer("groupId"),
  status: inviteStatusEnum("status").default("pending").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});

export type TripInvite = typeof tripInvites.$inferSelect;
export type InsertTripInvite = typeof tripInvites.$inferInsert;

/**
 * A user's private address book, so a friend's email is typed once ever.
 *
 * Saving someone here grants them nothing: an invite is still sent and still
 * has to be accepted.
 *
 * Unique per owner on `lower(email)`, created in `0003_member_roles.sql` for the
 * same reason as `trip_invites`.
 */
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  /** Set when the address matches a real account, so the picker can say so. */
  contactUserId: integer("contactUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

/**
 * A family in somebody's address book.
 *
 * A saved label over `contacts`, not a copy of a trip's grouping: the people
 * you travel with keep being the same people, and retyping the five Patels for
 * every trip is the work this removes. It grants nothing — importing one into
 * a trip still sends invites that still have to be accepted.
 *
 * A case-insensitive unique index on `(ownerUserId, lower(name))` is created in
 * `0013_contact_groups.sql`. Drizzle cannot express a functional index, so that
 * migration is part of this table's definition — this file is not the whole
 * story.
 */
export const contactGroups = pgTable("contact_groups", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("ownerUserId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactGroup = typeof contactGroups.$inferSelect;
export type InsertContactGroup = typeof contactGroups.$inferInsert;

/**
 * Somebody in a saved family.
 *
 * `email` is nullable, and that is the point: a family is children and a dog as
 * much as it is two adults with accounts. A row with an address links to a
 * `contacts` row and becomes an invite on import; a row without one becomes a
 * `trip_attendees` row — counted in the headcount, no login, no vote.
 *
 * Two partial unique indexes in `0013_contact_groups.sql` — on `lower(email)`
 * where there is one, on `lower(name)` where there is not — are what make
 * saving the same family twice an append rather than a duplicate, under a
 * double-tap and not only when the code remembers to check.
 */
export const contactGroupMembers = pgTable("contact_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull(),
  /** The address-book row this is, when they have an email. */
  contactId: integer("contactId"),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  kind: attendeeKindEnum("kind").default("adult").notNull(),
  /** Years. Null for a pet, and for an adult who did not say. */
  age: integer("age"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactGroupMember = typeof contactGroupMembers.$inferSelect;
export type InsertContactGroupMember = typeof contactGroupMembers.$inferInsert;

/**
 * Everything members do to a trip, kept whether or not anything displays it.
 *
 * Deliberately not surfaced as a feed. Only a few of these reach a screen —
 * "added by X", "finalised by Y" — as quiet side information. The rest is here
 * so the trip has a history at all, and so a question asked later ("when did
 * this change?") has an answer.
 *
 * This is the fastest-growing table in the schema and has no retention policy
 * yet. That is a known and accepted gap, not an oversight.
 */
export const activityEvents = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  actorUserId: integer("actorUserId").notNull(),
  /** One of `ACTIVITY_ACTIONS` in `server/db.ts` — "<entity>.<verb>". */
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entityType", { length: 32 }),
  entityId: integer("entityId"),
  /** JSON, matching how `accommodations.matchAnalysis` is already stored. */
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;

/**
 * First-party product measurement for the beta.
 *
 * Separate from `activity_events` on purpose, and the reasons are in
 * `docs/adr/0024-first-party-product-measurement.md`. The short version:
 * the activity trail belongs to the trip and is deleted with it, which would
 * quietly remove abandoned trips from every funnel — exactly the trips a beta
 * most needs to count. And the trail carries member detail (an invite's email
 * address, a proposal's name) because it exists to be shown back to the group;
 * this table may not, so the columns give free text nowhere to go.
 *
 * `tripId` therefore outlives the trip it names and `actorUserId` may outlive
 * the account. Both are nullable: an event is worth recording even when it
 * belongs to neither. Nothing joins these back to `trips` or `users` — see the
 * runbook, `docs/runbooks/beta-metrics.md`.
 *
 * Deliberately not in `TRIP_OWNED_TABLES` in `server/db.ts`, which is the one
 * place that would otherwise sweep it up.
 */
export const productEvents = pgTable(
  "product_events",
  {
    id: serial("id").primaryKey(),
    /** One of `PRODUCT_EVENTS` in `shared/productEvents.ts`. */
    event: varchar("event", { length: 48 }).notNull(),
    /** Null for an event that is not about one trip. Not a foreign key. */
    tripId: integer("tripId"),
    /** Null where the actor is not the point, or is not known. Not a foreign key. */
    actorUserId: integer("actorUserId"),
    /**
     * JSON, and only ever the enums, booleans and counts that
     * `sanitiseProductEventMetadata` admits.
     */
    metadata: text("metadata"),
    /**
     * When the thing happened, which is also when the row was written — named
     * for the event rather than the row so the runbook's queries read as
     * measurement.
     */
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  t => [
    // Every query in the runbook is "this event, over this window".
    index("product_events_event_occurred_idx").on(t.event, t.occurredAt),
    // The funnels are per-trip: invites sent against invites accepted.
    index("product_events_trip_idx").on(t.tripId),
  ]
);

export type ProductEventRow = typeof productEvents.$inferSelect;
export type InsertProductEvent = typeof productEvents.$inferInsert;

/**
 * Date proposals — suggested date ranges for a trip.
 */
export const dateProposals = pgTable(
  "date_proposals",
  {
    id: serial("id").primaryKey(),
    tripId: integer("tripId").notNull(),
    proposedBy: integer("proposedBy").notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    label: varchar("label", { length: 255 }),
    /**
     * Finalised. Dates allow exactly one per trip; suggestions and accommodations
     * allow many — see `selectDateProposal` vs `setDestinationLock` in
     * `server/db.ts`, which is where that difference is enforced.
     */
    selected: boolean("selected").default(false).notNull(),
    lockedBy: integer("lockedBy"),
    lockedAt: timestamp("lockedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("date_proposals_trip_idx").on(t.tripId)]
);

export type DateProposal = typeof dateProposals.$inferSelect;
export type InsertDateProposal = typeof dateProposals.$inferInsert;

/**
 * Date votes — member availability votes on date proposals.
 */
export const dateVotes = pgTable(
  "date_votes",
  {
    id: serial("id").primaryKey(),
    proposalId: integer("proposalId").notNull(),
    userId: integer("userId").notNull(),
    vote: dateVoteEnum("vote").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    /**
     * When the vote last changed. `createdAt` records the first vote and is never
     * touched again, so it cannot answer "when did they decide this?" for anyone
     * who changed their mind.
     */
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  t => [index("date_votes_proposal_idx").on(t.proposalId)]
);

export type DateVote = typeof dateVotes.$inferSelect;
export type InsertDateVote = typeof dateVotes.$inferInsert;

/**
 * Suggestions — anything the group proposes and votes on.
 *
 * Still called `destinations` on the wire and in the database; the UI calls
 * the section "Suggestions". Renaming the table would cost a data migration
 * for no behaviour, so the two names live side by side deliberately.
 */
export const destinations = pgTable(
  "destinations",
  {
    id: serial("id").primaryKey(),
    tripId: integer("tripId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("imageUrl"),
    estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }),
    proposedBy: integer("proposedBy").notNull(),
    /** Finalised. A trip can finalise several suggestions. */
    selected: boolean("selected").default(false).notNull(),
    lockedBy: integer("lockedBy"),
    lockedAt: timestamp("lockedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("destinations_trip_idx").on(t.tripId)]
);

export type Destination = typeof destinations.$inferSelect;
export type InsertDestination = typeof destinations.$inferInsert;

/**
 * Destination votes — Love / Fine / Veto voting on destinations.
 */
export const destinationVotes = pgTable(
  "destination_votes",
  {
    id: serial("id").primaryKey(),
    destinationId: integer("destinationId").notNull(),
    userId: integer("userId").notNull(),
    vote: destinationVoteEnum("vote").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    /**
     * When the vote last changed. `createdAt` records the first vote and is never
     * touched again, so it cannot answer "when did they decide this?" for anyone
     * who changed their mind.
     */
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  t => [index("destination_votes_destination_idx").on(t.destinationId)]
);

export type DestinationVote = typeof destinationVotes.$inferSelect;
export type InsertDestinationVote = typeof destinationVotes.$inferInsert;

/**
 * Accommodations — options for the accommodation hub.
 */
export const accommodations = pgTable(
  "accommodations",
  {
    id: serial("id").primaryKey(),
    tripId: integer("tripId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    imageUrl: text("imageUrl"),
    pricePerNight: decimal("pricePerNight", { precision: 12, scale: 2 }),
    totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }),
    perPersonCost: decimal("perPersonCost", { precision: 12, scale: 2 }),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    singleBeds: integer("singleBeds"),
    doubleBeds: integer("doubleBeds"),
    toilets: integer("toilets"),
    ensuites: integer("ensuites"),
    freeParking: boolean("freeParking").default(false),
    camperParking: boolean("camperParking").default(false),
    amenities: text("amenities"),
    preferences: text("preferences"),
    location: varchar("location", { length: 500 }),
    link: text("link"),
    comfortScore: decimal("comfortScore", { precision: 3, scale: 1 }),
    matchAnalysis: text("matchAnalysis"),
    matchAnalysedAt: timestamp("matchAnalysedAt"),
    proposedBy: integer("proposedBy").notNull(),
    /** Finalised. A trip can finalise several accommodations. */
    selected: boolean("selected").default(false).notNull(),
    lockedBy: integer("lockedBy"),
    lockedAt: timestamp("lockedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("accommodations_trip_idx").on(t.tripId)]
);

export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = typeof accommodations.$inferInsert;

/**
 * Accommodation votes — Love / Fine / Veto voting on accommodations.
 */
export const accommodationVotes = pgTable(
  "accommodation_votes",
  {
    id: serial("id").primaryKey(),
    accommodationId: integer("accommodationId").notNull(),
    userId: integer("userId").notNull(),
    vote: accommodationVoteEnum("vote").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    /**
     * When the vote last changed. `createdAt` records the first vote and is never
     * touched again, so it cannot answer "when did they decide this?" for anyone
     * who changed their mind.
     */
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  t => [index("accommodation_votes_accommodation_idx").on(t.accommodationId)]
);

export type AccommodationVote = typeof accommodationVotes.$inferSelect;
export type InsertAccommodationVote = typeof accommodationVotes.$inferInsert;

/**
 * Budget proposals — how much this trip costs, argued the same way as
 * everything else.
 *
 * This replaced an append-only expense journal (`budget_items`), which recorded
 * what had been spent on a trip that had not happened and could not express the
 * question the group actually argues about. Shape follows `destinations`
 * deliberately: propose, vote, an admin finalises.
 *
 * `scope` says what `amount` means. **Exactly one budget is finalised at a
 * time** — budget follows dates, not places; see `setBudgetLock` in
 * `server/db.ts`.
 */
export const budgetProposals = pgTable("budget_proposals", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  proposedBy: integer("proposedBy").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  scope: budgetScopeEnum("scope").notNull(),
  /** Free text: what this figure is meant to cover. */
  covers: text("covers"),
  selected: boolean("selected").default(false).notNull(),
  lockedBy: integer("lockedBy"),
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BudgetProposal = typeof budgetProposals.$inferSelect;
export type InsertBudgetProposal = typeof budgetProposals.$inferInsert;

/**
 * Votes on a budget proposal. One row per member per proposal — and, when the
 * trip votes per group, at most one row per *group*, which is enforced on write
 * by `applyGroupVoteExclusivity` rather than by a column here.
 */
export const budgetVotes = pgTable("budget_votes", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposalId").notNull(),
  userId: integer("userId").notNull(),
  vote: budgetVoteEnum("vote").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** When the vote last changed; `createdAt` never moves. Same rule as `dateVotes`. */
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BudgetVote = typeof budgetVotes.$inferSelect;
export type InsertBudgetVote = typeof budgetVotes.$inferInsert;

/**
 * Referee messages — AI mediator messages for conflict resolution.
 */
export const refereeMessages = pgTable("referee_messages", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  phase: varchar("phase", { length: 50 }).notNull(),
  messageType: refereeMessageTypeEnum("messageType").notNull(),
  content: text("content").notNull(),
  context: text("context"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RefereeMessage = typeof refereeMessages.$inferSelect;
export type InsertRefereeMessage = typeof refereeMessages.$inferInsert;

/**
 * Notifications — alerts for users about trip events.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    tripId: integer("tripId"),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    read: boolean("read").default(false).notNull(),
    actionUrl: text("actionUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [index("notifications_user_read_idx").on(t.userId, t.read)]
);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Member preferences — structured requirements per member per trip.
 */
export const memberPreferences = pgTable("member_preferences", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  userId: integer("userId").notNull(),
  category: preferenceCategoryEnum("category").notNull(),
  rawText: text("rawText").notNull(),
  attributes: text("attributes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type MemberPreference = typeof memberPreferences.$inferSelect;
export type InsertMemberPreference = typeof memberPreferences.$inferInsert;

/**
 * A suggestion somebody turned down.
 *
 * My Preferences offers to turn what you wrote — a figure, a set of dates —
 * into a proposal the group can vote on. Accepting needs no row here: the
 * proposal's own fingerprint then matches and the suggestion stops being
 * offered. Declining leaves no trace at all without this, so the same card
 * would return every time you pressed Save.
 *
 * `kind` is a plain varchar rather than an enum on purpose. It is an internal
 * key, never rendered, and a new kind of suggestion should not need an
 * `ALTER TYPE` and a migration that cannot share a transaction.
 */
export const suggestionDismissals = pgTable("suggestion_dismissals", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  userId: integer("userId").notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  /** Stable identity of the suggestion — see `shared/suggestions.ts`. */
  fingerprint: varchar("fingerprint", { length: 200 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuggestionDismissal = typeof suggestionDismissals.$inferSelect;
export type InsertSuggestionDismissal =
  typeof suggestionDismissals.$inferInsert;

/**
 * Magic link tokens — short-lived tokens for passwordless login.
 */
export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;

/**
 * Passkeys (WebAuthn credentials) — one row per authenticator a user has
 * enrolled: Face ID / Touch ID on a phone or laptop, Windows Hello, a password
 * manager, or a hardware key.
 *
 * `publicKey` is a public value, not a secret: possession of it does not let
 * anyone sign an assertion. `counter` is the authenticator's signature counter,
 * kept so a cloned authenticator can be detected.
 */
export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  /** Base64url credential ID as produced by the authenticator. */
  credentialId: text("credentialId").notNull().unique(),
  /** Base64url COSE public key. */
  publicKey: text("publicKey").notNull(),
  counter: integer("counter").default(0).notNull(),
  /** Comma-separated transport hints ("internal,hybrid"); speeds up later prompts. */
  transports: text("transports"),
  /** "singleDevice" or "multiDevice" — whether the passkey syncs across devices. */
  deviceType: varchar("deviceType", { length: 32 }),
  backedUp: boolean("backedUp").default(false).notNull(),
  /** Human label shown in the UI, e.g. "iPhone" — derived from the user agent. */
  label: text("label"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
});

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type InsertWebauthnCredential = typeof webauthnCredentials.$inferInsert;

/**
 * In-flight WebAuthn challenges.
 *
 * A challenge must be issued by the server, used once and expire quickly, so it
 * cannot live in the client. `userId` is null for sign-in, where the account is
 * only known once the authenticator answers.
 */
export const webauthnChallenges = pgTable("webauthn_challenges", {
  id: serial("id").primaryKey(),
  /** Opaque handle the client echoes back; not the challenge itself. */
  challengeId: varchar("challengeId", { length: 64 }).notNull().unique(),
  challenge: text("challenge").notNull(),
  userId: integer("userId"),
  /** "registration" or "authentication" — a challenge is never valid for both. */
  purpose: varchar("purpose", { length: 32 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebauthnChallenge = typeof webauthnChallenges.$inferSelect;

/**
 * Accommodation attributes — structured attributes extracted from listings.
 */
export const accommodationAttributes = pgTable("accommodation_attributes", {
  id: serial("id").primaryKey(),
  accommodationId: integer("accommodationId").notNull(),
  attributes: text("attributes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AccommodationAttribute =
  typeof accommodationAttributes.$inferSelect;
export type InsertAccommodationAttribute =
  typeof accommodationAttributes.$inferInsert;

/**
 * Proposal comments — member comments on any proposal type.
 */
export const proposalComments = pgTable(
  "proposal_comments",
  {
    id: serial("id").primaryKey(),
    proposalType: proposalTypeEnum("proposalType").notNull(),
    proposalId: integer("proposalId").notNull(),
    tripId: integer("tripId").notNull(),
    userId: integer("userId").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    index("proposal_comments_lookup_idx").on(t.proposalType, t.proposalId),
    index("proposal_comments_trip_idx").on(t.tripId),
  ]
);

export type ProposalComment = typeof proposalComments.$inferSelect;
export type InsertProposalComment = typeof proposalComments.$inferInsert;

/**
 * What a piece of reported content is. Kept as an enum rather than a table
 * name, because `member` is not one: reporting a person is reporting the
 * account, not a row in any one trip's tables.
 */
export const reportedContentEnum = pgEnum("reported_content", [
  "comment",
  "proposal",
  "trip",
  "member",
]);

/**
 * Why something was reported. Apple's guideline 1.2 asks for a report
 * mechanism, not for a particular taxonomy; these are the categories a
 * moderator can actually act differently on.
 */
export const reportReasonEnum = pgEnum("report_reason", [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "open",
  "actioned",
  "dismissed",
]);

/**
 * Something a member reported, and what an admin did about it.
 *
 * Reports go to **app** admins — `users.role === "admin"`, what
 * `adminProcedure` checks — rather than to the trip's own admins. A trip admin
 * can already delete any comment on their trip, but reporting a trip admin to
 * that same trip admin is not a moderation path, and theirs is the behaviour
 * most worth being able to escalate.
 *
 * `tripId` is nullable because reporting an account is not reporting a trip.
 */
export const contentReports = pgTable(
  "content_reports",
  {
    id: serial("id").primaryKey(),
    reporterUserId: integer("reporterUserId").notNull(),
    /** Null when the report is about a person rather than something in a trip. */
    tripId: integer("tripId"),
    contentType: reportedContentEnum("contentType").notNull(),
    /** The comment, proposal, trip or user id, per `contentType`. */
    contentId: integer("contentId").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    note: varchar("note", { length: 500 }),
    status: reportStatusEnum("status").default("open").notNull(),
    reviewedByUserId: integer("reviewedByUserId"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    /** The queue: open reports, oldest first. */
    index("content_reports_status_idx").on(t.status, t.createdAt),
    /**
     * Reporting the same thing twice is one row, so a double-tap does not
     * inflate the queue — and so "how many people reported this" stays a
     * count of people rather than of taps.
     */
    uniqueIndex("content_reports_once_idx").on(
      t.reporterUserId,
      t.contentType,
      t.contentId
    ),
  ]
);

export type ContentReport = typeof contentReports.$inferSelect;
export type InsertContentReport = typeof contentReports.$inferInsert;

/**
 * One person choosing not to hear from another.
 *
 * Deliberately **not** mutual invisibility. Everyone in a trip shares it: a
 * blocked member keeps their place in the members list and their vote keeps
 * counting, because a trip somebody is legitimately on must not quietly lose a
 * voter, and a vote count that differed per viewer would be reported as data
 * loss rather than read as a block.
 *
 * What it does instead: their comments arrive collapsed, and they cannot invite
 * the blocker to a trip or add them to a contact book.
 */
export const userBlocks = pgTable(
  "user_blocks",
  {
    id: serial("id").primaryKey(),
    blockerUserId: integer("blockerUserId").notNull(),
    blockedUserId: integer("blockedUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => [
    uniqueIndex("user_blocks_pair_idx").on(t.blockerUserId, t.blockedUserId),
    /** "Who have I blocked?" — read on every thread the blocker opens. */
    index("user_blocks_blocker_idx").on(t.blockerUserId),
  ]
);

export type UserBlock = typeof userBlocks.$inferSelect;
export type InsertUserBlock = typeof userBlocks.$inferInsert;

/**
 * What a store reports about a subscription, narrowed to what this app acts on.
 *
 * `billing_issue` is deliberately separate from `expired`: the store is
 * retrying a card that will probably work, and it still entitles. See
 * `isEntitled` in `shared/billing.ts`.
 */
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "in_grace_period",
  "billing_issue",
  "expired",
]);

export const subscriptionStoreEnum = pgEnum("subscription_store", [
  "app_store",
  "play_store",
  /** RevenueCat's sandbox and its dashboard's manual grants. */
  "promotional",
]);

/**
 * One row per subscriber, written only by RevenueCat's webhook.
 *
 * **Never written from a client.** A purchase is a fact the store owns; this
 * table is a cache of what the store last told us, which is why every column
 * here comes from a webhook payload and none from a tRPC input. A client that
 * could write it could grant itself the product.
 *
 * Absent means free, which is also what an unconfigured deployment produces —
 * the gate fails closed.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    /** RevenueCat's identifier for this subscriber, for support lookups. */
    revenueCatId: varchar("revenueCatId", { length: 128 }),
    /** The store product, e.g. `btt_pro_monthly`. */
    productId: varchar("productId", { length: 128 }).notNull(),
    store: subscriptionStoreEnum("store").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    /**
     * When access lapses if nothing renews it. Null for a lifetime grant.
     * Checked as well as `status`, so a webhook we never received cannot keep
     * somebody entitled forever.
     */
    expiresAt: timestamp("expiresAt"),
    /** Set when the subscriber has asked the store not to renew. */
    cancelledAt: timestamp("cancelledAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  t => [
    /** One subscription per account: the webhook upserts on this. */
    uniqueIndex("subscriptions_user_idx").on(t.userId),
  ]
);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
