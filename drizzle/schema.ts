import {
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
/** How someone came to be on the trip — a shared link, an emailed invite, or creating it. */
export const joinedViaEnum = pgEnum("joined_via", ["creator", "link", "email"]);
export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
]);
export const dateVoteEnum = pgEnum("date_vote", [
  "available",
  "maybe",
  "unavailable",
]);
export const destinationVoteEnum = pgEnum("destination_vote", [
  "love",
  "fine",
  "veto",
]);
export const accommodationVoteEnum = pgEnum("accommodation_vote", [
  "love",
  "fine",
  "veto",
]);
export const budgetCategoryEnum = pgEnum("budget_category", [
  "accommodation",
  "transport",
  "food",
  "activities",
  "other",
]);
export const splitTypeEnum = pgEnum("split_type", ["equal", "custom"]);
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

/**
 * Trip members — who is in each trip and their role.
 */
export const tripMembers = pgTable("trip_members", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  userId: integer("userId").notNull(),
  role: memberRoleEnum("role").default("tripmate").notNull(),
  status: memberStatusEnum("status").default("pending").notNull(),
  budgetMax: decimal("budgetMax", { precision: 12, scale: 2 }),
  /** Who invited them, when it is known. Null for the creator and for pre-invite rows. */
  invitedBy: integer("invitedBy"),
  joinedVia: joinedViaEnum("joinedVia"),
  /** When they accepted or declined — distinct from `joinedAt`, which is when the row appeared. */
  respondedAt: timestamp("respondedAt"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

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
 * Date proposals — suggested date ranges for a trip.
 */
export const dateProposals = pgTable("date_proposals", {
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
});

export type DateProposal = typeof dateProposals.$inferSelect;
export type InsertDateProposal = typeof dateProposals.$inferInsert;

/**
 * Date votes — member availability votes on date proposals.
 */
export const dateVotes = pgTable("date_votes", {
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
});

export type DateVote = typeof dateVotes.$inferSelect;
export type InsertDateVote = typeof dateVotes.$inferInsert;

/**
 * Suggestions — anything the group proposes and votes on.
 *
 * Still called `destinations` on the wire and in the database; the UI calls
 * the section "Suggestions". Renaming the table would cost a data migration
 * for no behaviour, so the two names live side by side deliberately.
 */
export const destinations = pgTable("destinations", {
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
});

export type Destination = typeof destinations.$inferSelect;
export type InsertDestination = typeof destinations.$inferInsert;

/**
 * Destination votes — Love / Fine / Veto voting on destinations.
 */
export const destinationVotes = pgTable("destination_votes", {
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
});

export type DestinationVote = typeof destinationVotes.$inferSelect;
export type InsertDestinationVote = typeof destinationVotes.$inferInsert;

/**
 * Accommodations — options for the accommodation hub.
 */
export const accommodations = pgTable("accommodations", {
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
});

export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = typeof accommodations.$inferInsert;

/**
 * Accommodation votes — Love / Fine / Veto voting on accommodations.
 */
export const accommodationVotes = pgTable("accommodation_votes", {
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
});

export type AccommodationVote = typeof accommodationVotes.$inferSelect;
export type InsertAccommodationVote = typeof accommodationVotes.$inferInsert;

/**
 * Budget items — individual expenses tracked per trip.
 */
export const budgetItems = pgTable("budget_items", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  category: budgetCategoryEnum("category").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  paidBy: integer("paidBy"),
  splitType: splitTypeEnum("splitType").default("equal").notNull(),
  approved: boolean("approved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

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
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  tripId: integer("tripId"),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  actionUrl: text("actionUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
export const proposalComments = pgTable("proposal_comments", {
  id: serial("id").primaryKey(),
  proposalType: proposalTypeEnum("proposalType").notNull(),
  proposalId: integer("proposalId").notNull(),
  tripId: integer("tripId").notNull(),
  userId: integer("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProposalComment = typeof proposalComments.$inferSelect;
export type InsertProposalComment = typeof proposalComments.$inferInsert;
