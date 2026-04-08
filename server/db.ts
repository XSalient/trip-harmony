import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertUser, users,
  travelDna, InsertTravelDna,
  trips, InsertTrip,
  tripMembers, InsertTripMember,
  dateProposals, InsertDateProposal,
  dateVotes, InsertDateVote,
  destinations, InsertDestination,
  destinationVotes, InsertDestinationVote,
  accommodations, InsertAccommodation,
  accommodationVotes, InsertAccommodationVote,
  budgetItems, InsertBudgetItem,
  refereeMessages, InsertRefereeMessage,
  notifications, InsertNotification,
  magicLinkTokens,
  proposalComments, InsertProposalComment,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithPassword(data: { openId: string; name: string; email: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(users).values({ ...data, loginMethod: "email", lastSignedIn: new Date() });
  const result = await db.select().from(users).where(eq(users.openId, data.openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Magic Link Tokens ----
export async function createMagicLinkToken(email: string, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(magicLinkTokens).where(
    and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.used, false))
  );
  await db.insert(magicLinkTokens).values({ token, email, expiresAt });
}

export async function consumeMagicLinkToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const [row] = await db.select().from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.token, token), eq(magicLinkTokens.used, false)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt < now) return null;
  await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, row.id));
  return row;
}

// ---- Travel DNA ----
export async function upsertTravelDna(data: InsertTravelDna) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(travelDna).where(eq(travelDna.userId, data.userId)).limit(1);
  if (existing.length > 0) {
    await db.update(travelDna).set(data).where(eq(travelDna.userId, data.userId));
    return { ...existing[0], ...data };
  }
  const [result] = await db.insert(travelDna).values(data).returning({ id: travelDna.id });
  return { id: result.id, ...data };
}

export async function getTravelDna(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(travelDna).where(eq(travelDna.userId, userId)).limit(1);
  return result[0] || null;
}

export async function getGroupTravelDna(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db.select().from(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.status, "accepted")));
  const userIds = members.map(m => m.userId);
  if (userIds.length === 0) return [];
  const results = [];
  for (const uid of userIds) {
    const dna = await db.select().from(travelDna).where(eq(travelDna.userId, uid)).limit(1);
    if (dna[0]) results.push(dna[0]);
  }
  return results;
}

// ---- Trips ----
export async function createTrip(data: InsertTrip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(trips).values(data).returning({ id: trips.id });
  return result.id;
}

export async function getTrip(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
  return result[0] || null;
}

export async function getTripByInviteCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(trips).where(eq(trips.inviteCode, code)).limit(1);
  return result[0] || null;
}

export async function updateTrip(id: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(trips).set(data).where(eq(trips.id, id));
}

export async function getUserTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(tripMembers).where(eq(tripMembers.userId, userId));
  const tripIds = memberships.map(m => m.tripId);
  if (tripIds.length === 0) return [];
  const results = [];
  for (const tid of tripIds) {
    const trip = await db.select().from(trips).where(eq(trips.id, tid)).limit(1);
    if (trip[0]) results.push({ ...trip[0], memberRole: memberships.find(m => m.tripId === tid)?.role, memberStatus: memberships.find(m => m.tripId === tid)?.status });
  }
  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---- Trip Members ----
export async function addTripMember(data: InsertTripMember) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(tripMembers).where(and(eq(tripMembers.tripId, data.tripId), eq(tripMembers.userId, data.userId))).limit(1);
  if (existing.length > 0) return existing[0];
  const [result] = await db.insert(tripMembers).values(data).returning({ id: tripMembers.id });
  return { id: result.id, ...data };
}

export async function updateMemberStatus(tripId: number, userId: number, status: "pending" | "accepted" | "declined") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tripMembers).set({ status }).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

export async function getTripMember(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(tripMembers).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId))).limit(1);
  return row;
}

export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db.select().from(tripMembers).where(eq(tripMembers.tripId, tripId));
  const enriched = [];
  for (const m of members) {
    const user = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, m.userId)).limit(1);
    enriched.push({ ...m, user: user[0] || null });
  }
  return enriched;
}

export async function updateMemberBudget(tripId: number, userId: number, budgetMax: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tripMembers).set({ budgetMax }).where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

// ---- Date Proposals ----
export async function createDateProposal(data: InsertDateProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(dateProposals).values(data).returning({ id: dateProposals.id });
  return result.id;
}

export async function getDateProposals(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const proposals = await db.select().from(dateProposals).where(eq(dateProposals.tripId, tripId)).orderBy(dateProposals.startDate);
  const enriched = [];
  for (const p of proposals) {
    const votes = await db.select().from(dateVotes).where(eq(dateVotes.proposalId, p.id));
    const enrichedVotes = [];
    for (const v of votes) {
      const user = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, v.userId)).limit(1);
      enrichedVotes.push({ ...v, user: user[0] || null });
    }
    enriched.push({ ...p, votes: enrichedVotes });
  }
  return enriched;
}

export async function selectDateProposal(tripId: number, proposalId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dateProposals).set({ selected: false }).where(eq(dateProposals.tripId, tripId));
  await db.update(dateProposals).set({ selected: true }).where(eq(dateProposals.id, proposalId));
}

export async function deselectDateProposals(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dateProposals).set({ selected: false }).where(eq(dateProposals.tripId, tripId));
}

export async function deleteDateProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dateVotes).where(eq(dateVotes.proposalId, id));
  await db.delete(dateProposals).where(eq(dateProposals.id, id));
}

export async function getDateProposal(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dateProposals).where(eq(dateProposals.id, id)).limit(1);
  return result[0] || null;
}

export async function voteDateProposal(data: InsertDateVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(dateVotes).where(and(eq(dateVotes.proposalId, data.proposalId), eq(dateVotes.userId, data.userId))).limit(1);
  if (existing.length > 0) {
    await db.update(dateVotes).set({ vote: data.vote }).where(eq(dateVotes.id, existing[0].id));
    return;
  }
  await db.insert(dateVotes).values(data);
}

// ---- Destinations ----
export async function createDestination(data: InsertDestination) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(destinations).values(data).returning({ id: destinations.id });
  return result.id;
}

export async function getDestinations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const dests = await db.select().from(destinations).where(eq(destinations.tripId, tripId)).orderBy(desc(destinations.createdAt));
  const enriched = [];
  for (const d of dests) {
    const votes = await db.select().from(destinationVotes).where(eq(destinationVotes.destinationId, d.id));
    const enrichedVotes = [];
    for (const v of votes) {
      const user = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, v.userId)).limit(1);
      enrichedVotes.push({ ...v, user: user[0] || null });
    }
    enriched.push({ ...d, votes: enrichedVotes });
  }
  return enriched;
}

export async function voteDestination(data: InsertDestinationVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(destinationVotes).where(and(eq(destinationVotes.destinationId, data.destinationId), eq(destinationVotes.userId, data.userId))).limit(1);
  if (existing.length > 0) {
    await db.update(destinationVotes).set({ vote: data.vote }).where(eq(destinationVotes.id, existing[0].id));
    return;
  }
  await db.insert(destinationVotes).values(data);
}

export async function selectDestination(tripId: number, destinationId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(destinations).set({ selected: false }).where(eq(destinations.tripId, tripId));
  await db.update(destinations).set({ selected: true }).where(eq(destinations.id, destinationId));
}

export async function deselectDestinations(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(destinations).set({ selected: false }).where(eq(destinations.tripId, tripId));
}

export async function deleteDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(destinationVotes).where(eq(destinationVotes.destinationId, id));
  await db.delete(destinations).where(eq(destinations.id, id));
}

export async function getDestination(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(destinations).where(eq(destinations.id, id)).limit(1);
  return result[0] || null;
}

// ---- Accommodations ----
export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(accommodations).values(data).returning({ id: accommodations.id });
  return result.id;
}

export async function getAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const accs = await db.select().from(accommodations).where(eq(accommodations.tripId, tripId)).orderBy(desc(accommodations.createdAt));
  const enriched = [];
  for (const a of accs) {
    const votes = await db.select().from(accommodationVotes).where(eq(accommodationVotes.accommodationId, a.id));
    const enrichedVotes = [];
    for (const v of votes) {
      const user = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, v.userId)).limit(1);
      enrichedVotes.push({ ...v, user: user[0] || null });
    }
    enriched.push({ ...a, votes: enrichedVotes });
  }
  return enriched;
}

export async function voteAccommodation(data: InsertAccommodationVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db.select().from(accommodationVotes).where(and(eq(accommodationVotes.accommodationId, data.accommodationId), eq(accommodationVotes.userId, data.userId))).limit(1);
  if (existing.length > 0) {
    await db.update(accommodationVotes).set({ vote: data.vote }).where(eq(accommodationVotes.id, existing[0].id));
    return;
  }
  await db.insert(accommodationVotes).values(data);
}

export async function selectAccommodation(tripId: number, accommodationId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set({ selected: false }).where(eq(accommodations.tripId, tripId));
  await db.update(accommodations).set({ selected: true }).where(eq(accommodations.id, accommodationId));
}

export async function deselectAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set({ selected: false }).where(eq(accommodations.tripId, tripId));
}

export async function deleteAccommodation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(accommodationVotes).where(eq(accommodationVotes.accommodationId, id));
  await db.delete(accommodations).where(eq(accommodations.id, id));
}

export async function getAccommodation(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(accommodations).where(eq(accommodations.id, id)).limit(1);
  return result[0] || null;
}

// ---- Budget Items ----
export async function createBudgetItem(data: InsertBudgetItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(budgetItems).values(data).returning({ id: budgetItems.id });
  return result.id;
}

export async function getBudgetItems(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetItems).where(eq(budgetItems.tripId, tripId)).orderBy(desc(budgetItems.createdAt));
}

export async function updateBudgetItem(id: number, data: Partial<InsertBudgetItem>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(budgetItems).set(data).where(eq(budgetItems.id, id));
}

export async function deleteBudgetItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(budgetItems).where(eq(budgetItems.id, id));
}

// ---- Referee Messages ----
export async function createRefereeMessage(data: InsertRefereeMessage) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(refereeMessages).values(data).returning({ id: refereeMessages.id });
  return result.id;
}

export async function getRefereeMessages(tripId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(refereeMessages).where(eq(refereeMessages.tripId, tripId)).orderBy(desc(refereeMessages.createdAt)).limit(limit);
}

// ---- Notifications ----
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(notifications).values(data).returning({ id: notifications.id });
  return result.id;
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return result[0]?.count || 0;
}

// ---- Update proposals (edit) ----
export async function updateDateProposal(id: number, data: { label?: string; startDate?: Date; endDate?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dateProposals).set(data).where(eq(dateProposals.id, id));
}

export async function updateDestination(id: number, data: Partial<InsertDestination>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(destinations).set(data).where(eq(destinations.id, id));
}

export async function updateAccommodation(id: number, data: Partial<InsertAccommodation>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set(data).where(eq(accommodations.id, id));
}

// ---- Check trip organizer ----
export async function isTripOrganizer(tripId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const trip = await db.select({ organizerId: trips.organizerId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  return trip[0]?.organizerId === userId;
}

// ---- Proposal Comments ----
export async function createComment(data: InsertProposalComment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(proposalComments).values(data).returning({ id: proposalComments.id });
  return result.id;
}

export async function getComments(proposalType: "date" | "destination" | "accommodation", proposalId: number) {
  const db = await getDb();
  if (!db) return [];
  const comments = await db
    .select()
    .from(proposalComments)
    .where(and(eq(proposalComments.proposalType, proposalType), eq(proposalComments.proposalId, proposalId)))
    .orderBy(proposalComments.createdAt);
  const enriched = [];
  for (const c of comments) {
    const user = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, c.userId)).limit(1);
    enriched.push({ ...c, user: user[0] || null });
  }
  return enriched;
}

export async function deleteComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(proposalComments).where(eq(proposalComments.id, id));
}

export async function getComment(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(proposalComments).where(eq(proposalComments.id, id)).limit(1);
  return row || null;
}
