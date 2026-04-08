import { pgEnum, pgTable, serial, text, timestamp, varchar, integer, boolean, decimal } from "drizzle-orm/pg-core";
export const proposalTypeEnum = pgEnum("proposal_type", ["date", "destination", "accommodation"]);

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const tripPhaseEnum = pgEnum("trip_phase", ["setup", "dates", "destination", "accommodation", "activities", "finalized"]);
export const tripStatusEnum = pgEnum("trip_status", ["planning", "active", "completed", "cancelled"]);
export const memberRoleEnum = pgEnum("member_role", ["organizer", "member"]);
export const memberStatusEnum = pgEnum("member_status", ["pending", "accepted", "declined"]);
export const dateVoteEnum = pgEnum("date_vote", ["available", "maybe", "unavailable"]);
export const destinationVoteEnum = pgEnum("destination_vote", ["love", "fine", "veto"]);
export const accommodationVoteEnum = pgEnum("accommodation_vote", ["love", "fine", "veto"]);
export const budgetCategoryEnum = pgEnum("budget_category", ["accommodation", "transport", "food", "activities", "other"]);
export const splitTypeEnum = pgEnum("split_type", ["equal", "custom"]);
export const refereeMessageTypeEnum = pgEnum("referee_message_type", ["nudge", "mediation", "compromise", "celebration", "summary"]);
export const notificationTypeEnum = pgEnum("notification_type", ["invite", "vote_request", "budget_alert", "consensus", "phase_change", "referee", "general"]);
export const preferenceCategoryEnum = pgEnum("preference_category", ["accommodation", "destination", "dates", "general"]);

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
 * Travel DNA profiles — personality quiz results per user.
 */
export const travelDna = pgTable("travel_dna", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  budgetComfort: integer("budgetComfort").notNull().default(5),
  socialEnergy: integer("socialEnergy").notNull().default(5),
  adventureLevel: integer("adventureLevel").notNull().default(5),
  planningStyle: integer("planningStyle").notNull().default(5),
  culturalCuriosity: integer("culturalCuriosity").notNull().default(5),
  comfortNeed: integer("comfortNeed").notNull().default(5),
  foodPriority: integer("foodPriority").notNull().default(5),
  activityPace: integer("activityPace").notNull().default(5),
  dietaryNeeds: text("dietaryNeeds"),
  accessibilityNeeds: text("accessibilityNeeds"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TravelDna = typeof travelDna.$inferSelect;
export type InsertTravelDna = typeof travelDna.$inferInsert;

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
  role: memberRoleEnum("role").default("member").notNull(),
  status: memberStatusEnum("status").default("pending").notNull(),
  budgetMax: decimal("budgetMax", { precision: 12, scale: 2 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

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
  selected: boolean("selected").default(false).notNull(),
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
});

export type DateVote = typeof dateVotes.$inferSelect;
export type InsertDateVote = typeof dateVotes.$inferInsert;

/**
 * Destinations — suggested destinations for vibe board.
 */
export const destinations = pgTable("destinations", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  vibes: text("vibes"),
  estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }),
  proposedBy: integer("proposedBy").notNull(),
  selected: boolean("selected").default(false).notNull(),
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
  proposedBy: integer("proposedBy").notNull(),
  selected: boolean("selected").default(false).notNull(),
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
 * Accommodation attributes — structured attributes extracted from listings.
 */
export const accommodationAttributes = pgTable("accommodation_attributes", {
  id: serial("id").primaryKey(),
  accommodationId: integer("accommodationId").notNull(),
  attributes: text("attributes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AccommodationAttribute = typeof accommodationAttributes.$inferSelect;
export type InsertAccommodationAttribute = typeof accommodationAttributes.$inferInsert;

/**
 * Vibe board items — inspiration links shared by group members.
 */
export const vibeItems = pgTable("vibe_items", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  proposedBy: integer("proposedBy").notNull(),
  url: text("url"),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  tags: text("tags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VibeItem = typeof vibeItems.$inferSelect;
export type InsertVibeItem = typeof vibeItems.$inferInsert;

export const vibeVoteEnum = pgEnum("vibe_vote", ["love", "fine", "veto"]);

export const vibeVotes = pgTable("vibe_votes", {
  id: serial("id").primaryKey(),
  vibeItemId: integer("vibeItemId").notNull(),
  userId: integer("userId").notNull(),
  vote: vibeVoteEnum("vote").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VibeVote = typeof vibeVotes.$inferSelect;
export type InsertVibeVote = typeof vibeVotes.$inferInsert;

/**
 * Itinerary days — daily plan entries for a trip.
 */
export const itineraryDays = pgTable("itinerary_days", {
  id: serial("id").primaryKey(),
  tripId: integer("tripId").notNull(),
  date: text("date").notNull(),
  title: text("title"),
  notes: text("notes"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItineraryDay = typeof itineraryDays.$inferSelect;
export type InsertItineraryDay = typeof itineraryDays.$inferInsert;

export const itineraryItemTypeEnum = pgEnum("itinerary_item_type", ["activity", "food", "transport", "accommodation", "free", "other"]);

export const itineraryItems = pgTable("itinerary_items", {
  id: serial("id").primaryKey(),
  dayId: integer("dayId").notNull(),
  tripId: integer("tripId").notNull(),
  time: text("time"),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  type: itineraryItemTypeEnum("type").default("other").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  link: text("link"),
  addedBy: integer("addedBy").notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ItineraryItem = typeof itineraryItems.$inferSelect;
export type InsertItineraryItem = typeof itineraryItems.$inferInsert;

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
