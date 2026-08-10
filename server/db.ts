import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  InsertUser,
  users,
  trips,
  InsertTrip,
  tripMembers,
  InsertTripMember,
  dateProposals,
  InsertDateProposal,
  dateVotes,
  InsertDateVote,
  destinations,
  InsertDestination,
  destinationVotes,
  InsertDestinationVote,
  accommodations,
  InsertAccommodation,
  accommodationVotes,
  InsertAccommodationVote,
  budgetItems,
  InsertBudgetItem,
  refereeMessages,
  InsertRefereeMessage,
  notifications,
  InsertNotification,
  magicLinkTokens,
  proposalComments,
  InsertProposalComment,
  vibeItems,
  InsertVibeItem,
  vibeVotes,
  InsertVibeVote,
  itineraryDays,
  InsertItineraryDay,
  itineraryItems,
  InsertItineraryItem,
  memberPreferences,
  webauthnCredentials,
  InsertWebauthnCredential,
  webauthnChallenges,
  tripInvites,
  InsertTripInvite,
  contacts,
  InsertContact,
  activityEvents,
  accommodationAttributes,
} from "../drizzle/schema.js";
import type { TripRole } from "../shared/roles.js";
import { config, ENV } from "./_core/env.js";
import { logger } from "./_core/logger.js";

const log = logger.child({ scope: "db" });

let _db: ReturnType<typeof drizzle> | null = null;

/** Give up on an unreachable database instead of waiting forever (pg defaults to no timeout). */
const CONNECTION_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 15_000;

function isLocalUrl(url: string) {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url);
}

/**
 * Managed Postgres providers (Supabase included) present a certificate chain
 * that is not in Node's default trust store, and recent pg-connection-string
 * promotes `sslmode=require` to `verify-full` — so the connection fails with
 * SELF_SIGNED_CERT_IN_CHAIN.
 *
 * This has to be fixed in the connection string rather than the `ssl` pool
 * option: pg builds its config as Object.assign({}, config, parse(connectionString)),
 * so anything parsed out of the string overwrites the explicit option. Edit the
 * parameter textually to avoid re-encoding credentials through the URL parser.
 */
function withRelaxedSsl(url: string) {
  if (isLocalUrl(url)) return url;
  if (/[?&]sslmode=disable\b/i.test(url)) return url;
  if (/[?&]sslmode=/i.test(url)) {
    return url.replace(/([?&]sslmode=)[^&]*/i, "$1no-verify");
  }
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=no-verify`;
}

/**
 * Lazily creates the pooled Drizzle client.
 *
 * Returns `null` when no connection string is configured so the app still boots
 * for frontend-only work and for tests; every caller must handle the null case.
 * Which variable the URL came from is resolved in `_core/env.ts`.
 */
export async function getDb() {
  if (!_db) {
    if (!config.db.isConfigured) {
      log.error("no usable Postgres connection string configured", {
        ignored: config.db.rejected.length ? config.db.rejected : undefined,
      });
      return null;
    }
    try {
      log.info("connecting to database", { source: config.db.source });
      const pool = new Pool({
        connectionString: withRelaxedSsl(config.db.url),
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS,
        idleTimeoutMillis: 30_000,
      });
      // Without a listener an idle-client error crashes the process.
      pool.on("error", err => log.error("idle client error", { err }));
      _db = drizzle(pool);
    } catch (error) {
      log.error("failed to create connection pool", { err: error });
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    log.warn("cannot upsert user: database not configured");
    return;
  }
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
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0)
      updateSet.lastSignedIn = new Date();
    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    log.error("failed to upsert user", { err: error });
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithPassword(data: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(users)
    .values({ ...data, loginMethod: "email", lastSignedIn: new Date() });
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, data.openId))
    .limit(1);
  return result[0];
}

export async function setUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Magic Link Tokens ----
export async function createMagicLinkToken(
  email: string,
  token: string,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(magicLinkTokens)
    .where(
      and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.used, false))
    );
  await db.insert(magicLinkTokens).values({ token, email, expiresAt });
}

export async function consumeMagicLinkToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();
  const [row] = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(eq(magicLinkTokens.token, token), eq(magicLinkTokens.used, false))
    )
    .limit(1);
  if (!row) return null;
  if (row.expiresAt < now) return null;
  await db
    .update(magicLinkTokens)
    .set({ used: true })
    .where(eq(magicLinkTokens.id, row.id));
  return row;
}

// ---- Passkeys (WebAuthn) ----
export async function createWebauthnChallenge(data: {
  challengeId: string;
  challenge: string;
  userId: number | null;
  purpose: "registration" | "authentication";
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(webauthnChallenges).values(data);
}

/**
 * Returns the challenge only once: a replayed response finds it already used.
 * The purpose is part of the lookup so a registration challenge can never be
 * spent as a sign-in one.
 */
export async function consumeWebauthnChallenge(
  challengeId: string,
  purpose: "registration" | "authentication"
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .select()
    .from(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.challengeId, challengeId),
        eq(webauthnChallenges.purpose, purpose),
        eq(webauthnChallenges.used, false)
      )
    )
    .limit(1);
  if (!row) return null;
  await db
    .update(webauthnChallenges)
    .set({ used: true })
    .where(eq(webauthnChallenges.id, row.id));
  if (row.expiresAt < new Date()) return null;
  return row;
}

/** Housekeeping so spent and expired challenges do not accumulate forever. */
export async function deleteExpiredWebauthnChallenges() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(webauthnChallenges)
    .where(sql`${webauthnChallenges.expiresAt} < now()`);
}

export async function createWebauthnCredential(data: InsertWebauthnCredential) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .insert(webauthnCredentials)
    .values(data)
    .returning({ id: webauthnCredentials.id });
  return row;
}

export async function getWebauthnCredentialsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, userId))
    .orderBy(desc(webauthnCredentials.createdAt));
}

export async function getWebauthnCredentialById(credentialId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, credentialId))
    .limit(1);
  return result[0];
}

export async function touchWebauthnCredential(id: number, counter: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(webauthnCredentials)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, id));
}

export async function renameWebauthnCredential(
  id: number,
  userId: number,
  label: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .update(webauthnCredentials)
    .set({ label })
    .where(
      and(
        eq(webauthnCredentials.id, id),
        eq(webauthnCredentials.userId, userId)
      )
    )
    .returning({ id: webauthnCredentials.id });
  return result.length > 0;
}

/** Scoped by user so one account can never delete another's passkey. */
export async function deleteWebauthnCredential(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .delete(webauthnCredentials)
    .where(
      and(
        eq(webauthnCredentials.id, id),
        eq(webauthnCredentials.userId, userId)
      )
    )
    .returning({ id: webauthnCredentials.id });
  return result.length > 0;
}

// ---- Trips ----
export async function createTrip(data: InsertTrip) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(trips)
    .values(data)
    .returning({ id: trips.id });
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
  const result = await db
    .select()
    .from(trips)
    .where(eq(trips.inviteCode, code))
    .limit(1);
  return result[0] || null;
}

export async function updateTrip(id: number, data: Partial<InsertTrip>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(trips).set(data).where(eq(trips.id, id));
}

/**
 * Everything a trip owns, in the order it has to go.
 *
 * The schema declares no foreign keys — every `tripId` is a plain integer — so
 * nothing is cascaded for us and a table left out here becomes a row that
 * outlives its trip and is reachable by nobody. The vote and attribute tables
 * are the awkward ones: they key off a *proposal* id, not a trip id, so they
 * have to be collected from the proposals first and deleted before the
 * proposals themselves are gone and the ids with them.
 *
 * Kept beside the schema deliberately: a new trip-scoped table means a line
 * here, and `new-features.test.ts` asserts that this list still covers the
 * schema so the next one cannot be forgotten quietly.
 */
export const TRIP_OWNED_TABLES = [
  "trip_members",
  "trip_invites",
  "activity_events",
  "date_proposals",
  "destinations",
  "accommodations",
  "budget_items",
  "referee_messages",
  "notifications",
  "member_preferences",
  "vibe_items",
  "itinerary_days",
  "itinerary_items",
  "proposal_comments",
] as const;

/**
 * Deletes a trip and everything hanging off it, in one transaction.
 *
 * All-or-nothing on purpose: a half-deleted trip is worse than one that is
 * still there, because the members page would keep listing people whose
 * proposals had already gone.
 */
export async function deleteTripCascade(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db.transaction(async tx => {
    // Child rows keyed by proposal, not by trip. Collected before their
    // parents are deleted, or there is nothing left to match them against.
    const [dateIds, destIds, accIds, vibeIds] = await Promise.all([
      tx
        .select({ id: dateProposals.id })
        .from(dateProposals)
        .where(eq(dateProposals.tripId, tripId)),
      tx
        .select({ id: destinations.id })
        .from(destinations)
        .where(eq(destinations.tripId, tripId)),
      tx
        .select({ id: accommodations.id })
        .from(accommodations)
        .where(eq(accommodations.tripId, tripId)),
      tx
        .select({ id: vibeItems.id })
        .from(vibeItems)
        .where(eq(vibeItems.tripId, tripId)),
    ]);

    const ids = (rows: { id: number }[]) => rows.map(r => r.id);
    if (dateIds.length)
      await tx
        .delete(dateVotes)
        .where(inArray(dateVotes.proposalId, ids(dateIds)));
    if (destIds.length)
      await tx
        .delete(destinationVotes)
        .where(inArray(destinationVotes.destinationId, ids(destIds)));
    if (accIds.length) {
      await tx
        .delete(accommodationVotes)
        .where(inArray(accommodationVotes.accommodationId, ids(accIds)));
      await tx
        .delete(accommodationAttributes)
        .where(inArray(accommodationAttributes.accommodationId, ids(accIds)));
    }
    if (vibeIds.length)
      await tx
        .delete(vibeVotes)
        .where(inArray(vibeVotes.vibeItemId, ids(vibeIds)));

    // Then everything that names the trip directly.
    await tx.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    await tx.delete(itineraryDays).where(eq(itineraryDays.tripId, tripId));
    await tx
      .delete(proposalComments)
      .where(eq(proposalComments.tripId, tripId));
    await tx.delete(vibeItems).where(eq(vibeItems.tripId, tripId));
    await tx.delete(dateProposals).where(eq(dateProposals.tripId, tripId));
    await tx.delete(destinations).where(eq(destinations.tripId, tripId));
    await tx.delete(accommodations).where(eq(accommodations.tripId, tripId));
    await tx.delete(budgetItems).where(eq(budgetItems.tripId, tripId));
    await tx.delete(refereeMessages).where(eq(refereeMessages.tripId, tripId));
    await tx.delete(notifications).where(eq(notifications.tripId, tripId));
    await tx
      .delete(memberPreferences)
      .where(eq(memberPreferences.tripId, tripId));
    await tx.delete(activityEvents).where(eq(activityEvents.tripId, tripId));
    await tx.delete(tripInvites).where(eq(tripInvites.tripId, tripId));
    await tx.delete(tripMembers).where(eq(tripMembers.tripId, tripId));
    await tx.delete(trips).where(eq(trips.id, tripId));
  });
}

/**
 * A copy of a trip's plan, with none of its history.
 *
 * Proposals, the vibe board and the itinerary come across; votes, comments,
 * locks, budget spend, referee messages and activity do not. A clone is the
 * same trip run again for a different group, so carrying last year's votes
 * over would start the new trip with decisions nobody in it had made — and
 * `selected` in particular would present a finalised stay to a group that had
 * never seen it.
 *
 * Members do not come across either: the clone belongs to whoever made it, and
 * the rest of the group joins the same way they did the first time.
 */
export async function cloneTripContents(
  sourceTripId: number,
  targetTripId: number,
  actorUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db.transaction(async tx => {
    const [dates, dests, accs, vibes, days] = await Promise.all([
      tx
        .select()
        .from(dateProposals)
        .where(eq(dateProposals.tripId, sourceTripId)),
      tx
        .select()
        .from(destinations)
        .where(eq(destinations.tripId, sourceTripId)),
      tx
        .select()
        .from(accommodations)
        .where(eq(accommodations.tripId, sourceTripId)),
      tx.select().from(vibeItems).where(eq(vibeItems.tripId, sourceTripId)),
      tx
        .select()
        .from(itineraryDays)
        .where(eq(itineraryDays.tripId, sourceTripId)),
    ]);

    /**
     * Written out per table rather than spread from the source row. Spreading
     * would carry `id` and `createdAt` into the insert, and — worse — would
     * silently keep carrying whatever column the schema grows next, which for
     * a "fresh copy" is exactly the wrong default. Listing the fields makes
     * every carried value a decision, and the compiler checks the list.
     */
    if (dates.length)
      await tx.insert(dateProposals).values(
        dates.map(d => ({
          tripId: targetTripId,
          proposedBy: actorUserId,
          startDate: d.startDate,
          endDate: d.endDate,
          label: d.label,
        }))
      );

    if (dests.length)
      await tx.insert(destinations).values(
        dests.map(d => ({
          tripId: targetTripId,
          proposedBy: actorUserId,
          name: d.name,
          description: d.description,
          imageUrl: d.imageUrl,
          vibes: d.vibes,
          estimatedCost: d.estimatedCost,
        }))
      );

    if (accs.length)
      await tx.insert(accommodations).values(
        // `matchAnalysis` is deliberately absent: it is scored against the
        // source trip's stated preferences, which the clone does not have yet,
        // so carrying it would show the new group a verdict computed for
        // someone else.
        accs.map(a => ({
          tripId: targetTripId,
          proposedBy: actorUserId,
          name: a.name,
          description: a.description,
          imageUrl: a.imageUrl,
          pricePerNight: a.pricePerNight,
          totalPrice: a.totalPrice,
          perPersonCost: a.perPersonCost,
          bedrooms: a.bedrooms,
          bathrooms: a.bathrooms,
          singleBeds: a.singleBeds,
          doubleBeds: a.doubleBeds,
          toilets: a.toilets,
          ensuites: a.ensuites,
          freeParking: a.freeParking,
          camperParking: a.camperParking,
          amenities: a.amenities,
          preferences: a.preferences,
          location: a.location,
          link: a.link,
          comfortScore: a.comfortScore,
        }))
      );

    if (vibes.length)
      await tx.insert(vibeItems).values(
        vibes.map(v => ({
          tripId: targetTripId,
          proposedBy: actorUserId,
          url: v.url,
          title: v.title,
          description: v.description,
          imageUrl: v.imageUrl,
          tags: v.tags,
        }))
      );

    // Days carry items, so each new day id has to exist before its items can
    // point at it.
    for (const day of days) {
      const [inserted] = await tx
        .insert(itineraryDays)
        .values({
          tripId: targetTripId,
          date: day.date,
          title: day.title,
          notes: day.notes,
          sortOrder: day.sortOrder,
        })
        .returning({ id: itineraryDays.id });
      const items = await tx
        .select()
        .from(itineraryItems)
        .where(eq(itineraryItems.dayId, day.id));
      if (!items.length) continue;
      await tx.insert(itineraryItems).values(
        items.map(item => ({
          tripId: targetTripId,
          dayId: inserted.id,
          addedBy: actorUserId,
          time: item.time,
          title: item.title,
          description: item.description,
          location: item.location,
          type: item.type,
          cost: item.cost,
          link: item.link,
          sortOrder: item.sortOrder,
        }))
      );
    }
  });
}

export async function getUserTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.userId, userId));
  const tripIds = memberships.map(m => m.tripId);
  if (tripIds.length === 0) return [];
  const results = [];
  for (const tid of tripIds) {
    const trip = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tid))
      .limit(1);
    if (trip[0])
      results.push({
        ...trip[0],
        memberRole: memberships.find(m => m.tripId === tid)?.role,
        memberStatus: memberships.find(m => m.tripId === tid)?.status,
      });
  }
  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ---- Trip Members ----
export async function addTripMember(data: InsertTripMember) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(tripMembers)
    .where(
      and(
        eq(tripMembers.tripId, data.tripId),
        eq(tripMembers.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [result] = await db
    .insert(tripMembers)
    .values(data)
    .returning({ id: tripMembers.id });
  return { id: result.id, ...data };
}

export async function updateMemberStatus(
  tripId: number,
  userId: number,
  status: "pending" | "accepted" | "declined"
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripMembers)
    .set({ status })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

export async function getTripMember(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return row;
}

export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const enriched = [];
  for (const m of members) {
    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, m.userId))
      .limit(1);
    let invitedByName: string | null = null;
    if (m.invitedBy) {
      const inviter = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, m.invitedBy))
        .limit(1);
      invitedByName = inviter[0]?.name ?? null;
    }
    enriched.push({ ...m, user: user[0] || null, invitedByName });
  }
  return enriched;
}

export async function updateMemberBudget(
  tripId: number,
  userId: number,
  budgetMax: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripMembers)
    .set({ budgetMax })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

export async function updateMemberRole(
  tripId: number,
  userId: number,
  role: TripRole
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripMembers)
    .set({ role })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

export async function removeTripMember(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
}

/**
 * How many accepted admins a trip has. Guards the "a trip always has an admin"
 * rule, which is the only thing standing between a mis-click and a trip nobody
 * can administer.
 */
export async function countTripAdmins(tripId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(
      and(
        eq(tripMembers.tripId, tripId),
        eq(tripMembers.role, "admin"),
        eq(tripMembers.status, "accepted")
      )
    );
  return rows.length;
}

/**
 * A member's existing vote, if any. Lets the activity trail distinguish a first
 * vote from a change of mind, which is the difference between "Sam voted" and
 * "Sam changed their vote".
 */
export async function getMyDateVote(proposalId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dateVotes)
    .where(
      and(eq(dateVotes.proposalId, proposalId), eq(dateVotes.userId, userId))
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getMyDestinationVote(
  destinationId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(destinationVotes)
    .where(
      and(
        eq(destinationVotes.destinationId, destinationId),
        eq(destinationVotes.userId, userId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getMyAccommodationVote(
  accommodationId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(accommodationVotes)
    .where(
      and(
        eq(accommodationVotes.accommodationId, accommodationId),
        eq(accommodationVotes.userId, userId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Who voted on a proposal, how, and when — plus who has not.
 *
 * "3/6 voted" answers how many; the question people actually have is which
 * three, and who to chase. `updatedAt` is used rather than `createdAt` so a
 * changed vote reports when it changed.
 */
export async function getProposalVoters(
  proposalType: "date" | "destination" | "accommodation",
  proposalId: number,
  tripId: number
) {
  const db = await getDb();
  if (!db) return { voted: [], notVoted: [] };

  const rows =
    proposalType === "date"
      ? await db
          .select()
          .from(dateVotes)
          .where(eq(dateVotes.proposalId, proposalId))
      : proposalType === "destination"
        ? await db
            .select()
            .from(destinationVotes)
            .where(eq(destinationVotes.destinationId, proposalId))
        : await db
            .select()
            .from(accommodationVotes)
            .where(eq(accommodationVotes.accommodationId, proposalId));

  const members = await getTripMembers(tripId);
  const accepted = members.filter(m => m.status === "accepted");
  const votedIds = new Set(rows.map(r => r.userId));

  return {
    voted: rows.map(r => ({
      userId: r.userId,
      name: accepted.find(m => m.userId === r.userId)?.user?.name ?? null,
      vote: r.vote as string,
      at: r.updatedAt ?? r.createdAt,
    })),
    notVoted: accepted
      .filter(m => !votedIds.has(m.userId))
      .map(m => ({ userId: m.userId, name: m.user?.name ?? null })),
  };
}

// ---- Activity trail ----

/**
 * Every action worth remembering, named once so ten routers cannot invent ten
 * spellings of the same event. Shape is `<entity>.<verb>`.
 */
export const ACTIVITY_ACTIONS = [
  "proposal.created",
  "proposal.edited",
  "proposal.deleted",
  "proposal.locked",
  "proposal.unlocked",
  "vote.cast",
  "vote.changed",
  "vote.withdrawn",
  "comment.added",
  "comment.deleted",
  "member.invited",
  "member.joined",
  "member.declined",
  "member.removed",
  "member.role_changed",
  "trip.edited",
  "trip.cloned",
  "preferences.saved",
  "ai.match_refreshed",
  "ai.referee_run",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/**
 * Records an action. **Never throws** — a broken trail must not fail the thing
 * the member actually asked for, so this logs and returns instead.
 */
export async function recordActivity(entry: {
  tripId: number;
  actorUserId: number;
  action: ActivityAction;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(activityEvents).values({
      tripId: entry.tripId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    });
  } catch (err) {
    log.warn("failed to record activity", { action: entry.action, err });
  }
}

export async function getTripActivity(tripId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.tripId, tripId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
}

// ---- Trip Invites ----

/**
 * Records an invite, or refreshes the one already sent to that address.
 *
 * Re-inviting is a normal thing to do when the first email went astray, so it
 * updates the existing row and returns its token rather than accumulating a
 * row per attempt.
 */
export async function upsertTripInvite(data: InsertTripInvite) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const email = data.email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(tripInvites)
    .where(
      and(eq(tripInvites.tripId, data.tripId), eq(tripInvites.email, email))
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(tripInvites)
      .set({
        role: data.role,
        invitedBy: data.invitedBy,
        status: "pending",
        sentAt: new Date(),
        respondedAt: null,
      })
      .where(eq(tripInvites.id, existing[0].id));
    return { ...existing[0], token: existing[0].token };
  }
  const [row] = await db
    .insert(tripInvites)
    .values({ ...data, email })
    .returning();
  return row;
}

export async function getTripInvites(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tripInvites)
    .where(eq(tripInvites.tripId, tripId))
    .orderBy(desc(tripInvites.sentAt));
}

export async function getTripInviteByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(tripInvites)
    .where(eq(tripInvites.token, token))
    .limit(1);
  return rows[0] || null;
}

export async function setInviteStatus(
  id: number,
  status: "pending" | "accepted" | "declined" | "revoked"
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripInvites)
    .set({ status, respondedAt: new Date() })
    .where(eq(tripInvites.id, id));
}

// ---- Contacts ----
export async function addContact(data: InsertContact) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const email = data.email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.ownerUserId, data.ownerUserId), eq(contacts.email, email))
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(contacts)
      .set({ name: data.name, contactUserId: data.contactUserId ?? null })
      .where(eq(contacts.id, existing[0].id));
    return existing[0].id;
  }
  const [row] = await db
    .insert(contacts)
    .values({ ...data, email })
    .returning({ id: contacts.id });
  return row.id;
}

export async function getContacts(ownerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.ownerUserId, ownerUserId))
    .orderBy(contacts.name);
}

/** Scoped by owner so one user can never delete another's contact by guessing an id. */
export async function deleteContact(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.ownerUserId, ownerUserId)));
}

// ---- Date Proposals ----
export async function createDateProposal(data: InsertDateProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(dateProposals)
    .values(data)
    .returning({ id: dateProposals.id });
  return result.id;
}

/**
 * Resolves a set of user ids to display names in one query.
 *
 * The three proposal listings used to run a query per vote to do this, plus one
 * per proposal — a trip with 20 proposals and 6 members each was well over a
 * hundred round trips for one screen. They now collect the ids first and call
 * this once.
 */
async function namesByUserId(
  ids: number[]
): Promise<Map<number, { id: number; name: string | null }>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const byId = new Map<number, { id: number; name: string | null }>();
  if (unique.length === 0) return byId;
  const db = await getDb();
  if (!db) return byId;
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  for (const r of rows) byId.set(r.id, r);
  return byId;
}

export async function getDateProposals(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(dateProposals)
    .where(eq(dateProposals.tripId, tripId))
    .orderBy(dateProposals.startDate);
  if (rows.length === 0) return [];

  const votes = await db
    .select()
    .from(dateVotes)
    .where(
      inArray(
        dateVotes.proposalId,
        rows.map(r => r.id)
      )
    );

  // Proposer and voter names in one lookup, rather than one query per row.
  const names = await namesByUserId([
    ...rows.map(r => r.proposedBy),
    ...votes.map(v => v.userId),
  ]);

  return rows.map(r => ({
    ...r,
    proposer: names.get(r.proposedBy) ?? null,
    votes: votes
      .filter(v => v.proposalId === r.id)
      .map(v => ({ ...v, user: names.get(v.userId) ?? null })),
  }));
}
export async function lockDateProposal(
  tripId: number,
  proposalId: number,
  lockedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(dateProposals)
    .set({ selected: false, lockedBy: null, lockedAt: null })
    .where(eq(dateProposals.tripId, tripId));
  await db
    .update(dateProposals)
    .set({ selected: true, lockedBy, lockedAt: new Date() })
    .where(eq(dateProposals.id, proposalId));
}

export async function unlockDateProposals(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(dateProposals)
    .set({ selected: false, lockedBy: null, lockedAt: null })
    .where(eq(dateProposals.tripId, tripId));
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
  const result = await db
    .select()
    .from(dateProposals)
    .where(eq(dateProposals.id, id))
    .limit(1);
  return result[0] || null;
}

export async function voteDateProposal(data: InsertDateVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(dateVotes)
    .where(
      and(
        eq(dateVotes.proposalId, data.proposalId),
        eq(dateVotes.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // `createdAt` stays at the first vote; `updatedAt` is when they changed
    // their mind. Without this the breakdown reports the wrong moment for
    // anyone who re-voted.
    await db
      .update(dateVotes)
      .set({ vote: data.vote, updatedAt: new Date() })
      .where(eq(dateVotes.id, existing[0].id));
    return;
  }
  await db.insert(dateVotes).values(data);
}

export async function unvoteDateProposal(proposalId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(dateVotes)
    .where(
      and(eq(dateVotes.proposalId, proposalId), eq(dateVotes.userId, userId))
    );
}

// ---- Destinations ----
export async function createDestination(data: InsertDestination) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(destinations)
    .values(data)
    .returning({ id: destinations.id });
  return result.id;
}

export async function getDestinations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(destinations)
    .where(eq(destinations.tripId, tripId))
    .orderBy(desc(destinations.createdAt));
  if (rows.length === 0) return [];

  const votes = await db
    .select()
    .from(destinationVotes)
    .where(
      inArray(
        destinationVotes.destinationId,
        rows.map(r => r.id)
      )
    );

  // Proposer and voter names in one lookup, rather than one query per row.
  const names = await namesByUserId([
    ...rows.map(r => r.proposedBy),
    ...votes.map(v => v.userId),
  ]);

  return rows.map(r => ({
    ...r,
    proposer: names.get(r.proposedBy) ?? null,
    votes: votes
      .filter(v => v.destinationId === r.id)
      .map(v => ({ ...v, user: names.get(v.userId) ?? null })),
  }));
}
export async function voteDestination(data: InsertDestinationVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(destinationVotes)
    .where(
      and(
        eq(destinationVotes.destinationId, data.destinationId),
        eq(destinationVotes.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // `createdAt` stays at the first vote; `updatedAt` is when they changed
    // their mind. Without this the breakdown reports the wrong moment for
    // anyone who re-voted.
    await db
      .update(destinationVotes)
      .set({ vote: data.vote, updatedAt: new Date() })
      .where(eq(destinationVotes.id, existing[0].id));
    return;
  }
  await db.insert(destinationVotes).values(data);
}

export async function unvoteDestination(destinationId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(destinationVotes)
    .where(
      and(
        eq(destinationVotes.destinationId, destinationId),
        eq(destinationVotes.userId, userId)
      )
    );
}

/**
 * Finalise or un-finalise **one** place, leaving the others alone.
 *
 * A week in Spain is Barcelona *and* Girona. This used to clear every other
 * destination in the trip before setting one, which made "finalised" mean "the
 * only one" and quietly undid a previous decision.
 */
export async function setDestinationLock(
  destinationId: number,
  locked: boolean,
  lockedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(destinations)
    .set(
      locked
        ? { selected: true, lockedBy, lockedAt: new Date() }
        : { selected: false, lockedBy: null, lockedAt: null }
    )
    .where(eq(destinations.id, destinationId));
}

/** Clear every finalised place on the trip. */
export async function unlockDestinations(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(destinations)
    .set({ selected: false, lockedBy: null, lockedAt: null })
    .where(eq(destinations.tripId, tripId));
}

export async function deleteDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(destinationVotes)
    .where(eq(destinationVotes.destinationId, id));
  await db.delete(destinations).where(eq(destinations.id, id));
}

export async function getDestination(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(destinations)
    .where(eq(destinations.id, id))
    .limit(1);
  return result[0] || null;
}

// ---- Accommodations ----
export async function createAccommodation(data: InsertAccommodation) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(accommodations)
    .values(data)
    .returning({ id: accommodations.id });
  return result.id;
}

export async function getAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(accommodations)
    .where(eq(accommodations.tripId, tripId))
    .orderBy(desc(accommodations.createdAt));
  if (rows.length === 0) return [];

  const votes = await db
    .select()
    .from(accommodationVotes)
    .where(
      inArray(
        accommodationVotes.accommodationId,
        rows.map(r => r.id)
      )
    );

  // Proposer and voter names in one lookup, rather than one query per row.
  const names = await namesByUserId([
    ...rows.map(r => r.proposedBy),
    ...votes.map(v => v.userId),
  ]);

  return rows.map(r => ({
    ...r,
    proposer: names.get(r.proposedBy) ?? null,
    votes: votes
      .filter(v => v.accommodationId === r.id)
      .map(v => ({ ...v, user: names.get(v.userId) ?? null })),
  }));
}
export async function voteAccommodation(data: InsertAccommodationVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(accommodationVotes)
    .where(
      and(
        eq(accommodationVotes.accommodationId, data.accommodationId),
        eq(accommodationVotes.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    // `createdAt` stays at the first vote; `updatedAt` is when they changed
    // their mind. Without this the breakdown reports the wrong moment for
    // anyone who re-voted.
    await db
      .update(accommodationVotes)
      .set({ vote: data.vote, updatedAt: new Date() })
      .where(eq(accommodationVotes.id, existing[0].id));
    return;
  }
  await db.insert(accommodationVotes).values(data);
}

export async function unvoteAccommodation(
  accommodationId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(accommodationVotes)
    .where(
      and(
        eq(accommodationVotes.accommodationId, accommodationId),
        eq(accommodationVotes.userId, userId)
      )
    );
}

/**
 * Finalise or un-finalise **one** accommodation, leaving the others alone. A
 * two-stop trip books two places to sleep; see `setDestinationLock`.
 */
export async function setAccommodationLock(
  accommodationId: number,
  locked: boolean,
  lockedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(accommodations)
    .set(
      locked
        ? { selected: true, lockedBy, lockedAt: new Date() }
        : { selected: false, lockedBy: null, lockedAt: null }
    )
    .where(eq(accommodations.id, accommodationId));
}

/** Clear every finalised accommodation on the trip. */
export async function unlockAccommodations(tripId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(accommodations)
    .set({ selected: false, lockedBy: null, lockedAt: null })
    .where(eq(accommodations.tripId, tripId));
}

export async function deleteAccommodation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(accommodationVotes)
    .where(eq(accommodationVotes.accommodationId, id));
  await db.delete(accommodations).where(eq(accommodations.id, id));
}

export async function getAccommodation(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(accommodations)
    .where(eq(accommodations.id, id))
    .limit(1);
  return result[0] || null;
}

// ---- Budget Items ----
export async function createBudgetItem(data: InsertBudgetItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(budgetItems)
    .values(data)
    .returning({ id: budgetItems.id });
  return result.id;
}

export async function getBudgetItems(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.tripId, tripId))
    .orderBy(desc(budgetItems.createdAt));
}

export async function getBudgetItem(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.id, id))
    .limit(1);
  return rows[0] || null;
}

export async function updateBudgetItem(
  id: number,
  data: Partial<InsertBudgetItem>
) {
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
  const [result] = await db
    .insert(refereeMessages)
    .values(data)
    .returning({ id: refereeMessages.id });
  return result.id;
}

export async function getRefereeMessages(tripId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(refereeMessages)
    .where(eq(refereeMessages.tripId, tripId))
    .orderBy(desc(refereeMessages.createdAt))
    .limit(limit);
}

// ---- Notifications ----
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(notifications)
    .values(data)
    .returning({ id: notifications.id });
  return result.id;
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.userId, userId));
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), eq(notifications.read, false))
    );
  return result[0]?.count || 0;
}

// ---- Update proposals (edit) ----
export async function updateDateProposal(
  id: number,
  data: { label?: string; startDate?: Date; endDate?: Date }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dateProposals).set(data).where(eq(dateProposals.id, id));
}

export async function updateDestination(
  id: number,
  data: Partial<InsertDestination>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(destinations).set(data).where(eq(destinations.id, id));
}

export async function updateAccommodation(
  id: number,
  data: Partial<InsertAccommodation>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(accommodations).set(data).where(eq(accommodations.id, id));
}

// ---- Check trip organizer ----
/**
 * Whether the user administers this trip.
 *
 * Replaces `isTripOrganizer`, which compared against `trips.organizerId` and so
 * could not see a second admin. `organizerId` still records who created the
 * trip; it is no longer what grants rights.
 */
export async function isTripAdmin(
  tripId: number,
  userId: number
): Promise<boolean> {
  const member = await getTripMember(tripId, userId);
  return member?.role === "admin" && member.status === "accepted";
}

// ---- Proposal Comments ----
export async function createComment(data: InsertProposalComment) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(proposalComments)
    .values(data)
    .returning({ id: proposalComments.id });
  return result.id;
}

export async function getComments(
  proposalType: "date" | "destination" | "accommodation",
  proposalId: number
) {
  const db = await getDb();
  if (!db) return [];
  const comments = await db
    .select()
    .from(proposalComments)
    .where(
      and(
        eq(proposalComments.proposalType, proposalType),
        eq(proposalComments.proposalId, proposalId)
      )
    )
    .orderBy(proposalComments.createdAt);
  const enriched = [];
  for (const c of comments) {
    const user = await db
      .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, c.userId))
      .limit(1);
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
  const [row] = await db
    .select()
    .from(proposalComments)
    .where(eq(proposalComments.id, id))
    .limit(1);
  return row || null;
}

export async function getCommentCountsByTrip(
  tripId: number
): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const counts = await db
    .select({
      proposalType: proposalComments.proposalType,
      proposalId: proposalComments.proposalId,
      count: sql<number>`count(*)`,
    })
    .from(proposalComments)
    .where(eq(proposalComments.tripId, tripId))
    .groupBy(proposalComments.proposalType, proposalComments.proposalId);
  const result: Record<string, number> = {};
  for (const row of counts) {
    result[`${row.proposalType}_${row.proposalId}`] = Number(row.count);
  }
  return result;
}

// ---- Vibe Board ----
export async function createVibeItem(data: InsertVibeItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(vibeItems)
    .values(data)
    .returning({ id: vibeItems.id });
  return result.id;
}

export async function getVibeItems(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const items = await db
    .select()
    .from(vibeItems)
    .where(eq(vibeItems.tripId, tripId))
    .orderBy(desc(vibeItems.createdAt));
  const enriched = [];
  for (const item of items) {
    const votes = await db
      .select()
      .from(vibeVotes)
      .where(eq(vibeVotes.vibeItemId, item.id));
    const proposer = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, item.proposedBy))
      .limit(1);
    enriched.push({ ...item, votes, proposedByUser: proposer[0] || null });
  }
  return enriched;
}

export async function deleteVibeItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(vibeVotes).where(eq(vibeVotes.vibeItemId, id));
  await db.delete(vibeItems).where(eq(vibeItems.id, id));
}

export async function voteVibeItem(data: InsertVibeVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(vibeVotes)
    .where(
      and(
        eq(vibeVotes.vibeItemId, data.vibeItemId),
        eq(vibeVotes.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(vibeVotes)
      .set({ vote: data.vote })
      .where(eq(vibeVotes.id, existing[0].id));
    return;
  }
  await db.insert(vibeVotes).values(data);
}

export async function unvoteVibeItem(vibeItemId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(vibeVotes)
    .where(
      and(eq(vibeVotes.vibeItemId, vibeItemId), eq(vibeVotes.userId, userId))
    );
}

export async function getVibeItem(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(vibeItems)
    .where(eq(vibeItems.id, id))
    .limit(1);
  return row || null;
}

// ---- Itinerary ----
export async function getItineraryDays(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const days = await db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.tripId, tripId))
    .orderBy(itineraryDays.date, itineraryDays.sortOrder);
  const enriched = [];
  for (const day of days) {
    const items = await db
      .select()
      .from(itineraryItems)
      .where(eq(itineraryItems.dayId, day.id))
      .orderBy(itineraryItems.sortOrder, itineraryItems.time);
    const itemsWithUsers = [];
    for (const item of items) {
      const adder = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, item.addedBy))
        .limit(1);
      itemsWithUsers.push({ ...item, addedByUser: adder[0] || null });
    }
    enriched.push({ ...day, items: itemsWithUsers });
  }
  return enriched;
}

export async function createItineraryDay(data: InsertItineraryDay) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(itineraryDays)
    .values(data)
    .returning({ id: itineraryDays.id });
  return result.id;
}

export async function updateItineraryDay(
  id: number,
  data: Partial<{ title: string; notes: string }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(itineraryDays).set(data).where(eq(itineraryDays.id, id));
}

export async function deleteItineraryDay(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(itineraryItems).where(eq(itineraryItems.dayId, id));
  await db.delete(itineraryDays).where(eq(itineraryDays.id, id));
}

export async function addItineraryItem(data: InsertItineraryItem) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(itineraryItems)
    .values(data)
    .returning({ id: itineraryItems.id });
  return result.id;
}

export async function deleteItineraryItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(itineraryItems).where(eq(itineraryItems.id, id));
}

export async function getItineraryDay(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.id, id))
    .limit(1);
  return row || null;
}

export async function getItineraryItem(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(itineraryItems)
    .where(eq(itineraryItems.id, id))
    .limit(1);
  return row || null;
}

export async function saveAccommodationMatchAnalysis(
  id: number,
  analysis: object
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(accommodations)
    .set({
      matchAnalysis: JSON.stringify(analysis),
      matchAnalysedAt: new Date(),
    })
    .where(eq(accommodations.id, id));
}

export async function saveTripPreferences(data: {
  tripId: number;
  userId: number;
  mustHaves: string;
  strongPreferences: string;
  avoids: string;
  openComments: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rawText = JSON.stringify({
    mustHaves: data.mustHaves,
    strongPreferences: data.strongPreferences,
    avoids: data.avoids,
    openComments: data.openComments,
  });
  const existing = await db
    .select()
    .from(memberPreferences)
    .where(
      and(
        eq(memberPreferences.tripId, data.tripId),
        eq(memberPreferences.userId, data.userId),
        eq(memberPreferences.category, "general")
      )
    )
    .limit(1);
  if (existing.length) {
    await db
      .update(memberPreferences)
      .set({ rawText, attributes: rawText, updatedAt: new Date() })
      .where(eq(memberPreferences.id, existing[0].id));
  } else {
    await db.insert(memberPreferences).values({
      tripId: data.tripId,
      userId: data.userId,
      category: "general",
      rawText,
      attributes: rawText,
    });
  }
}

export async function getMyTripPreferences(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(memberPreferences)
    .where(
      and(
        eq(memberPreferences.tripId, tripId),
        eq(memberPreferences.userId, userId),
        eq(memberPreferences.category, "general")
      )
    )
    .limit(1);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.rawText) as {
      mustHaves: string;
      strongPreferences: string;
      avoids: string;
      openComments: string;
    };
    // The preferences screen tells you when you last saved, so the row's own
    // timestamp has to survive the trip through `rawText`.
    return { ...parsed, updatedAt: row.updatedAt };
  } catch {
    return null;
  }
}

export async function getAllTripPreferences(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: memberPreferences.id,
      userId: memberPreferences.userId,
      rawText: memberPreferences.rawText,
      updatedAt: memberPreferences.updatedAt,
    })
    .from(memberPreferences)
    .where(
      and(
        eq(memberPreferences.tripId, tripId),
        eq(memberPreferences.category, "general")
      )
    );
}

/**
 * When anyone on the trip last changed their preferences.
 *
 * A match analysis older than this was scored against something the group no
 * longer says it wants. Since analysis stopped re-running itself, this is what
 * lets the screen say so instead of silently showing stale advice.
 */
export async function getLatestPreferenceUpdate(
  tripId: number
): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ updatedAt: memberPreferences.updatedAt })
    .from(memberPreferences)
    .where(eq(memberPreferences.tripId, tripId))
    .orderBy(desc(memberPreferences.updatedAt))
    .limit(1);
  return rows[0]?.updatedAt ?? null;
}

export async function countTripPreferences(tripId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: memberPreferences.id })
    .from(memberPreferences)
    .where(
      and(
        eq(memberPreferences.tripId, tripId),
        eq(memberPreferences.category, "general")
      )
    );
  return rows.length;
}
