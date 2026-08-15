import { eq, and, asc, desc, ne, or, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { nanoid } from "nanoid";
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
  budgetProposals,
  InsertBudgetProposal,
  budgetVotes,
  InsertBudgetVote,
  tripGroups,
  InsertTripGroup,
  tripAttendees,
  InsertTripAttendee,
  refereeMessages,
  InsertRefereeMessage,
  notifications,
  InsertNotification,
  magicLinkTokens,
  proposalComments,
  InsertProposalComment,
  memberPreferences,
  suggestionDismissals,
  webauthnCredentials,
  InsertWebauthnCredential,
  webauthnChallenges,
  tripInvites,
  InsertTripInvite,
  contacts,
  contactGroups,
  contactGroupMembers,
  InsertContact,
  InsertSuggestionDismissal,
  InsertContactGroup,
  InsertContactGroupMember,
  activityEvents,
  productEvents,
  accommodationAttributes,
  contentReports,
  InsertContentReport,
  userBlocks,
  subscriptions,
  InsertSubscription,
} from "../drizzle/schema.js";
import { TRIP_ROLE_RANK, type TripRole } from "../shared/roles.js";
import { ACTIVE_TRIP_STATUSES } from "../shared/billing.js";
import {
  sanitiseProductEventMetadata,
  type ProductEvent,
} from "../shared/productEvents.js";
import { config, ENV } from "./_core/env.js";
import { cachedTripMember, forgetMemberships } from "./_core/requestCache.js";
import { logger } from "./_core/logger.js";

const log = logger.child({ scope: "db" });

let _db: ReturnType<typeof drizzle> | null = null;

/** Give up on an unreachable database instead of waiting forever (pg defaults to no timeout). */
const CONNECTION_TIMEOUT_MS = 5_000;
const QUERY_TIMEOUT_MS = 15_000;

/**
 * Hand connections back to the pooler quickly. pg's default is 10s already, but
 * being explicit matters here: on the session pooler an idle client still
 * occupies one of the tenant's few slots (see `POOL_MAX` below), so the window
 * where this instance holds a slot it is not using should be short.
 */
const IDLE_TIMEOUT_MS = 10_000;

/**
 * How many connections one process may hold.
 *
 * `DATABASE_URL` points at Supabase's *session* pooler, which allots the whole
 * tenant a fixed number of client slots — 15 on this project — and rejects the
 * next connection with `EMAXCONNSESSION` rather than queueing it
 * ([ADR 0012](../docs/adr/0012-session-pooler-for-the-database-url.md)).
 *
 * That budget is shared by every warm Vercel instance at once, and pg's default
 * of 10 per pool blows it with two instances. A batched page load fans out
 * eight tRPC procedures in parallel, so a couple of instances is what an
 * ordinary visit produces: on 2026-08-24 one visit to the demo trip turned into
 * 76 failed queries in 18 seconds, every one of them this error.
 *
 * A low cap makes the surplus queue inside pg — where waiting is cheap and
 * bounded by `CONNECTION_TIMEOUT_MS` — instead of being rejected by the pooler.
 * Long-running servers that own their database can raise it with `DB_POOL_MAX`.
 */
const POOL_MAX = config.db.poolMax;

/** Wait before retrying a connection the pooler turned away. */
const SATURATION_RETRY_DELAYS_MS = [60, 180, 420];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Did the *pooler* refuse this connection because the tenant is out of slots?
 *
 * Supabase's Supavisor reports it as `XX000` — Postgres' "internal error"
 * catch-all — so the code alone is not enough to go on and the message has to
 * be matched too. The refusal happens while the connection is being opened,
 * before any statement is sent, which is what makes a retry safe: nothing ran.
 */
export function isPoolSaturationError(error: unknown): boolean {
  for (let err = error, depth = 0; err && depth < 5; depth++) {
    const { message, code, cause } = err as {
      message?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (typeof message === "string") {
      if (/EMAXCONNSESSION/i.test(message)) return true;
      if (code === "XX000" && /max clients reached/i.test(message)) return true;
    }
    err = cause;
  }
  return false;
}

/**
 * Retry `acquire` while the pooler is out of slots.
 *
 * Our own cap keeps this instance inside its share, but the budget is shared
 * with every other instance, so a burst can still find it spent. Waiting out
 * the other instance's query — a few hundred milliseconds — beats turning a
 * page load into a 500.
 */
export async function acquireWithRetry<T>(
  acquire: () => Promise<T>,
  { delays = SATURATION_RETRY_DELAYS_MS, wait = sleep } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await acquire();
    } catch (error) {
      if (attempt >= delays.length || !isPoolSaturationError(error))
        throw error;
      log.warn("pooler out of connection slots, retrying", {
        attempt: attempt + 1,
        delayMs: delays[attempt],
      });
      await wait(delays[attempt]);
    }
  }
}

/**
 * A `pg.Pool` that retries connections the pooler turned away.
 *
 * Everything that reaches Postgres goes through `connect()` — `pool.query()`
 * calls it internally, and so does every drizzle statement — so overriding this
 * one method covers the whole surface. The callback form is the one pg itself
 * uses; the promise form is what `db.transaction()` uses.
 *
 * Exported for `db.pool.test.ts`; the app only ever gets one, from `getDb()`.
 */
export class ResilientPool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(
    callback: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: boolean | Error) => void
    ) => void
  ): void;
  override connect(
    callback?: (
      err: Error | undefined,
      client: PoolClient | undefined,
      done: (release?: boolean | Error) => void
    ) => void
  ): Promise<PoolClient> | void {
    const acquired = acquireWithRetry(() => super.connect());
    if (!callback) return acquired;
    acquired.then(
      client => callback(undefined, client, client.release.bind(client)),
      (err: Error) => callback(err, undefined, () => {})
    );
  }
}

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
      log.info("connecting to database", {
        source: config.db.source,
        poolMax: POOL_MAX,
      });
      const pool = new ResilientPool({
        connectionString: withRelaxedSsl(config.db.url),
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS,
        idleTimeoutMillis: IDLE_TIMEOUT_MS,
        max: POOL_MAX,
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

/**
 * Every table that names a user, split by what account deletion does to it.
 *
 * The split is the whole policy in one place, and `accountDeletion.test.ts`
 * checks both halves against `drizzle/schema.ts`: a table added later with a
 * `userId` column and no entry here fails that test rather than quietly
 * surviving somebody's deletion. This schema declares no foreign keys, so
 * nothing else would catch it.
 */
export const USER_ROWS_DELETED = [
  "trip_members",
  "trip_attendees",
  "date_votes",
  "destination_votes",
  "accommodation_votes",
  "budget_votes",
  "notifications",
  "member_preferences",
  "suggestion_dismissals",
  "webauthn_credentials",
  "webauthn_challenges",
  "contacts",
  "contact_groups",
  "content_reports",
  "user_blocks",
  "subscriptions",
] as const;

/**
 * Rows that keep pointing at the account after it is anonymised.
 *
 * A comment is part of a conversation other people are still having. Deleting
 * it would edit their trip's history to remove one voice; the tombstone leaves
 * the thread intact under a name that identifies nobody. The same reasoning
 * covers `proposedBy` and `addedBy`, which are columns rather than tables and
 * so are not listed here.
 */
export const USER_ROWS_ANONYMISED = [
  "proposal_comments",
  "activity_events",
  // Measurement, and the reason it survives is the reason it exists: a beta
  // that dropped a departing member's events would lose them from every funnel
  // they were ever counted in, which is the same mistake as measuring from the
  // activity trail (ADR 0024). Nothing is lost by keeping them — the row holds
  // an enum, a boolean or a count and never a word of free text, and the
  // `actorUserId` it names is a user row this cascade has just anonymised.
  "product_events",
] as const;

/**
 * What deleting this account would do to the trips it organises — decided in
 * one place, so the warning the dialog shows and the work `deleteUserCascade`
 * does can never disagree.
 *
 * A trip is handed to its most capable remaining member, and among equals to
 * the one who has been there longest. A trip with nobody left accepted into it
 * is abandoned, and the caller deletes it.
 *
 * Read-only: safe to call to preview the outcome.
 */
export async function planAccountDeletion(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const organised = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.organizerId, userId));

  const handovers: { tripId: number; toUserId: number }[] = [];
  const abandoned: number[] = [];

  for (const trip of organised) {
    const survivors = await db
      .select({ userId: tripMembers.userId, role: tripMembers.role })
      .from(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, trip.id),
          eq(tripMembers.status, "accepted"),
          ne(tripMembers.userId, userId)
        )
      )
      .orderBy(asc(tripMembers.joinedAt), asc(tripMembers.id));

    // The query is already in `joinedAt` order and `reduce` keeps the incumbent
    // on a tie, so an existing admin is never passed over for a tripmate who
    // merely joined earlier.
    const heir = survivors.reduce<(typeof survivors)[number] | null>(
      (best, m) =>
        best && TRIP_ROLE_RANK[best.role] >= TRIP_ROLE_RANK[m.role] ? best : m,
      null
    );
    if (heir) handovers.push({ tripId: trip.id, toUserId: heir.userId });
    else abandoned.push(trip.id);
  }

  return { handovers, abandoned };
}

/**
 * Erase an account at its owner's request, and hand on what other people share.
 *
 * Apple requires deletion to be reachable from inside the app, and the naive
 * reading of that — delete the row — is wrong here twice over. This schema
 * declares no foreign keys, so nothing would stop a proposal outliving its
 * proposer. And a trip is other people's: the organiser walking out must not
 * take four friends' planning with them.
 *
 * So, in order:
 *
 * 1. **Trips they organise are handed on**, to the longest-standing accepted
 *    member — an existing organiser first, so a co-organiser is never demoted
 *    past a tripmate who happened to join earlier. A trip with nobody left in
 *    it is deleted outright through `deleteTripCascade`, which already knows
 *    the full child-row order.
 * 2. **Everything personal is deleted**: credentials, passkeys, magic-link
 *    tokens, notifications, preferences, their address book, and every vote
 *    they cast. Votes go because a departed member must not keep counting
 *    toward a quorum they can no longer be part of.
 * 3. **Everything shared is anonymised, not deleted.** A proposal the group is
 *    still voting on keeps its row and points at a tombstone (see
 *    `users.deletedAt`), so the trip survives intact and nothing dangles.
 *
 * Returns what it did, so the caller can log it: this is irreversible and the
 * log line is the only record that will exist afterwards.
 */
export async function deleteUserCascade(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Read before anything is cleared: magic-link tokens are keyed by address
  // rather than by id, so once the address is gone there is no way to find
  // them, and a live link is a way back into a deleted account.
  const [existing] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  const email = existing?.email ?? null;

  const { handovers, abandoned } = await planAccountDeletion(userId);

  for (const tripId of abandoned) await deleteTripCascade(tripId);

  await db.transaction(async tx => {
    for (const { tripId, toUserId } of handovers) {
      await tx
        .update(trips)
        .set({ organizerId: toUserId, updatedAt: new Date() })
        .where(eq(trips.id, tripId));
      // The heir must be able to act on what they now own: `organizerId` names
      // who the trip belongs to, but every authorisation check goes through the
      // member role, so handing over one without the other leaves an owner who
      // cannot invite, edit or finalise. Harmless when they were already admin.
      await tx
        .update(tripMembers)
        .set({ role: "admin" })
        .where(
          and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, toUserId))
        );
    }

    // Their own address book, and their rows in anybody else's.
    const owned = await tx
      .select({ id: contactGroups.id })
      .from(contactGroups)
      .where(eq(contactGroups.ownerUserId, userId));
    if (owned.length)
      await tx.delete(contactGroupMembers).where(
        inArray(
          contactGroupMembers.groupId,
          owned.map(g => g.id)
        )
      );
    await tx.delete(contactGroups).where(eq(contactGroups.ownerUserId, userId));
    await tx.delete(contacts).where(eq(contacts.ownerUserId, userId));
    // A contact card somebody else saved stops naming an account that is gone,
    // but stays in their book as the plain address they typed.
    await tx
      .update(contacts)
      .set({ contactUserId: null })
      .where(eq(contacts.contactUserId, userId));

    // Credentials and anything that could sign in again.
    await tx
      .delete(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, userId));
    await tx
      .delete(webauthnChallenges)
      .where(eq(webauthnChallenges.userId, userId));

    // Every vote they cast, and the personal state behind them.
    await tx.delete(dateVotes).where(eq(dateVotes.userId, userId));
    await tx
      .delete(destinationVotes)
      .where(eq(destinationVotes.userId, userId));
    await tx
      .delete(accommodationVotes)
      .where(eq(accommodationVotes.userId, userId));
    await tx.delete(budgetVotes).where(eq(budgetVotes.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx
      .delete(memberPreferences)
      .where(eq(memberPreferences.userId, userId));
    await tx
      .delete(suggestionDismissals)
      .where(eq(suggestionDismissals.userId, userId));

    // Moderation state, in both directions. A block is a relationship between
    // two accounts and means nothing once one of them is gone; a report they
    // filed cannot be followed up with a reporter who no longer exists, and a
    // report *about* them has lost its subject.
    await tx
      .delete(userBlocks)
      .where(
        or(
          eq(userBlocks.blockerUserId, userId),
          eq(userBlocks.blockedUserId, userId)
        )
      );
    await tx
      .delete(contentReports)
      .where(
        or(
          eq(contentReports.reporterUserId, userId),
          and(
            eq(contentReports.contentType, "member"),
            eq(contentReports.contentId, userId)
          )
        )
      );

    // The store's record of what they bought. Deleting it does not cancel the
    // subscription — only the store can do that, from the account that owns it,
    // which is why the deletion dialog says so.
    await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));

    // Membership itself, in the trips they are only a guest of.
    await tx.delete(tripMembers).where(eq(tripMembers.userId, userId));
    await tx
      .delete(tripAttendees)
      .where(eq(tripAttendees.memberUserId, userId));
    // Invites they sent that nobody has accepted yet die with them; an invite
    // is an act by a person, and there is no longer a person behind it.
    await tx.delete(tripInvites).where(eq(tripInvites.invitedBy, userId));
    await tx
      .update(tripMembers)
      .set({ invitedBy: null })
      .where(eq(tripMembers.invitedBy, userId));

    if (email)
      await tx.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email));

    // What other people's trips still point at keeps its row and loses its
    // name. `proposedBy` and friends are NOT NULL, so there is nowhere to put a
    // null even if losing the attribution were acceptable.
    const stamp = new Date();
    await tx
      .update(users)
      .set({
        openId: `deleted:${nanoid(32)}`,
        email: null,
        name: "A former member",
        passwordHash: null,
        avatarUrl: null,
        loginMethod: null,
        deletedAt: stamp,
        updatedAt: stamp,
      })
      .where(eq(users.id, userId));
  });

  forgetMemberships();
  return {
    tripsHandedOver: handovers.length,
    tripsDeleted: abandoned.length,
  };
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
  "content_reports",
  "trip_members",
  "trip_groups",
  "trip_attendees",
  "trip_invites",
  "activity_events",
  "date_proposals",
  "destinations",
  "accommodations",
  "budget_proposals",
  "referee_messages",
  "notifications",
  "member_preferences",
  "proposal_comments",
  "suggestion_dismissals",
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
    const [dateIds, destIds, accIds, budgetIds] = await Promise.all([
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
        .select({ id: budgetProposals.id })
        .from(budgetProposals)
        .where(eq(budgetProposals.tripId, tripId)),
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
    if (budgetIds.length)
      await tx
        .delete(budgetVotes)
        .where(inArray(budgetVotes.proposalId, ids(budgetIds)));

    // Then everything that names the trip directly.
    // Reports first: they point at comments and proposals that are about to
    // stop existing, and a queue item whose subject cannot be looked at is
    // worse than no queue item.
    await tx.delete(contentReports).where(eq(contentReports.tripId, tripId));
    await tx
      .delete(proposalComments)
      .where(eq(proposalComments.tripId, tripId));
    await tx.delete(dateProposals).where(eq(dateProposals.tripId, tripId));
    await tx.delete(destinations).where(eq(destinations.tripId, tripId));
    await tx.delete(accommodations).where(eq(accommodations.tripId, tripId));
    await tx.delete(budgetProposals).where(eq(budgetProposals.tripId, tripId));
    await tx.delete(refereeMessages).where(eq(refereeMessages.tripId, tripId));
    await tx.delete(notifications).where(eq(notifications.tripId, tripId));
    await tx
      .delete(memberPreferences)
      .where(eq(memberPreferences.tripId, tripId));
    await tx
      .delete(suggestionDismissals)
      .where(eq(suggestionDismissals.tripId, tripId));
    await tx.delete(activityEvents).where(eq(activityEvents.tripId, tripId));
    await tx.delete(tripInvites).where(eq(tripInvites.tripId, tripId));
    await tx.delete(tripAttendees).where(eq(tripAttendees.tripId, tripId));
    await tx.delete(tripMembers).where(eq(tripMembers.tripId, tripId));
    // After the members that point at them, so nothing is left holding a
    // dangling groupId even for the instant the transaction is open.
    await tx.delete(tripGroups).where(eq(tripGroups.tripId, tripId));
    await tx.delete(trips).where(eq(trips.id, tripId));
  });
  forgetMemberships();
}

/**
 * A copy of a trip's plan, with none of its history.
 *
 * Proposals come across; votes, comments, locks, budget spend, referee
 * messages and activity do not. A clone is the
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
    const [dates, dests, accs] = await Promise.all([
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
  });
}

export async function getUserTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Accepted only. `trips.get` runs `requireTripRole`, which refuses any other
  // status, so a pending or declined membership listed here is a card that can
  // only ever land on "Trip not found".
  const memberships = await db
    .select()
    .from(tripMembers)
    .where(
      and(eq(tripMembers.userId, userId), eq(tripMembers.status, "accepted"))
    );
  const tripIds = memberships.map(m => m.tripId);
  if (tripIds.length === 0) return [];
  // One query rather than one per trip. This is the first screen anybody sees
  // after signing in, so it was also the first thing that felt slow.
  const rows = await db.select().from(trips).where(inArray(trips.id, tripIds));
  const membershipOf = new Map(memberships.map(m => [m.tripId, m]));
  return rows
    .map(t => ({
      ...t,
      memberRole: membershipOf.get(t.id)?.role,
      memberStatus: membershipOf.get(t.id)?.status,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
  forgetMemberships();
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
  forgetMemberships();
}

export async function getTripMember(tripId: number, userId: number) {
  // Once per HTTP request, not once per procedure in the batch. See
  // `_core/requestCache.ts` for why the row is cached and the decision is not.
  return cachedTripMember(tripId, userId, async () => {
    const db = await getDb();
    if (!db) return undefined;
    const [row] = await db
      .select()
      .from(tripMembers)
      .where(
        and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId))
      )
      .limit(1);
    return row;
  });
}

export async function getTripMembers(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db
    .select()
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  if (members.length === 0) return [];

  // One query for both roles a user id plays on this row — the member, and
  // whoever invited them. This used to be two queries *per member*, awaited in
  // sequence, and this function is reached five or six times over one page load
  // (`getTripHeadcount` and `getTripVoterCount` both call it, as do four
  // procedures directly). A ten-person trip was about 126 round trips for one
  // screen, queued three at a time behind the pool cap in `POOL_MAX`.
  const ids = Array.from(
    new Set([
      ...members.map(m => m.userId),
      ...members.map(m => m.invitedBy).filter((id): id is number => id != null),
    ])
  );
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, ids));
  const byId = new Map(rows.map(r => [r.id, r]));

  return members.map(m => ({
    ...m,
    user: byId.get(m.userId) ?? null,
    invitedByName: m.invitedBy ? (byId.get(m.invitedBy)?.name ?? null) : null,
  }));
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
  forgetMemberships();
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
  forgetMemberships();
}

export async function removeTripMember(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  forgetMemberships();
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

// ---- Trip groups ----

export async function getTripGroups(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tripGroups)
    .where(eq(tripGroups.tripId, tripId))
    .orderBy(tripGroups.createdAt);
}

export async function getTripGroup(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tripGroups)
    .where(eq(tripGroups.id, id))
    .limit(1);
  return row || null;
}

/** Case-insensitive, because "the patels" and "The Patels" are one family. */
export async function findTripGroupByName(tripId: number, name: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tripGroups)
    .where(
      and(
        eq(tripGroups.tripId, tripId),
        sql`lower(${tripGroups.name}) = lower(${name})`
      )
    )
    .limit(1);
  return row || null;
}

export async function createTripGroup(data: InsertTripGroup) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(tripGroups)
    .values(data)
    .returning({ id: tripGroups.id });
  return result.id;
}

export async function updateTripGroup(
  id: number,
  data: Partial<InsertTripGroup>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tripGroups).set(data).where(eq(tripGroups.id, id));
}

/**
 * Removes a group and leaves everyone who was in it on the trip, ungrouped.
 *
 * Deleting a group is an organisational change, never a way to remove people —
 * so the members and the attendees survive it and only their `groupId` clears.
 */
export async function deleteTripGroup(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripMembers)
    .set({ groupId: null })
    .where(eq(tripMembers.groupId, id));
  await db
    .update(tripAttendees)
    .set({ groupId: null })
    .where(eq(tripAttendees.groupId, id));
  await db.delete(tripGroups).where(eq(tripGroups.id, id));
  forgetMemberships();
}

export async function setMemberGroup(
  tripId: number,
  userId: number,
  groupId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(tripMembers)
    .set({ groupId })
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)));
  // The member's own attendee row follows them, so headcount by group stays
  // true without anyone having to move it by hand.
  await db
    .update(tripAttendees)
    .set({ groupId })
    .where(
      and(
        eq(tripAttendees.tripId, tripId),
        eq(tripAttendees.memberUserId, userId)
      )
    );
  forgetMemberships();
}

// ---- Attendees ----

export async function getTripAttendees(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tripAttendees)
    .where(eq(tripAttendees.tripId, tripId))
    .orderBy(tripAttendees.createdAt);
}

export async function getTripAttendee(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tripAttendees)
    .where(eq(tripAttendees.id, id))
    .limit(1);
  return row || null;
}

export async function createTripAttendee(data: InsertTripAttendee) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(tripAttendees)
    .values(data)
    .returning({ id: tripAttendees.id });
  return result.id;
}

export async function updateTripAttendee(
  id: number,
  data: Partial<InsertTripAttendee>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(tripAttendees).set(data).where(eq(tripAttendees.id, id));
}

export async function deleteTripAttendee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(tripAttendees).where(eq(tripAttendees.id, id));
}

/**
 * The attendee row standing for a member's own account, if it exists.
 *
 * Members are attendees too — that is what keeps headcount one number instead
 * of "members plus attendees, mind the overlap".
 */
export async function upsertMemberAttendee(
  tripId: number,
  userId: number,
  name: string,
  groupId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [existing] = await db
    .select()
    .from(tripAttendees)
    .where(
      and(
        eq(tripAttendees.tripId, tripId),
        eq(tripAttendees.memberUserId, userId)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(tripAttendees)
      .set({ name, groupId })
      .where(eq(tripAttendees.id, existing.id));
    return existing.id;
  }
  return createTripAttendee({
    tripId,
    memberUserId: userId,
    groupId,
    name,
    kind: "adult",
  });
}

export async function deleteMemberAttendee(tripId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(tripAttendees)
    .where(
      and(
        eq(tripAttendees.tripId, tripId),
        eq(tripAttendees.memberUserId, userId)
      )
    );
}

/**
 * How many people are coming, and what they are — **the only place headcount is
 * computed.**
 *
 * `people` is adults plus children. A pet is never in it, and never in any
 * divisor derived from it: a per-person figure that is a fifth too low still
 * renders perfectly, so the defence against that bug has to be that only one
 * function can make it.
 *
 * `groups` counts **charging** units — every group with somebody in it, plus
 * each accepted member who is in none. That is what a "per family" figure is
 * multiplied by.
 *
 * It deliberately differs from `getTripVoterCount`, which excludes watchers: a
 * watcher is a role about permissions, not attendance. On a trip of families
 * the watchers are family members who are coming and simply do not vote, so
 * they are counted here and not there. The two numbers are not a
 * contradiction to be tidied away — they answer different questions.
 */
export async function getTripHeadcount(tripId: number) {
  const [attendees, members, groups] = await Promise.all([
    getTripAttendees(tripId),
    getTripMembers(tripId),
    getTripGroups(tripId),
  ]);

  const blank = () => ({ adults: 0, children: 0, pets: 0, people: 0 });
  const add = (acc: ReturnType<typeof blank>, kind: string) => {
    if (kind === "adult") acc.adults++;
    else if (kind === "child") acc.children++;
    else acc.pets++;
    acc.people = acc.adults + acc.children;
    return acc;
  };

  const total = blank();
  const byGroup: Record<string, ReturnType<typeof blank>> = {};
  for (const g of groups) byGroup[String(g.id)] = blank();
  byGroup.none = blank();

  for (const a of attendees) {
    add(total, a.kind);
    const key = a.groupId != null ? String(a.groupId) : "none";
    add((byGroup[key] ??= blank()), a.kind);
  }

  // A group that nobody is in charges nothing and votes on nothing, so it is
  // not a unit. An accepted member in no group is one on their own.
  const populated = new Set(
    attendees.filter(a => a.groupId != null).map(a => String(a.groupId))
  );
  const ungrouped = members.filter(
    m => m.status === "accepted" && m.groupId == null
  ).length;

  return { ...total, groups: populated.size + ungrouped, byGroup };
}

// ---- Group vote exclusivity ----

const VOTE_TABLES = {
  date: { table: dateVotes, proposal: dateVotes.proposalId },
  destination: {
    table: destinationVotes,
    proposal: destinationVotes.destinationId,
  },
  accommodation: {
    table: accommodationVotes,
    proposal: accommodationVotes.accommodationId,
  },
  budget: { table: budgetVotes, proposal: budgetVotes.proposalId },
} as const;

export type VotableProposalType = keyof typeof VOTE_TABLES;

/**
 * One vote per group, enforced at the moment a vote is written.
 *
 * When the trip votes per group, a member's vote **replaces** any vote already
 * cast on that proposal by another member of the same group: the siblings are
 * deleted, then the caller upserts. Every tally downstream — `scoreVotes`, the
 * `votes.length` in each page, the "x/y voted" counts — then works unchanged,
 * because the rows are already one per group by the time anything reads them.
 *
 * The alternative was a `groupId` column on four vote tables and a tally
 * rewrite on both sides, which puts one invariant in four places that drift.
 * See docs/adr/0016-one-vote-per-group.md.
 *
 * A no-op when the trip votes per member, or when the voter is in no group.
 */
export async function applyGroupVoteExclusivity(
  proposalType: VotableProposalType,
  proposalId: number,
  tripId: number,
  userId: number
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const trip = await getTrip(tripId);
  if (!trip || trip.votingUnit !== "group") return [];

  const member = await getTripMember(tripId, userId);
  if (!member?.groupId) return [];

  const siblings = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(
      and(
        eq(tripMembers.tripId, tripId),
        eq(tripMembers.groupId, member.groupId)
      )
    );
  const others = siblings.map(s => s.userId).filter(id => id !== userId);
  if (others.length === 0) return [];

  const { table, proposal } = VOTE_TABLES[proposalType];
  const displaced = await db
    .select({ userId: table.userId })
    .from(table)
    .where(and(eq(proposal, proposalId), inArray(table.userId, others)));
  if (displaced.length === 0) return [];

  await db
    .delete(table)
    .where(and(eq(proposal, proposalId), inArray(table.userId, others)));
  return displaced.map(d => d.userId);
}

/**
 * Re-applies one-vote-per-group across a whole trip after somebody moves group.
 *
 * Moving a member into a group that has already voted leaves that group holding
 * two votes, and **nothing on screen says so**: the count is plausible, the
 * score is plausible, and the only symptom is that one family quietly carries
 * more weight than the others. The vote that survives is the most recently
 * updated one; the caller records what was dropped.
 */
export async function reconcileGroupVotes(tripId: number): Promise<
  Array<{
    proposalType: VotableProposalType;
    proposalId: number;
    userId: number;
  }>
> {
  const db = await getDb();
  if (!db) return [];

  const trip = await getTrip(tripId);
  if (!trip || trip.votingUnit !== "group") return [];

  const members = await db
    .select({ userId: tripMembers.userId, groupId: tripMembers.groupId })
    .from(tripMembers)
    .where(eq(tripMembers.tripId, tripId));
  const groupOf = new Map(members.map(m => [m.userId, m.groupId]));

  const [dateIds, destIds, accIds, budgetIds] = await Promise.all([
    db
      .select({ id: dateProposals.id })
      .from(dateProposals)
      .where(eq(dateProposals.tripId, tripId)),
    db
      .select({ id: destinations.id })
      .from(destinations)
      .where(eq(destinations.tripId, tripId)),
    db
      .select({ id: accommodations.id })
      .from(accommodations)
      .where(eq(accommodations.tripId, tripId)),
    db
      .select({ id: budgetProposals.id })
      .from(budgetProposals)
      .where(eq(budgetProposals.tripId, tripId)),
  ]);

  const work: Array<[VotableProposalType, number[]]> = [
    ["date", dateIds.map(r => r.id)],
    ["destination", destIds.map(r => r.id)],
    ["accommodation", accIds.map(r => r.id)],
    ["budget", budgetIds.map(r => r.id)],
  ];

  const dropped: Array<{
    proposalType: VotableProposalType;
    proposalId: number;
    userId: number;
  }> = [];

  for (const [proposalType, proposalIds] of work) {
    if (proposalIds.length === 0) continue;
    const { table, proposal } = VOTE_TABLES[proposalType];
    const rows = await db
      .select()
      .from(table)
      .where(inArray(proposal, proposalIds));

    // Keyed by proposal and group; ungrouped members are never in contention
    // with anybody, so they are skipped entirely.
    const keep = new Map<string, { id: number; at: number }>();
    const losers: number[] = [];
    for (const row of rows) {
      const groupId = groupOf.get(row.userId);
      if (groupId == null) continue;
      const key = `${(row as { proposalId?: number; destinationId?: number; accommodationId?: number })[proposalType === "destination" ? "destinationId" : proposalType === "accommodation" ? "accommodationId" : "proposalId"]}:${groupId}`;
      const at = new Date(row.updatedAt ?? row.createdAt).getTime();
      const held = keep.get(key);
      if (!held) {
        keep.set(key, { id: row.id, at });
        continue;
      }
      const loser = at > held.at ? held.id : row.id;
      if (at > held.at) keep.set(key, { id: row.id, at });
      losers.push(loser);
      const lost = rows.find(r => r.id === loser);
      if (lost)
        dropped.push({
          proposalType,
          proposalId: Number(key.split(":")[0]),
          userId: lost.userId,
        });
    }

    if (losers.length) await db.delete(table).where(inArray(table.id, losers));
  }

  return dropped;
}

/**
 * How many things can vote on this trip: groups that have somebody in them,
 * plus accepted tripmates who are in none.
 *
 * Watchers are in neither mode's denominator — they cannot vote, so counting
 * them makes "3/5 voted" unreachable forever. Computed here, once, and returned
 * to the client rather than re-derived per screen: two derivations of one
 * number is how one screen says "2/4" while the next says "2/3".
 */
export async function getTripVoterCount(tripId: number): Promise<number> {
  const [trip, members] = await Promise.all([
    getTrip(tripId),
    getTripMembers(tripId),
  ]);
  const voters = members.filter(
    m => m.status === "accepted" && m.role !== "watcher"
  );
  if (!trip || trip.votingUnit !== "group") return voters.length;
  const groups = new Set(
    voters.filter(m => m.groupId != null).map(m => String(m.groupId))
  );
  return groups.size + voters.filter(m => m.groupId == null).length;
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
 * Just the votes on one proposal, whatever kind it is.
 *
 * The single-row getters (`getDateProposal`, `getDestination`, …) return the
 * proposal without its votes, and the finalise guard needs the votes and
 * nothing else. Reading the whole list of proposals to find one row's votes
 * was the alternative.
 */
export async function getProposalVotes(
  proposalType: "date" | "destination" | "accommodation" | "budget",
  proposalId: number
): Promise<Array<{ userId: number; vote: string }>> {
  const db = await getDb();
  if (!db) return [];
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
        : proposalType === "accommodation"
          ? await db
              .select()
              .from(accommodationVotes)
              .where(eq(accommodationVotes.accommodationId, proposalId))
          : await db
              .select()
              .from(budgetVotes)
              .where(eq(budgetVotes.proposalId, proposalId));
  return rows.map(r => ({ userId: r.userId, vote: r.vote as string }));
}

/**
 * Who voted on a proposal, how, and when — plus who has not.
 *
 * "3/6 voted" answers how many; the question people actually have is which
 * three, and who to chase. `updatedAt` is used rather than `createdAt` so a
 * changed vote reports when it changed.
 */
export async function getProposalVoters(
  proposalType: "date" | "destination" | "accommodation" | "budget",
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
        : proposalType === "accommodation"
          ? await db
              .select()
              .from(accommodationVotes)
              .where(eq(accommodationVotes.accommodationId, proposalId))
          : await db
              .select()
              .from(budgetVotes)
              .where(eq(budgetVotes.proposalId, proposalId));

  const [trip, members, groups] = await Promise.all([
    getTrip(tripId),
    getTripMembers(tripId),
    getTripGroups(tripId),
  ]);
  const accepted = members.filter(
    m => m.status === "accepted" && m.role !== "watcher"
  );
  const groupName = (groupId: number | null) =>
    groupId == null ? null : (groups.find(g => g.id === groupId)?.name ?? null);
  const votedIds = new Set(rows.map(r => r.userId));

  const voted = rows.map(r => {
    const member = accepted.find(m => m.userId === r.userId);
    return {
      userId: r.userId,
      name: member?.user?.name ?? null,
      group: groupName(member?.groupId ?? null),
      vote: r.vote as string,
      at: r.updatedAt ?? r.createdAt,
    };
  });

  // Who is holding this up. When the trip votes per group, a group that has
  // voted has voted — chasing the other adult in it is chasing nobody, so a
  // group with any vote in it is off the list entirely.
  const byGroup = trip?.votingUnit === "group";
  const groupsThatVoted = new Set(
    accepted
      .filter(m => votedIds.has(m.userId) && m.groupId != null)
      .map(m => m.groupId)
  );

  const notVoted = accepted
    .filter(m => {
      if (votedIds.has(m.userId)) return false;
      if (byGroup && m.groupId != null) return !groupsThatVoted.has(m.groupId);
      return true;
    })
    .map(m => ({
      userId: m.userId,
      name: m.user?.name ?? null,
      group: groupName(m.groupId),
    }));

  // In group mode the list is of groups, not people: naming both adults in one
  // family as outstanding reads as two chases for one decision.
  const dedupedNotVoted = byGroup
    ? notVoted.filter(
        (m, i) =>
          m.group === null || notVoted.findIndex(o => o.group === m.group) === i
      )
    : notVoted;

  return { voted, notVoted: dedupedNotVoted };
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
  "group.created",
  "group.renamed",
  "group.deleted",
  "group.member_assigned",
  "attendee.added",
  "attendee.moved",
  "attendee.removed",
  "vote.superseded",
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

// ---- Product measurement ----

/**
 * Records one product event. **Never throws**, for the same reason
 * `recordActivity` does not: measurement is not worth failing a member's
 * action over, and a beta that drops a trip because a metrics insert timed out
 * has measured itself into a worse product.
 *
 * The metadata is filtered through the contract in `shared/productEvents.ts`
 * before it goes near the database, so this function — not the eleven call
 * sites — is where the privacy promise is kept. A dropped field is logged at
 * warn: it means a call site and the contract disagree, which is a bug worth
 * seeing even though it is not worth raising.
 */
export async function recordProductEvent(entry: {
  event: ProductEvent;
  tripId?: number | null;
  actorUserId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { metadata, rejected } = sanitiseProductEventMetadata(
      entry.event,
      entry.metadata
    );
    if (rejected.length)
      log.warn("dropped product event metadata not in the contract", {
        event: entry.event,
        keys: rejected,
      });

    const db = await getDb();
    if (!db) return;
    await db.insert(productEvents).values({
      event: entry.event,
      tripId: entry.tripId ?? null,
      actorUserId: entry.actorUserId ?? null,
      metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    log.warn("failed to record product event", { event: entry.event, err });
  }
}

/**
 * The raw rows, newest first, for the queries in
 * `docs/runbooks/beta-metrics.md` when psql is not to hand. Nothing in the API
 * exposes this — measurement is read by whoever runs the beta, not by members.
 */
export async function getProductEvents(limit = 1000) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productEvents)
    .orderBy(desc(productEvents.occurredAt))
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
        // Re-inviting somebody as part of a family carries the group; an
        // ordinary re-invite passes null and clears a stale one, which is
        // right — the last invite is the one that describes the intent.
        groupId: data.groupId ?? null,
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

// ---- Contact groups ----

/**
 * A saved family in this owner's book, matched case-insensitively.
 *
 * The same shape as `findTripGroupByName`, and for the same reason: "the
 * Patels" and "The Patels" are one family, and letting both exist is how a
 * book ends up with two of everyone.
 */
export async function findContactGroupByName(
  ownerUserId: number,
  name: string
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contactGroups)
    .where(
      and(
        eq(contactGroups.ownerUserId, ownerUserId),
        sql`lower(${contactGroups.name}) = lower(${name.trim()})`
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createContactGroup(data: InsertContactGroup) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .insert(contactGroups)
    .values({ ...data, name: data.name.trim() })
    .returning({ id: contactGroups.id });
  return row.id;
}

/** Every saved family, each with its people. One query per table, not per group. */
export async function getContactGroups(ownerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  const groups = await db
    .select()
    .from(contactGroups)
    .where(eq(contactGroups.ownerUserId, ownerUserId))
    .orderBy(contactGroups.name);
  if (groups.length === 0) return [];
  const rows = await db
    .select()
    .from(contactGroupMembers)
    .where(
      inArray(
        contactGroupMembers.groupId,
        groups.map(g => g.id)
      )
    )
    .orderBy(contactGroupMembers.name);
  return groups.map(g => ({
    ...g,
    members: rows.filter(r => r.groupId === g.id),
  }));
}

/**
 * One saved family with its people — **or null when it is not this owner's**.
 *
 * The ownership check is in the query rather than left to the caller: this is
 * reached with an id from the browser, and a version that returned somebody
 * else's family would hand over their address book.
 */
export async function getContactGroupWithMembers(
  id: number,
  ownerUserId: number
) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(contactGroups)
    .where(
      and(eq(contactGroups.id, id), eq(contactGroups.ownerUserId, ownerUserId))
    )
    .limit(1);
  const group = rows[0];
  if (!group) return null;
  const members = await db
    .select()
    .from(contactGroupMembers)
    .where(eq(contactGroupMembers.groupId, id))
    .orderBy(contactGroupMembers.name);
  return { ...group, members };
}

export async function renameContactGroup(
  id: number,
  ownerUserId: number,
  name: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(contactGroups)
    .set({ name: name.trim() })
    .where(
      and(eq(contactGroups.id, id), eq(contactGroups.ownerUserId, ownerUserId))
    );
}

/**
 * Removes the saved family. **The contacts themselves stay** — this is a label
 * coming off, not people being deleted out of somebody's address book.
 */
export async function deleteContactGroup(id: number, ownerUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const owned = await db
    .select({ id: contactGroups.id })
    .from(contactGroups)
    .where(
      and(eq(contactGroups.id, id), eq(contactGroups.ownerUserId, ownerUserId))
    )
    .limit(1);
  if (!owned[0]) return;
  await db
    .delete(contactGroupMembers)
    .where(eq(contactGroupMembers.groupId, id));
  await db.delete(contactGroups).where(eq(contactGroups.id, id));
}

/** Scoped through the group's owner, so an id alone reaches nobody else's book. */
export async function removeContactGroupMember(
  id: number,
  ownerUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db
    .select({ id: contactGroupMembers.id })
    .from(contactGroupMembers)
    .innerJoin(contactGroups, eq(contactGroups.id, contactGroupMembers.groupId))
    .where(
      and(
        eq(contactGroupMembers.id, id),
        eq(contactGroups.ownerUserId, ownerUserId)
      )
    )
    .limit(1);
  if (!rows[0]) return;
  await db.delete(contactGroupMembers).where(eq(contactGroupMembers.id, id));
}

/**
 * Appends people to a saved family, skipping the ones already in it.
 *
 * `onConflictDoNothing` rather than a read-then-write, so saving the same
 * family twice in quick succession cannot land two copies of anybody — the
 * partial unique indexes in `0013_contact_groups.sql` are what it conflicts
 * against. Returns how many were actually new, so the screen can say
 * "3 added, 2 already saved" rather than claiming five.
 */
export async function addContactGroupMembers(
  groupId: number,
  rows: Array<Omit<InsertContactGroupMember, "groupId">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(contactGroupMembers)
    .values(
      rows.map(r => ({
        ...r,
        groupId,
        email: r.email ? r.email.trim().toLowerCase() : null,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: contactGroupMembers.id });
  return inserted.length;
}

// ---- Suggestion dismissals ----

/** The fingerprints this person has said no to on this trip. */
export async function getDismissedSuggestions(
  tripId: number,
  userId: number
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ fingerprint: suggestionDismissals.fingerprint })
    .from(suggestionDismissals)
    .where(
      and(
        eq(suggestionDismissals.tripId, tripId),
        eq(suggestionDismissals.userId, userId)
      )
    );
  return rows.map(r => r.fingerprint);
}

/** Idempotent, so dismissing twice is one row rather than two. */
export async function dismissSuggestion(data: InsertSuggestionDismissal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(suggestionDismissals).values(data).onConflictDoNothing();
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
 * Resolves a set of user ids to the fields a byline needs, in one query.
 *
 * The three proposal listings used to run a query per vote to do this, plus one
 * per proposal — a trip with 20 proposals and 6 members each was well over a
 * hundred round trips for one screen. They now collect the ids first and call
 * this once.
 *
 * The avatar rides along for the comment threads, which draw one. Widening this
 * beat a fourth near-copy of the same three lines; callers that only want the
 * name are unaffected.
 */
type Byline = { id: number; name: string | null; avatarUrl: string | null };

async function namesByUserId(ids: number[]): Promise<Map<number, Byline>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const byId = new Map<number, Byline>();
  if (unique.length === 0) return byId;
  const db = await getDb();
  if (!db) return byId;
  const rows = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
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

// ---- Budget proposals ----

export async function createBudgetProposal(data: InsertBudgetProposal) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db
    .insert(budgetProposals)
    .values(data)
    .returning({ id: budgetProposals.id });
  return result.id;
}

/**
 * Budget proposals with their votes, in the shape the proposal screens expect —
 * `proposer`, and a `votes` array whose entries carry a name.
 *
 * Deliberately the same shape as `getDestinations`, so
 * `projectProposalsForRole`, `scoreVotes` and `VotedCount` all work on a budget
 * without a special case.
 */
export async function getBudgetProposals(tripId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(budgetProposals)
    .where(eq(budgetProposals.tripId, tripId))
    .orderBy(desc(budgetProposals.createdAt));
  if (rows.length === 0) return [];

  const votes = await db
    .select()
    .from(budgetVotes)
    .where(
      inArray(
        budgetVotes.proposalId,
        rows.map(r => r.id)
      )
    );

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

export async function getBudgetProposal(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(budgetProposals)
    .where(eq(budgetProposals.id, id))
    .limit(1);
  return rows[0] || null;
}

export async function updateBudgetProposal(
  id: number,
  data: Partial<InsertBudgetProposal>
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(budgetProposals).set(data).where(eq(budgetProposals.id, id));
}

export async function deleteBudgetProposal(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(budgetVotes).where(eq(budgetVotes.proposalId, id));
  await db.delete(budgetProposals).where(eq(budgetProposals.id, id));
}

export async function voteBudgetProposal(data: InsertBudgetVote) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(budgetVotes)
    .where(
      and(
        eq(budgetVotes.proposalId, data.proposalId),
        eq(budgetVotes.userId, data.userId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(budgetVotes)
      .set({ vote: data.vote, updatedAt: new Date() })
      .where(eq(budgetVotes.id, existing[0].id));
    return;
  }
  await db.insert(budgetVotes).values(data);
}

export async function unvoteBudgetProposal(proposalId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(budgetVotes)
    .where(
      and(
        eq(budgetVotes.proposalId, proposalId),
        eq(budgetVotes.userId, userId)
      )
    );
}

export async function getMyBudgetVote(proposalId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(budgetVotes)
    .where(
      and(
        eq(budgetVotes.proposalId, proposalId),
        eq(budgetVotes.userId, userId)
      )
    )
    .limit(1);
  return row;
}

/**
 * Finalise or un-finalise a budget. **Exactly one at a time.**
 *
 * Budget follows dates, not places: a trip has several destinations and several
 * stays, but one answer to "how much are we spending". So this clears the trip
 * before setting one row — the `lockDateProposal` shape, not the
 * `setDestinationLock` one.
 */
export async function setBudgetLock(
  tripId: number,
  proposalId: number,
  locked: boolean,
  lockedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(budgetProposals)
    .set({ selected: false, lockedBy: null, lockedAt: null })
    .where(eq(budgetProposals.tripId, tripId));
  if (locked)
    await db
      .update(budgetProposals)
      .set({ selected: true, lockedBy, lockedAt: new Date() })
      .where(eq(budgetProposals.id, proposalId));
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

/** Scoped to the owner: a notification id is a guessable integer. */
export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
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

/**
 * A thread, scoped to the trip the caller was authorised against.
 *
 * `tripId` is part of the lookup rather than trusted from the caller: the
 * router checks the caller's role on *that* trip, so a thread belonging to
 * another trip must not come back even if its proposal id is guessed right.
 */
/**
 * A thread, with each comment marked as to whether the viewer has blocked its
 * author.
 *
 * Marked rather than removed. A thread with silent holes in it reads as lost
 * data — and the replies around a blocked comment still refer to it, so hiding
 * it outright makes the rest of the conversation harder to follow, not easier.
 * The client collapses these behind a reveal.
 */
export async function getComments(
  proposalType: "date" | "destination" | "accommodation" | "budget",
  proposalId: number,
  tripId: number,
  viewerUserId?: number
) {
  const db = await getDb();
  if (!db) return [];
  const comments = await db
    .select()
    .from(proposalComments)
    .where(
      and(
        eq(proposalComments.proposalType, proposalType),
        eq(proposalComments.proposalId, proposalId),
        eq(proposalComments.tripId, tripId)
      )
    )
    .orderBy(proposalComments.createdAt);
  if (comments.length === 0) return [];
  // One query for the whole thread rather than one per comment.
  const byId = await namesByUserId(comments.map(c => c.userId));
  const blocked = viewerUserId
    ? await getBlockedUserIds(viewerUserId)
    : new Set<number>();
  return comments.map(c => ({
    ...c,
    user: byId.get(c.userId) ?? null,
    blocked: blocked.has(c.userId),
  }));
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

// ---- Moderation: reports and blocks ----

/**
 * File a report, or leave the existing one alone.
 *
 * A unique index on `(reporterUserId, contentType, contentId)` makes reporting
 * the same thing twice one row, so the queue counts people rather than taps and
 * a double-tap is not an escalation. `onConflictDoNothing` is what turns that
 * index from an error into the intended no-op.
 */
export async function createContentReport(data: InsertContentReport) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .insert(contentReports)
    .values(data)
    .onConflictDoNothing()
    .returning({ id: contentReports.id });
  return row?.id ?? null;
}

/**
 * The moderation queue: open reports, oldest first, with the reporter named.
 *
 * Bounded because an unbounded admin screen is a screen that stops loading the
 * day it is most needed.
 */
export async function getOpenContentReports(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contentReports)
    .where(eq(contentReports.status, "open"))
    .orderBy(asc(contentReports.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const byId = await namesByUserId(rows.map(r => r.reporterUserId));
  return rows.map(r => ({
    ...r,
    reporter: byId.get(r.reporterUserId) ?? null,
  }));
}

/** How many reports are waiting, for the badge on the admin screen. */
export async function countOpenContentReports() {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentReports)
    .where(eq(contentReports.status, "open"));
  return row?.count ?? 0;
}

/** Close a report. `reviewedByUserId` is who closed it, not who reported it. */
export async function resolveContentReport(
  id: number,
  status: "actioned" | "dismissed",
  reviewedByUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db
    .update(contentReports)
    .set({ status, reviewedByUserId, reviewedAt: new Date() })
    .where(and(eq(contentReports.id, id), eq(contentReports.status, "open")))
    .returning({ id: contentReports.id });
  return Boolean(row);
}

/**
 * Block somebody. Idempotent, for the same reason reporting is: the unique
 * index on the pair means a second tap is not a second block.
 */
export async function createUserBlock(
  blockerUserId: number,
  blockedUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(userBlocks)
    .values({ blockerUserId, blockedUserId })
    .onConflictDoNothing();
}

export async function deleteUserBlock(
  blockerUserId: number,
  blockedUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerUserId, blockerUserId),
        eq(userBlocks.blockedUserId, blockedUserId)
      )
    );
}

/** Who this account has blocked, named, for the list on the profile screen. */
export async function getUserBlocks(blockerUserId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, blockerUserId))
    .orderBy(desc(userBlocks.createdAt));
  if (rows.length === 0) return [];
  const byId = await namesByUserId(rows.map(r => r.blockedUserId));
  return rows.map(r => ({ ...r, user: byId.get(r.blockedUserId) ?? null }));
}

/**
 * The set of accounts `userId` has blocked.
 *
 * A set of ids rather than rows: every caller is asking "is this person
 * blocked?" about a list of authors it already has.
 */
export async function getBlockedUserIds(userId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ blockedUserId: userBlocks.blockedUserId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerUserId, userId));
  return new Set(rows.map(r => r.blockedUserId));
}

/**
 * Whether either of two people has blocked the other.
 *
 * Symmetric on purpose, and only used to refuse *contact* — an invite, a
 * contact-book entry. Somebody who blocked you should not receive your
 * invitation, and somebody you blocked should not be able to put themselves in
 * front of you by sending one.
 */
export async function isBlockedEitherWay(a: number, b: number) {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerUserId, a), eq(userBlocks.blockedUserId, b)),
        and(eq(userBlocks.blockerUserId, b), eq(userBlocks.blockedUserId, a))
      )
    )
    .limit(1);
  return Boolean(row);
}

// ---- Billing ----

/**
 * What the store last told us about this account, or null for a free one.
 *
 * Null is the honest answer for "never subscribed" and for "this deployment has
 * no billing configured" alike, and both should behave the same way: free.
 */
export async function getSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Record what a webhook reported.
 *
 * Upserts on `userId`, because RevenueCat retries deliveries deliberately and
 * the same event arriving twice must be one row with the later state, not two
 * rows racing to be read.
 */
export async function upsertSubscription(data: InsertSubscription) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(subscriptions)
    .values(data)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        revenueCatId: data.revenueCatId ?? null,
        productId: data.productId,
        store: data.store,
        status: data.status,
        expiresAt: data.expiresAt ?? null,
        cancelledAt: data.cancelledAt ?? null,
        updatedAt: new Date(),
      },
    });
}

/**
 * How many trips this account is organising that are still being planned.
 *
 * Organising, not belonging to: being invited is free and unlimited. Finished
 * and abandoned trips do not count — the cap is on how much somebody is
 * planning at once, not on how much they have ever planned.
 */
export async function countActiveOrganisedTrips(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trips)
    .where(
      and(
        eq(trips.organizerId, userId),
        inArray(trips.status, [...ACTIVE_TRIP_STATUSES])
      )
    );
  return row?.count ?? 0;
}
