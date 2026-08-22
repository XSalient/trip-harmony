/**
 * Groups, and the people in them who never sign in.
 *
 * A group is the family or household a trip of families actually plans in: one
 * opinion, one wallet. Attendees live here rather than in a file of their own
 * because they are group content — the question "who is in the Patels" and the
 * question "how many of us are there" are the same question.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import { canSeeMemberDetails } from "../../shared/roles.js";
import { requireTripRole, tripRoleOf } from "./_shared.js";

/**
 * A watcher may see who is coming and what they are; an age is the most
 * personal field on the members page and the one a watcher has no argument for.
 * Stripped here, at the router boundary, for the same reason `toPublicUser`
 * exists — a component that declines to render a field has already received it.
 */
function projectAttendeesForRole<T extends { age: number | null }>(
  attendees: T[],
  role: Parameters<typeof canSeeMemberDetails>[0]
): T[] {
  if (canSeeMemberDetails(role)) return attendees;
  return attendees.map(a => ({ ...a, age: null }));
}

/** Group caps are personal in exactly the way member caps are. */
function projectGroupsForRole<T extends { budgetMax: string | null }>(
  groups: T[],
  role: Parameters<typeof canSeeMemberDetails>[0]
): T[] {
  if (canSeeMemberDetails(role)) return groups;
  return groups.map(g => ({ ...g, budgetMax: null }));
}

/** The group a member may act on: their own, unless they are an admin. */
async function requireGroupAccess(
  tripId: number,
  userId: number,
  groupId: number | null
) {
  const member = await requireTripRole(tripId, userId, "tripmate");
  if (member.role === "admin") return member;
  if (groupId != null && member.groupId === groupId) return member;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only change your own group. Ask an admin for the rest.",
  });
}

export const groupsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const groups = await db.getTripGroups(input.tripId);
      return projectGroupsForRole(groups, role);
    }),

  headcount: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getTripHeadcount(input.tripId);
    }),

  create: protectedProcedure
    .input(z.object({ tripId: z.number(), name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const clash = await db.findTripGroupByName(input.tripId, input.name);
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: `This trip already has a group called "${clash.name}".`,
        });
      const id = await db.createTripGroup({
        tripId: input.tripId,
        name: input.name.trim(),
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "group.created",
        entityType: "group",
        entityId: id,
        metadata: { name: input.name },
      });
      return { id };
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const group = await db.getTripGroup(input.id);
      if (!group)
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
      await requireTripRole(group.tripId, ctx.user.id, "admin");
      const clash = await db.findTripGroupByName(group.tripId, input.name);
      if (clash && clash.id !== group.id)
        throw new TRPCError({
          code: "CONFLICT",
          message: `This trip already has a group called "${clash.name}".`,
        });
      await db.updateTripGroup(input.id, { name: input.name.trim() });
      await db.recordActivity({
        tripId: group.tripId,
        actorUserId: ctx.user.id,
        action: "group.renamed",
        entityType: "group",
        entityId: input.id,
        metadata: { from: group.name, to: input.name },
      });
      return { success: true };
    }),

  /**
   * Removes the group. Everyone in it stays on the trip, ungrouped — deleting a
   * group is an organisational change, never a way to remove people.
   */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const group = await db.getTripGroup(input.id);
      if (!group)
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
      await requireTripRole(group.tripId, ctx.user.id, "admin");
      await db.deleteTripGroup(input.id);
      await db.recordActivity({
        tripId: group.tripId,
        actorUserId: ctx.user.id,
        action: "group.deleted",
        entityType: "group",
        entityId: input.id,
        metadata: { name: group.name },
      });
      return { success: true };
    }),

  assignMember: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        userId: z.number(),
        groupId: z.number().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      if (input.groupId != null) {
        const group = await db.getTripGroup(input.groupId);
        if (!group || group.tripId !== input.tripId)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Group not found on this trip.",
          });
      }
      const target = await db.getTripMember(input.tripId, input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person is not on this trip.",
        });

      await db.setMemberGroup(input.tripId, input.userId, input.groupId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "group.member_assigned",
        entityType: "group",
        entityId: input.groupId ?? undefined,
        metadata: { userId: input.userId, from: target.groupId ?? null },
      });

      // A move can leave a group holding two votes on proposals it had already
      // voted on. Nothing on screen would say so, so it is reconciled here, in
      // the same call that caused it.
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
      return { success: true, votesSuperseded: dropped.length };
    }),

  setVotingUnit: protectedProcedure
    .input(
      z.object({ tripId: z.number(), votingUnit: z.enum(["member", "group"]) })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      await db.updateTrip(input.tripId, { votingUnit: input.votingUnit });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "trip.edited",
        metadata: { votingUnit: input.votingUnit },
      });
      // Votes already cast are left alone. Deleting somebody's vote from last
      // week because an admin flipped a setting today is worse than the
      // temporary inconsistency; the collapse happens on the next vote.
      return { success: true };
    }),

  setGroupBudget: protectedProcedure
    .input(z.object({ groupId: z.number(), budgetMax: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const group = await db.getTripGroup(input.groupId);
      if (!group)
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
      await requireGroupAccess(group.tripId, ctx.user.id, input.groupId);
      await db.updateTripGroup(input.groupId, { budgetMax: input.budgetMax });
      return { success: true };
    }),

  // ---- Attendees ----

  attendees: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const attendees = await db.getTripAttendees(input.tripId);
      return projectAttendeesForRole(attendees, role);
    }),

  addAttendee: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        groupId: z.number().nullable(),
        name: z.string().min(1).max(120),
        kind: z.enum(["adult", "child", "pet"]),
        age: z.number().int().min(0).max(120).nullable().optional(),
        notes: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireGroupAccess(input.tripId, ctx.user.id, input.groupId);
      const id = await db.createTripAttendee({
        tripId: input.tripId,
        groupId: input.groupId,
        name: input.name.trim(),
        kind: input.kind,
        // A pet has no meaningful age, and the form does not ask for one. Drop
        // it here too, so an API caller cannot store one either.
        age: input.kind === "pet" ? null : (input.age ?? null),
        notes: input.notes,
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "attendee.added",
        entityType: "attendee",
        entityId: id,
        metadata: { kind: input.kind },
      });
      return { id };
    }),

  editAttendee: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(120).optional(),
        kind: z.enum(["adult", "child", "pet"]).optional(),
        age: z.number().int().min(0).max(120).nullable().optional(),
        notes: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const attendee = await db.getTripAttendee(input.id);
      if (!attendee)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person is not on this trip.",
        });
      await requireGroupAccess(attendee.tripId, ctx.user.id, attendee.groupId);
      const { id, ...data } = input;
      const kind = data.kind ?? attendee.kind;
      await db.updateTripAttendee(id, {
        ...data,
        age: kind === "pet" ? null : (data.age ?? attendee.age),
      });
      return { success: true };
    }),

  removeAttendee: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const attendee = await db.getTripAttendee(input.id);
      if (!attendee)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person is not on this trip.",
        });
      await requireGroupAccess(attendee.tripId, ctx.user.id, attendee.groupId);
      // Removing the attendee row that stands for an account would drop them
      // from the headcount while leaving them on the trip. Removing the member
      // is what removes the person.
      if (attendee.memberUserId != null)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This person has an account on the trip. Remove them from the members list instead.",
        });
      await db.deleteTripAttendee(input.id);
      await db.recordActivity({
        tripId: attendee.tripId,
        actorUserId: ctx.user.id,
        action: "attendee.removed",
        entityType: "attendee",
        entityId: input.id,
        metadata: { kind: attendee.kind },
      });
      return { success: true };
    }),
});
