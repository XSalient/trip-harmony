#!/usr/bin/env tsx
/**
 * Seeds the marketing demo: three trips with people, votes, arguments and AI
 * mediation already in them.
 *
 *   pnpm seed:demo            seed a local database
 *   pnpm seed:demo --clean    remove the demo data again
 *   pnpm seed:demo --help     the flags, including the ones that unlock a
 *                             non-local target
 *
 * TypeScript rather than the `.mjs` the rest of `scripts/` uses, for the same
 * reason as `diagnose-listing-url.ts`: nothing in a deploy runs it, so it never
 * has to work before the toolchain is installed, and it gets to share the
 * schema types with the server instead of restating them.
 *
 * Two things it will not do. It will not write to a database it was not told
 * twice about — see `decideRun` in `demo/options.ts`. And it will not delete a
 * row it did not create: the reset is scoped to users whose `openId` carries
 * the demo prefix and trips whose invite code does, so a demo seeded into a
 * database with real trips in it can be removed without touching them.
 */

import { inArray, like, or } from "drizzle-orm";

import { config } from "../server/_core/env.js";
import * as db from "../server/db.js";
import { hashPassword } from "../server/routers/_shared.js";
import {
  accommodationVotes,
  accommodations,
  activityEvents,
  budgetItems,
  contacts,
  dateProposals,
  dateVotes,
  destinationVotes,
  destinations,
  itineraryDays,
  itineraryItems,
  memberPreferences,
  notifications,
  proposalComments,
  refereeMessages,
  tripInvites,
  tripMembers,
  trips,
  users,
  vibeItems,
  vibeVotes,
} from "../drizzle/schema.js";
import {
  DEFAULT_DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  DEMO_INVITE_CODE_PREFIX,
  DEMO_OPEN_ID_PREFIX,
  USAGE,
  UsageError,
  decideRun,
  parseArgs,
  type DemoOptions,
} from "./demo/options.js";
import {
  PEOPLE,
  PRIMARY_PERSON,
  TRIPS,
  type DemoComment,
  type DemoTrip,
  type DemoVote,
} from "./demo/story.js";

type Drizzle = NonNullable<Awaited<ReturnType<typeof db.getDb>>>;

const MS_PER_DAY = 86_400_000;

/** Everything is timed against one instant, so a run is internally consistent. */
const NOW = Date.now();

const daysAgo = (n: number) => new Date(NOW - n * MS_PER_DAY);
const inDays = (n: number) => new Date(NOW + n * MS_PER_DAY);

/** `YYYY-MM-DD` in UTC, which is what `itinerary_days.date` holds. */
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const emailFor = (mailbox: string) => `${mailbox}@${DEMO_EMAIL_DOMAIN}`;

function say(message = "") {
  process.stdout.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// Removing what a previous run left
// ---------------------------------------------------------------------------

/**
 * Deletes every row this script has ever created, and nothing else.
 *
 * Trips go through `deleteTripCascade`, which already knows the twenty-odd
 * child tables and is exercised by the app's own delete-trip path — a second
 * copy of that list here would be one to keep in step, and the copy that drifts
 * is the one that leaves orphans behind.
 */
async function clean(drizzleDb: Drizzle): Promise<{
  trips: number;
  people: number;
}> {
  const demoTrips = await drizzleDb
    .select({ id: trips.id })
    .from(trips)
    .where(like(trips.inviteCode, `${DEMO_INVITE_CODE_PREFIX}%`));

  for (const trip of demoTrips) {
    await db.deleteTripCascade(trip.id);
  }

  const demoUsers = await drizzleDb
    .select({ id: users.id })
    .from(users)
    .where(like(users.openId, `${DEMO_OPEN_ID_PREFIX}%`));
  const demoUserIds = demoUsers.map(u => u.id);

  if (demoUserIds.length) {
    // Rows keyed to a demo person rather than to a demo trip: an address book
    // entry, or a notification about a trip that has already gone.
    await drizzleDb
      .delete(contacts)
      .where(
        or(
          inArray(contacts.ownerUserId, demoUserIds),
          inArray(contacts.contactUserId, demoUserIds)
        )
      );
    await drizzleDb
      .delete(notifications)
      .where(inArray(notifications.userId, demoUserIds));
    await drizzleDb.delete(users).where(inArray(users.id, demoUserIds));
  }

  return { trips: demoTrips.length, people: demoUserIds.length };
}

// ---------------------------------------------------------------------------
// Writing the demo
// ---------------------------------------------------------------------------

/**
 * When a vote was cast, when the fixture hasn't said.
 *
 * Votes that all landed on the same timestamp read as a fixture; votes spread
 * over the days after a proposal read as a group. Deterministic, so two runs of
 * the seeder produce the same demo.
 */
function voteCastAt(proposalCreatedDaysAgo: number, index: number): Date {
  const offset = Math.max(0.15, proposalCreatedDaysAgo - 0.4 - index * 0.55);
  return daysAgo(offset);
}

interface VoteTiming {
  createdAt: Date;
  updatedAt: Date;
}

function voteTiming<V extends string>(
  vote: DemoVote<V>,
  proposalCreatedDaysAgo: number,
  index: number
): VoteTiming {
  const createdAt =
    vote.daysAgo !== undefined
      ? daysAgo(vote.daysAgo)
      : voteCastAt(proposalCreatedDaysAgo, index);
  return {
    createdAt,
    updatedAt:
      vote.changedDaysAgo !== undefined
        ? daysAgo(vote.changedDaysAgo)
        : createdAt,
  };
}

/** Resolves person keys to the user ids the current run created. */
type People = Map<string, number>;

function idOf(people: People, key: string): number {
  const id = people.get(key);
  if (id === undefined) {
    throw new Error(
      `The demo story references a person "${key}" who is not in PEOPLE.`
    );
  }
  return id;
}

async function seedPeople(
  drizzleDb: Drizzle,
  passwordHash: string
): Promise<People> {
  const people: People = new Map();

  for (const [index, person] of PEOPLE.entries()) {
    const [row] = await drizzleDb
      .insert(users)
      .values({
        openId: `${DEMO_OPEN_ID_PREFIX}${person.key}`,
        name: person.name,
        email: emailFor(person.mailbox),
        passwordHash,
        loginMethod: "email",
        role: "user",
        createdAt: daysAgo(340),
        updatedAt: daysAgo(340),
        // Staggered rather than random: two runs of the seeder have to produce
        // the same demo, or a re-recorded screencast disagrees with the last one.
        lastSignedIn: daysAgo(0.3 + (index % 5) * 0.7),
      })
      .returning({ id: users.id });
    people.set(person.key, row.id);
  }

  // An address book for the account a walkthrough signs in as, so the invite
  // picker on the members screen has something in it.
  const owner = idOf(people, PRIMARY_PERSON);
  for (const key of ["marcus", "priya", "tomas", "hannah", "dev", "yuki"]) {
    const person = PEOPLE.find(p => p.key === key)!;
    await drizzleDb.insert(contacts).values({
      ownerUserId: owner,
      name: person.name,
      email: emailFor(person.mailbox),
      contactUserId: idOf(people, key),
      createdAt: daysAgo(300),
    });
  }

  return people;
}

/**
 * One trip, and everything hanging off it.
 *
 * Activity events are derived from the rest rather than listed in the fixture:
 * a proposal implies "created", a vote implies "cast", a lock implies
 * "locked". Hand-writing them would let the trail and the data disagree, and
 * the trail is the thing that answers "when did this change?".
 */
async function seedTrip(
  drizzleDb: Drizzle,
  people: People,
  trip: DemoTrip
): Promise<{ tripId: number; counts: Record<string, number> }> {
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  const activity: (typeof activityEvents.$inferInsert)[] = [];
  const record = (
    actorKey: string,
    action: string,
    createdAt: Date,
    entity?: { type: string; id: number },
    metadata?: Record<string, unknown>
  ) => {
    activity.push({
      tripId: 0, // patched once the trip id is known
      actorUserId: idOf(people, actorKey),
      action,
      entityType: entity?.type,
      entityId: entity?.id,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt,
    });
  };

  const [tripRow] = await drizzleDb
    .insert(trips)
    .values({
      name: trip.name,
      description: trip.description,
      coverImage: trip.coverImage,
      organizerId: idOf(people, trip.organizer),
      inviteCode: trip.inviteCode,
      phase: trip.phase,
      status: trip.status,
      startDate:
        trip.startsInDays !== undefined ? inDays(trip.startsInDays) : null,
      endDate: trip.endsInDays !== undefined ? inDays(trip.endsInDays) : null,
      currency: trip.currency,
      totalBudget: trip.totalBudget,
      createdAt: daysAgo(trip.createdDaysAgo),
      updatedAt: daysAgo(Math.max(0.1, trip.createdDaysAgo - 30)),
    })
    .returning({ id: trips.id });
  const tripId = tripRow.id;

  // --- Members, invites, preferences ---------------------------------------

  for (const member of trip.members) {
    await drizzleDb.insert(tripMembers).values({
      tripId,
      userId: idOf(people, member.person),
      role: member.role,
      status: member.status,
      budgetMax: member.budgetMax,
      invitedBy: member.invitedBy ? idOf(people, member.invitedBy) : null,
      joinedVia: member.joinedVia,
      respondedAt:
        member.respondedDaysAgo !== undefined
          ? daysAgo(member.respondedDaysAgo)
          : null,
      joinedAt: daysAgo(member.joinedDaysAgo),
    });
    bump("members");

    if (member.invitedBy) {
      record(
        member.invitedBy,
        "member.invited",
        daysAgo(member.joinedDaysAgo),
        {
          type: "member",
          id: idOf(people, member.person),
        }
      );
    }
    if (member.respondedDaysAgo !== undefined) {
      record(
        member.person,
        member.status === "declined" ? "member.declined" : "member.joined",
        daysAgo(member.respondedDaysAgo),
        { type: "member", id: idOf(people, member.person) }
      );
    }
  }

  for (const invite of trip.pendingInvites ?? []) {
    await drizzleDb.insert(tripInvites).values({
      tripId,
      email: emailFor(invite.mailbox),
      role: invite.role,
      invitedBy: idOf(people, invite.invitedBy),
      // Namespaced like everything else, and long enough to look like the real
      // nanoid tokens without being mistaken for one that works.
      token: `demo-${trip.key}-${invite.mailbox}-invite`,
      status: "pending",
      sentAt: daysAgo(invite.daysAgo),
    });
    bump("invites");
    record(invite.invitedBy, "member.invited", daysAgo(invite.daysAgo));
  }

  for (const preference of trip.preferences ?? []) {
    const rawText = JSON.stringify({
      mustHaves: preference.mustHaves,
      strongPreferences: preference.strongPreferences,
      avoids: preference.avoids,
      openComments: preference.openComments,
    });
    await drizzleDb.insert(memberPreferences).values({
      tripId,
      userId: idOf(people, preference.person),
      category: "general",
      rawText,
      // `saveTripPreferences` stores the same JSON in both columns; matching it
      // keeps the demo readable by the code that reads real data.
      attributes: rawText,
      createdAt: daysAgo(preference.savedDaysAgo),
      updatedAt: daysAgo(preference.savedDaysAgo),
    });
    bump("preferences");
    record(
      preference.person,
      "preferences.saved",
      daysAgo(preference.savedDaysAgo)
    );
  }

  // --- Comments, shared by all three proposal types -------------------------

  const seedComments = async (
    proposalType: "date" | "destination" | "accommodation",
    proposalId: number,
    comments: DemoComment[] | undefined
  ) => {
    for (const comment of comments ?? []) {
      await drizzleDb.insert(proposalComments).values({
        proposalType,
        proposalId,
        tripId,
        userId: idOf(people, comment.person),
        content: comment.body,
        createdAt: daysAgo(comment.daysAgo),
      });
      bump("comments");
      record(comment.person, "comment.added", daysAgo(comment.daysAgo), {
        type: proposalType,
        id: proposalId,
      });
    }
  };

  // --- Dates ---------------------------------------------------------------

  for (const proposal of trip.dateProposals ?? []) {
    const [row] = await drizzleDb
      .insert(dateProposals)
      .values({
        tripId,
        proposedBy: idOf(people, proposal.proposedBy),
        startDate: inDays(proposal.startsInDays),
        endDate: inDays(proposal.endsInDays),
        label: proposal.label,
        selected: proposal.selected ?? false,
        lockedBy: proposal.lockedBy ? idOf(people, proposal.lockedBy) : null,
        lockedAt:
          proposal.lockedDaysAgo !== undefined
            ? daysAgo(proposal.lockedDaysAgo)
            : null,
        createdAt: daysAgo(proposal.createdDaysAgo),
      })
      .returning({ id: dateProposals.id });
    bump("dateProposals");
    record(
      proposal.proposedBy,
      "proposal.created",
      daysAgo(proposal.createdDaysAgo),
      { type: "date", id: row.id },
      { label: proposal.label }
    );
    if (proposal.lockedBy && proposal.lockedDaysAgo !== undefined) {
      record(
        proposal.lockedBy,
        "proposal.locked",
        daysAgo(proposal.lockedDaysAgo),
        {
          type: "date",
          id: row.id,
        }
      );
    }

    for (const [index, vote] of proposal.votes.entries()) {
      const timing = voteTiming(vote, proposal.createdDaysAgo, index);
      await drizzleDb.insert(dateVotes).values({
        proposalId: row.id,
        userId: idOf(people, vote.person),
        vote: vote.vote,
        ...timing,
      });
      bump("votes");
      record(vote.person, "vote.cast", timing.createdAt, {
        type: "date",
        id: row.id,
      });
      if (vote.changedDaysAgo !== undefined) {
        record(vote.person, "vote.changed", timing.updatedAt, {
          type: "date",
          id: row.id,
        });
      }
    }

    await seedComments("date", row.id, proposal.comments);
  }

  // --- Destinations --------------------------------------------------------

  for (const destination of trip.destinations ?? []) {
    const [row] = await drizzleDb
      .insert(destinations)
      .values({
        tripId,
        name: destination.name,
        description: destination.description,
        imageUrl: destination.imageUrl,
        vibes: JSON.stringify(destination.vibes),
        estimatedCost: destination.estimatedCost,
        proposedBy: idOf(people, destination.proposedBy),
        selected: destination.selected ?? false,
        lockedBy: destination.lockedBy
          ? idOf(people, destination.lockedBy)
          : null,
        lockedAt:
          destination.lockedDaysAgo !== undefined
            ? daysAgo(destination.lockedDaysAgo)
            : null,
        createdAt: daysAgo(destination.createdDaysAgo),
      })
      .returning({ id: destinations.id });
    bump("destinations");
    record(
      destination.proposedBy,
      "proposal.created",
      daysAgo(destination.createdDaysAgo),
      { type: "destination", id: row.id },
      { name: destination.name }
    );
    if (destination.lockedBy && destination.lockedDaysAgo !== undefined) {
      record(
        destination.lockedBy,
        "proposal.locked",
        daysAgo(destination.lockedDaysAgo),
        { type: "destination", id: row.id }
      );
    }

    for (const [index, vote] of destination.votes.entries()) {
      const timing = voteTiming(vote, destination.createdDaysAgo, index);
      await drizzleDb.insert(destinationVotes).values({
        destinationId: row.id,
        userId: idOf(people, vote.person),
        vote: vote.vote,
        ...timing,
      });
      bump("votes");
      record(vote.person, "vote.cast", timing.createdAt, {
        type: "destination",
        id: row.id,
      });
    }

    await seedComments("destination", row.id, destination.comments);
  }

  // --- Accommodations ------------------------------------------------------

  for (const stay of trip.accommodations ?? []) {
    const [row] = await drizzleDb
      .insert(accommodations)
      .values({
        tripId,
        name: stay.name,
        description: stay.description,
        imageUrl: stay.imageUrl,
        pricePerNight: stay.pricePerNight,
        totalPrice: stay.totalPrice,
        perPersonCost: stay.perPersonCost,
        bedrooms: stay.bedrooms,
        bathrooms: stay.bathrooms,
        singleBeds: stay.singleBeds,
        doubleBeds: stay.doubleBeds,
        toilets: stay.toilets,
        ensuites: stay.ensuites,
        freeParking: stay.freeParking ?? false,
        camperParking: stay.camperParking ?? false,
        amenities: stay.amenities,
        location: stay.location,
        link: stay.link,
        comfortScore: stay.comfortScore,
        matchAnalysis: stay.match ? JSON.stringify(stay.match) : null,
        matchAnalysedAt:
          stay.match && stay.matchAnalysedDaysAgo !== undefined
            ? daysAgo(stay.matchAnalysedDaysAgo)
            : null,
        proposedBy: idOf(people, stay.proposedBy),
        selected: stay.selected ?? false,
        lockedBy: stay.lockedBy ? idOf(people, stay.lockedBy) : null,
        lockedAt:
          stay.lockedDaysAgo !== undefined ? daysAgo(stay.lockedDaysAgo) : null,
        createdAt: daysAgo(stay.createdDaysAgo),
      })
      .returning({ id: accommodations.id });
    bump("accommodations");
    record(
      stay.proposedBy,
      "proposal.created",
      daysAgo(stay.createdDaysAgo),
      { type: "accommodation", id: row.id },
      { name: stay.name }
    );
    if (stay.match && stay.matchAnalysedDaysAgo !== undefined) {
      record(
        trip.organizer,
        "ai.match_refreshed",
        daysAgo(stay.matchAnalysedDaysAgo),
        { type: "accommodation", id: row.id },
        { groupFitScore: stay.match.groupFitScore }
      );
    }
    if (stay.lockedBy && stay.lockedDaysAgo !== undefined) {
      record(stay.lockedBy, "proposal.locked", daysAgo(stay.lockedDaysAgo), {
        type: "accommodation",
        id: row.id,
      });
    }

    for (const [index, vote] of stay.votes.entries()) {
      const timing = voteTiming(vote, stay.createdDaysAgo, index);
      await drizzleDb.insert(accommodationVotes).values({
        accommodationId: row.id,
        userId: idOf(people, vote.person),
        vote: vote.vote,
        ...timing,
      });
      bump("votes");
      record(vote.person, "vote.cast", timing.createdAt, {
        type: "accommodation",
        id: row.id,
      });
      if (vote.changedDaysAgo !== undefined) {
        record(vote.person, "vote.changed", timing.updatedAt, {
          type: "accommodation",
          id: row.id,
        });
      }
    }

    await seedComments("accommodation", row.id, stay.comments);
  }

  // --- Budget, referee, vibe board -----------------------------------------

  for (const item of trip.budget ?? []) {
    await drizzleDb.insert(budgetItems).values({
      tripId,
      category: item.category,
      description: item.description,
      amount: item.amount,
      currency: trip.currency,
      paidBy: idOf(people, item.paidBy),
      splitType: item.splitType ?? "equal",
      approved: item.approved ?? false,
      createdAt: daysAgo(item.daysAgo),
    });
    bump("budgetItems");
  }

  for (const message of trip.referee ?? []) {
    await drizzleDb.insert(refereeMessages).values({
      tripId,
      phase: message.phase,
      messageType: message.messageType,
      content: message.content,
      createdAt: daysAgo(message.daysAgo),
    });
    bump("refereeMessages");
    record(trip.organizer, "ai.referee_run", daysAgo(message.daysAgo), {
      type: "trip",
      id: tripId,
    });
  }

  for (const item of trip.vibe ?? []) {
    const [row] = await drizzleDb
      .insert(vibeItems)
      .values({
        tripId,
        proposedBy: idOf(people, item.proposedBy),
        url: item.url,
        title: item.title,
        description: item.description,
        imageUrl: item.imageUrl,
        tags: JSON.stringify(item.tags),
        createdAt: daysAgo(item.daysAgo),
      })
      .returning({ id: vibeItems.id });
    bump("vibeItems");

    for (const [index, vote] of item.votes.entries()) {
      await drizzleDb.insert(vibeVotes).values({
        vibeItemId: row.id,
        userId: idOf(people, vote.person),
        vote: vote.vote,
        createdAt: voteTiming(vote, item.daysAgo, index).createdAt,
      });
      bump("votes");
    }
  }

  // --- Itinerary -----------------------------------------------------------

  if (trip.itinerary?.length && trip.startsInDays !== undefined) {
    for (const [dayIndex, day] of trip.itinerary.entries()) {
      const [dayRow] = await drizzleDb
        .insert(itineraryDays)
        .values({
          tripId,
          date: isoDate(inDays(trip.startsInDays + day.dayOffset)),
          title: day.title,
          notes: day.notes,
          sortOrder: dayIndex,
          createdAt: daysAgo(Math.max(0.5, trip.createdDaysAgo - 20)),
        })
        .returning({ id: itineraryDays.id });
      bump("itineraryDays");

      for (const [itemIndex, item] of day.items.entries()) {
        await drizzleDb.insert(itineraryItems).values({
          dayId: dayRow.id,
          tripId,
          time: item.time,
          title: item.title,
          description: item.description,
          location: item.location,
          type: item.type,
          cost: item.cost,
          addedBy: idOf(people, item.addedBy),
          sortOrder: itemIndex,
          createdAt: daysAgo(Math.max(0.5, trip.createdDaysAgo - 20)),
        });
        bump("itineraryItems");
      }
    }
  }

  // --- Notifications -------------------------------------------------------

  for (const note of trip.notifications ?? []) {
    await drizzleDb.insert(notifications).values({
      userId: idOf(people, note.person),
      tripId,
      type: note.type,
      title: note.title,
      message: note.message,
      read: note.read ?? false,
      actionUrl: `/trips/${tripId}${note.path ?? ""}`,
      createdAt: daysAgo(note.daysAgo),
    });
    bump("notifications");
  }

  // --- The derived trail ---------------------------------------------------

  if (activity.length) {
    await drizzleDb
      .insert(activityEvents)
      .values(activity.map(event => ({ ...event, tripId })));
    bump("activityEvents", activity.length);
  }

  return { tripId, counts };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  let options: DemoOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      say(`${error.message}\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (options.help) {
    say(USAGE);
    return;
  }

  const decision = decideRun(
    { appEnv: config.appEnv, databaseUrl: config.db.url },
    options
  );
  if (!decision.allowed) {
    say(`Refusing to run.\n\n${decision.reason}`);
    process.exitCode = 1;
    return;
  }

  const drizzleDb = await db.getDb();
  if (!drizzleDb) {
    say(
      "Could not open a connection to the database. `server/_core/env.ts` " +
        "resolved a URL but the pool would not start — check the host is up."
    );
    process.exitCode = 1;
    return;
  }

  say(
    `Target: ${decision.host ?? "unknown host"} (${config.db.source}), APP_ENV=${config.appEnv}`
  );

  const removed = await clean(drizzleDb);
  if (removed.trips || removed.people) {
    say(
      `Removed the previous demo: ${removed.trips} trips, ${removed.people} people.`
    );
  }

  if (options.mode === "clean") {
    say("Done. Nothing was created.");
    return;
  }

  const passwordHash = await hashPassword(options.password);
  const people = await seedPeople(drizzleDb, passwordHash);

  const totals: Record<string, number> = {};
  const seeded: { name: string; id: number }[] = [];
  for (const trip of TRIPS) {
    const { tripId, counts } = await seedTrip(drizzleDb, people, trip);
    seeded.push({ name: trip.name, id: tripId });
    for (const [key, value] of Object.entries(counts)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const primary = PEOPLE.find(p => p.key === PRIMARY_PERSON)!;

  say();
  say(`Seeded ${seeded.length} trips and ${PEOPLE.length} people:`);
  for (const trip of seeded) {
    say(`  /trips/${trip.id}  ${trip.name}`);
  }
  say();
  for (const [key, value] of Object.entries(totals).sort()) {
    say(`  ${String(value).padStart(4)}  ${key}`);
  }
  say();
  say("Sign in as:");
  say(`  ${emailFor(primary.mailbox)}`);
  say(`  ${options.password}`);
  if (options.password === DEFAULT_DEMO_PASSWORD) {
    say("  (the default — every seeded account shares it)");
  }
  say();
  say("Re-run to reset the demo to this state. `--clean` removes it.");
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    say(`Seeding failed: ${error instanceof Error ? error.stack : error}`);
    process.exit(1);
  });
