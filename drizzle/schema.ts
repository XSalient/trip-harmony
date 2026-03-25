import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  avatarUrl: text("avatarUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Travel DNA profiles — personality quiz results per user.
 */
export const travelDna = mysqlTable("travel_dna", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  budgetComfort: int("budgetComfort").notNull().default(5),       // 1-10 scale
  socialEnergy: int("socialEnergy").notNull().default(5),         // 1-10 introvert to extrovert
  adventureLevel: int("adventureLevel").notNull().default(5),     // 1-10 chill to extreme
  planningStyle: int("planningStyle").notNull().default(5),       // 1-10 spontaneous to structured
  culturalCuriosity: int("culturalCuriosity").notNull().default(5), // 1-10
  comfortNeed: int("comfortNeed").notNull().default(5),           // 1-10 backpacker to luxury
  foodPriority: int("foodPriority").notNull().default(5),         // 1-10
  activityPace: int("activityPace").notNull().default(5),         // 1-10 relaxed to packed
  dietaryNeeds: text("dietaryNeeds"),                             // JSON string array
  accessibilityNeeds: text("accessibilityNeeds"),                 // JSON string array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TravelDna = typeof travelDna.$inferSelect;
export type InsertTravelDna = typeof travelDna.$inferInsert;

/**
 * Trip groups — the core container for a trip.
 */
export const trips = mysqlTable("trips", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  coverImage: text("coverImage"),
  organizerId: int("organizerId").notNull(),
  inviteCode: varchar("inviteCode", { length: 32 }).notNull().unique(),
  phase: mysqlEnum("phase", ["setup", "dates", "destination", "accommodation", "activities", "finalized"]).default("setup").notNull(),
  status: mysqlEnum("status", ["planning", "active", "completed", "cancelled"]).default("planning").notNull(),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  totalBudget: decimal("totalBudget", { precision: 12, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Trip = typeof trips.$inferSelect;
export type InsertTrip = typeof trips.$inferInsert;

/**
 * Trip members — who is in each trip and their role.
 */
export const tripMembers = mysqlTable("trip_members", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["organizer", "member"]).default("member").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
  budgetMax: decimal("budgetMax", { precision: 12, scale: 2 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type TripMember = typeof tripMembers.$inferSelect;
export type InsertTripMember = typeof tripMembers.$inferInsert;

/**
 * Date proposals — suggested date ranges for a trip.
 */
export const dateProposals = mysqlTable("date_proposals", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  proposedBy: int("proposedBy").notNull(),
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
export const dateVotes = mysqlTable("date_votes", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  userId: int("userId").notNull(),
  vote: mysqlEnum("vote", ["available", "maybe", "unavailable"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DateVote = typeof dateVotes.$inferSelect;
export type InsertDateVote = typeof dateVotes.$inferInsert;

/**
 * Destinations — suggested destinations for vibe board.
 */
export const destinations = mysqlTable("destinations", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  vibes: text("vibes"),             // JSON array of vibe tags
  estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }),
  proposedBy: int("proposedBy").notNull(),
  selected: boolean("selected").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Destination = typeof destinations.$inferSelect;
export type InsertDestination = typeof destinations.$inferInsert;

/**
 * Destination votes — Love / Fine / Veto voting on destinations.
 */
export const destinationVotes = mysqlTable("destination_votes", {
  id: int("id").autoincrement().primaryKey(),
  destinationId: int("destinationId").notNull(),
  userId: int("userId").notNull(),
  vote: mysqlEnum("vote", ["love", "fine", "veto"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DestinationVote = typeof destinationVotes.$inferSelect;
export type InsertDestinationVote = typeof destinationVotes.$inferInsert;

/**
 * Accommodations — options for the accommodation hub.
 */
export const accommodations = mysqlTable("accommodations", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  pricePerNight: decimal("pricePerNight", { precision: 12, scale: 2 }),
  totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }),
  perPersonCost: decimal("perPersonCost", { precision: 12, scale: 2 }),
  bedrooms: int("bedrooms"),
  bathrooms: int("bathrooms"),
  singleBeds: int("singleBeds"),          // count of single/twin beds
  doubleBeds: int("doubleBeds"),          // count of double/queen/king beds
  toilets: int("toilets"),                // standalone toilets (no shower)
  ensuites: int("ensuites"),             // toilet + shower/bath combined in room
  freeParking: boolean("freeParking").default(false),
  camperParking: boolean("camperParking").default(false),
  amenities: text("amenities"),          // JSON array of amenity strings
  preferences: text("preferences"),      // JSON object for AI-mapped attributes
  location: varchar("location", { length: 500 }),
  link: text("link"),
  comfortScore: decimal("comfortScore", { precision: 3, scale: 1 }),
  proposedBy: int("proposedBy").notNull(),
  selected: boolean("selected").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Accommodation = typeof accommodations.$inferSelect;
export type InsertAccommodation = typeof accommodations.$inferInsert;

/**
 * Accommodation votes — Love / Fine / Veto voting on accommodations.
 */
export const accommodationVotes = mysqlTable("accommodation_votes", {
  id: int("id").autoincrement().primaryKey(),
  accommodationId: int("accommodationId").notNull(),
  userId: int("userId").notNull(),
  vote: mysqlEnum("vote", ["love", "fine", "veto"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccommodationVote = typeof accommodationVotes.$inferSelect;
export type InsertAccommodationVote = typeof accommodationVotes.$inferInsert;

/**
 * Budget items — individual expenses tracked per trip.
 */
export const budgetItems = mysqlTable("budget_items", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  category: mysqlEnum("category", ["accommodation", "transport", "food", "activities", "other"]).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  paidBy: int("paidBy"),
  splitType: mysqlEnum("splitType", ["equal", "custom"]).default("equal").notNull(),
  approved: boolean("approved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BudgetItem = typeof budgetItems.$inferSelect;
export type InsertBudgetItem = typeof budgetItems.$inferInsert;

/**
 * Referee messages — AI mediator messages for conflict resolution.
 */
export const refereeMessages = mysqlTable("referee_messages", {
  id: int("id").autoincrement().primaryKey(),
  tripId: int("tripId").notNull(),
  phase: varchar("phase", { length: 50 }).notNull(),
  messageType: mysqlEnum("messageType", ["nudge", "mediation", "compromise", "celebration", "summary"]).notNull(),
  content: text("content").notNull(),
  context: text("context"),           // JSON with relevant data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RefereeMessage = typeof refereeMessages.$inferSelect;
export type InsertRefereeMessage = typeof refereeMessages.$inferInsert;

/**
 * Notifications — alerts for users about trip events.
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tripId: int("tripId"),
  type: mysqlEnum("type", ["invite", "vote_request", "budget_alert", "consensus", "phase_change", "referee", "general"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  actionUrl: text("actionUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
