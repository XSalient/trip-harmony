/**
 * A user's private address book, so a friend's email is typed once ever.
 *
 * Saving a contact grants nothing. Inviting one still sends an email and still
 * waits for them to accept — the alternative would be a way to add people to
 * trips without their agreement.
 */
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";
import { originOf, sendInvite } from "../utils/tripInvite.js";
import { TRIP_ROLES, type TripRole } from "../../shared/roles.js";

const roleInput = z.enum(TRIP_ROLES);

type ContactGroupPerson = {
  id: number;
  name: string;
  email: string | null;
  contactId: number | null;
  kind: "adult" | "child" | "pet";
  age: number | null;
};

type TripMemberish = {
  userId: number;
  status: string;
  groupId: number | null;
  user?: { name?: string | null; email?: string | null } | null;
};

/**
 * What importing this saved family into this trip would do — and what it would
 * disturb.
 *
 * Pure, and separate from the procedure, because it is run **twice**: once to
 * show the person what is about to happen, once to do it. A preview computed
 * by different code from the action it previews is a preview that lies, and
 * the thing it would lie about here is whose family somebody is about to be
 * moved out of.
 *
 * A **conflict** is somebody already on this trip in a *different* group.
 * Importing them means taking them out of the family they are currently
 * recorded in — which is a real change to somebody else's plan, and can drop
 * their votes when the groups reconcile — so it is never done silently.
 * Somebody already in the target group, or on the trip in no group at all, is
 * not a conflict: nothing is being taken away from them.
 */
export function planImport(
  people: ContactGroupPerson[],
  members: TripMemberish[],
  targetGroupId: number | null
) {
  const accepted = members.filter(m => m.status === "accepted");
  const byEmail = new Map(
    accepted
      .filter(m => m.user?.email)
      .map(m => [String(m.user!.email).trim().toLowerCase(), m])
  );

  const conflicts: Array<{
    userId: number;
    name: string;
    currentGroupId: number;
  }> = [];
  const willMove: Array<{ userId: number; name: string }> = [];
  const willInvite: Array<{ name: string; email: string }> = [];
  const willAddAttendees: ContactGroupPerson[] = [];
  const alreadyInThisGroup: Array<{ userId: number; name: string }> = [];

  for (const person of people) {
    const email = person.email?.trim().toLowerCase();
    const member = email ? byEmail.get(email) : undefined;

    if (!member) {
      // No account on this trip. With an address they get an invite; without
      // one they are a child or a pet, and become an attendee.
      if (email) willInvite.push({ name: person.name, email });
      else willAddAttendees.push(person);
      continue;
    }

    const name = member.user?.name || person.name;
    if (targetGroupId != null && member.groupId === targetGroupId) {
      alreadyInThisGroup.push({ userId: member.userId, name });
    } else if (member.groupId != null && member.groupId !== targetGroupId) {
      conflicts.push({
        userId: member.userId,
        name,
        currentGroupId: member.groupId,
      });
    } else {
      willMove.push({ userId: member.userId, name });
    }
  }

  return {
    conflicts,
    willMove,
    willInvite,
    willAddAttendees,
    alreadyInThisGroup,
  };
}

export const contactsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getContacts(ctx.user.id);
  }),
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Link to a real account when the address has one, so the picker can say
      // "already on this trip" instead of offering a duplicate invite.
      const existingUser = await db.getUserByEmail(
        input.email.trim().toLowerCase()
      );
      // Blocking is a refusal to be contacted; keeping somebody's card in an
      // address book is the first half of contacting them.
      if (
        existingUser &&
        (await db.isBlockedEitherWay(ctx.user.id, existingUser.id))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can't add this person to your contacts.",
        });
      }
      const id = await db.addContact({
        ownerUserId: ctx.user.id,
        name: input.name,
        email: input.email,
        contactUserId: existingUser?.id ?? null,
      });
      return { id };
    }),
  /**
   * Saves someone you are already on a trip with.
   *
   * The book used to fill up only as a side effect of sending an email invite,
   * so the people you had actually travelled with were the ones missing from
   * it — anyone who joined by following the shared link left no trace, and
   * inviting them to the next trip meant asking for an address you had been
   * looking at all week.
   *
   * The address comes from the membership rather than from the caller, which
   * is the point: this endpoint is reachable by every tripmate, and one that
   * took an email as input would let any of them write an arbitrary address
   * into their book under a trusted-looking "add from trip" action. Tripmate
   * and above, because a watcher is never shown member emails at all
   * (`projectMembersForRole`) and must not get one back through here.
   */
  addFromTrip: protectedProcedure
    .input(z.object({ tripId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That's you.",
        });

      const member = await db.getTripMember(input.tripId, input.userId);
      if (!member || member.status !== "accepted")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person isn't on this trip.",
        });

      const user = await db.getUserById(input.userId);
      if (!user?.email)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That member has no email address on their account, so there is nothing to save.",
        });

      const id = await db.addContact({
        ownerUserId: ctx.user.id,
        name: user.name || user.email,
        email: user.email,
        contactUserId: user.id,
      });
      return { id, name: user.name || user.email, email: user.email };
    }),
  // ---- Saved families ----

  /** The caller's own book. Scoped by owner in the query, never by argument. */
  groups: protectedProcedure.query(async ({ ctx }) => {
    return db.getContactGroups(ctx.user.id);
  }),

  createGroup: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const clash = await db.findContactGroupByName(ctx.user.id, input.name);
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a group called "${clash.name}".`,
        });
      const id = await db.createContactGroup({
        ownerUserId: ctx.user.id,
        name: input.name,
      });
      return { id };
    }),

  renameGroup: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const clash = await db.findContactGroupByName(ctx.user.id, input.name);
      if (clash && clash.id !== input.id)
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a group called "${clash.name}".`,
        });
      await db.renameContactGroup(input.id, ctx.user.id, input.name);
      return { success: true };
    }),

  /** Removes the saved family. The contacts in it stay in the book. */
  removeGroup: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteContactGroup(input.id, ctx.user.id);
      return { success: true };
    }),

  removeGroupMember: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.removeContactGroupMember(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Saves a group from a trip into the book, with everybody in it.
   *
   * Tripmate and above, for the reason `addFromTrip` exists: a watcher is
   * never shown member email addresses and must not collect them through here.
   * Addresses come from the memberships rather than from the caller, so this
   * cannot be used to write arbitrary addresses into a book under a
   * trusted-looking action.
   *
   * Saving the same family again **appends** the people who are new. A second
   * "The Patels" is the failure this replaces.
   */
  saveGroupFromTrip: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        groupId: z.number(),
        name: z.string().min(1).max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const group = await db.getTripGroup(input.groupId);
      if (!group || group.tripId !== input.tripId)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found on this trip.",
        });

      const name = (input.name ?? group.name).trim();
      const existing = await db.findContactGroupByName(ctx.user.id, name);
      const contactGroupId =
        existing?.id ??
        (await db.createContactGroup({ ownerUserId: ctx.user.id, name }));

      const [members, attendees] = await Promise.all([
        db.getTripMembers(input.tripId),
        db.getTripAttendees(input.tripId),
      ]);

      const rows: Array<{
        contactId: number | null;
        name: string;
        email: string | null;
        kind: "adult" | "child" | "pet";
        age: number | null;
      }> = [];

      for (const m of members) {
        if (m.status !== "accepted" || m.groupId !== group.id) continue;
        if (m.userId === ctx.user.id) continue; // Your own book, not your own row.
        const email = m.user?.email;
        if (!email) continue;
        // Through the existing upsert, so the address book and the saved
        // family agree about who somebody is.
        const contactId = await db.addContact({
          ownerUserId: ctx.user.id,
          name: m.user?.name || email,
          email,
          contactUserId: m.userId,
        });
        rows.push({
          contactId,
          name: m.user?.name || email,
          email,
          kind: "adult",
          age: null,
        });
      }

      for (const a of attendees) {
        // Members are already above, through their membership; an attendee row
        // that stands for one would save the same person twice.
        if (a.groupId !== group.id || a.memberUserId != null) continue;
        rows.push({
          contactId: null,
          name: a.name,
          email: null,
          kind: a.kind,
          age: a.age,
        });
      }

      const added = await db.addContactGroupMembers(contactGroupId, rows);
      return {
        id: contactGroupId,
        name,
        added,
        alreadyThere: rows.length - added,
      };
    }),

  /**
   * Adds a saved family to a trip — after saying what that would disturb.
   *
   * Called twice for one import. With `confirm: false` it **writes nothing**
   * and returns the plan, including anybody already on the trip in a different
   * group; with `confirm: true` it carries that plan out. Both come from the
   * same `planImport`, so the preview cannot describe something other than
   * what happens.
   *
   * The role rule is `trips.sendInviteEmail`'s, deliberately identical:
   * importing people as tripmates grows the voting group, so it stays
   * admin-only, and a tripmate importing a family brings them in as watchers.
   */
  importGroupToTrip: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        contactGroupId: z.number(),
        role: roleInput.default("tripmate"),
        targetGroupName: z.string().min(1).max(120).optional(),
        confirm: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      if (input.role !== "watcher")
        await requireTripRole(input.tripId, ctx.user.id, "admin");

      const saved = await db.getContactGroupWithMembers(
        input.contactGroupId,
        ctx.user.id
      );
      if (!saved)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That group isn't in your contacts.",
        });

      const trip = await db.getTrip(input.tripId);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      const groupName = (input.targetGroupName ?? saved.name).trim();
      const [members, existingGroup, tripGroups] = await Promise.all([
        db.getTripMembers(input.tripId),
        db.findTripGroupByName(input.tripId, groupName),
        db.getTripGroups(input.tripId),
      ]);

      const plan = planImport(
        saved.members,
        members,
        existingGroup?.id ?? null
      );
      const nameOfGroup = (id: number) =>
        tripGroups.find(g => g.id === id)?.name ?? "another group";
      const conflicts = plan.conflicts.map(c => ({
        ...c,
        currentGroupName: nameOfGroup(c.currentGroupId),
      }));

      if (!input.confirm) {
        return {
          confirmed: false as const,
          groupName,
          groupExists: Boolean(existingGroup),
          conflicts,
          willMove: plan.willMove,
          willInvite: plan.willInvite,
          willAddAttendees: plan.willAddAttendees.map(a => ({
            name: a.name,
            kind: a.kind,
          })),
          alreadyInThisGroup: plan.alreadyInThisGroup,
        };
      }

      const groupId =
        existingGroup?.id ??
        (await db.createTripGroup({ tripId: input.tripId, name: groupName }));
      if (!existingGroup)
        await db.recordActivity({
          tripId: input.tripId,
          actorUserId: ctx.user.id,
          action: "group.created",
          entityType: "group",
          entityId: groupId,
          metadata: { name: groupName, from: "contacts" },
        });

      // Conflicts move too — the caller has just been shown them by name and
      // said yes. That is what the confirmation was for.
      for (const m of [...plan.willMove, ...plan.conflicts]) {
        await db.setMemberGroup(input.tripId, m.userId, groupId);
        await db.recordActivity({
          tripId: input.tripId,
          actorUserId: ctx.user.id,
          action: "group.member_assigned",
          entityType: "group",
          entityId: groupId,
          metadata: { userId: m.userId, from: "contacts" },
        });
      }

      // Once, after every move — not per person, which would sweep the whole
      // trip five times to import a family of five.
      const dropped = await db.reconcileGroupVotes(input.tripId);
      for (const d of dropped) {
        await db.recordActivity({
          tripId: input.tripId,
          actorUserId: ctx.user.id,
          action: "vote.superseded",
          entityType: d.proposalType,
          entityId: d.proposalId,
          metadata: { userId: d.userId, reason: "regrouped" },
        });
      }

      for (const a of plan.willAddAttendees) {
        await db.createTripAttendee({
          tripId: input.tripId,
          groupId,
          name: a.name,
          kind: a.kind,
          age: a.kind === "pet" ? null : a.age,
        });
      }

      const origin = originOf(ctx.req);
      const failed: string[] = [];
      for (const person of plan.willInvite) {
        const { delivered } = await sendInvite({
          trip,
          email: person.email,
          role: input.role as TripRole,
          groupId,
          invitedBy: ctx.user.id,
          inviterName: ctx.user.name || "Someone",
          origin,
          // One bad address must not lose the other four.
          throwOnFailure: false,
        });
        if (!delivered) failed.push(person.email);
      }

      return {
        confirmed: true as const,
        groupId,
        groupName,
        moved: plan.willMove.length + plan.conflicts.length,
        invited: plan.willInvite.length,
        attendeesAdded: plan.willAddAttendees.length,
        votesSuperseded: dropped.length,
        undelivered: failed,
      };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped by owner in the query itself: one user must never be able to
      // delete another's contact by guessing an id.
      await db.deleteContact(input.id, ctx.user.id);
      return { success: true };
    }),
});
