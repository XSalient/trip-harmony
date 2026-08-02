/**
 * Destination suggestions with vibe tags and voting.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import {
  requireTripRole,
  tripRoleOf,
  projectProposalsForRole,
} from "./_shared.js";

export const destinationsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const destinations = await db.getDestinations(input.tripId);
      return projectProposalsForRole(destinations, role);
    }),
  create: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        vibes: z.string().optional(),
        estimatedCost: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const existing = await db.getDestinations(input.tripId);
      const duplicate = existing.find(
        d => d.name.trim().toLowerCase() === input.name.trim().toLowerCase()
      );
      if (duplicate)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A destination with this name already exists.",
        });
      const id = await db.createDestination({
        ...input,
        proposedBy: ctx.user.id,
      });
      // Suggesting a destination is a vote for it — count it without a second click.
      await db.voteDestination({
        destinationId: id,
        userId: ctx.user.id,
        vote: "love",
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.created",
        entityType: "destination",
        entityId: id,
        metadata: { name: input.name },
      });
      // Suggesting counted as a vote a few lines up; record it, or the trail
      // shows a later `vote.changed` with no vote before it.
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "vote.cast",
        entityType: "destination",
        entityId: id,
        metadata: { vote: "love", implicit: true },
      });
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.userId !== ctx.user.id && m.role !== "watcher") {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "New destination suggested!",
            message: `${ctx.user.name || "Someone"} suggested ${input.name}. Vote now!`,
          });
        }
      }
      return { id };
    }),
  vote: protectedProcedure
    .input(
      z.object({
        destinationId: z.number(),
        vote: z.enum(["love", "fine", "veto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.destinationId);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "tripmate");
      const had = await db.getMyDestinationVote(
        input.destinationId,
        ctx.user.id
      );
      await db.voteDestination({
        destinationId: input.destinationId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      await db.recordActivity({
        tripId: destination.tripId,
        actorUserId: ctx.user.id,
        action: had ? "vote.changed" : "vote.cast",
        entityType: "destination",
        entityId: input.destinationId,
        metadata: { vote: input.vote, from: had?.vote ?? null },
      });
      return { success: true };
    }),
  unvote: protectedProcedure
    .input(
      z.object({
        destinationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.destinationId);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "tripmate");
      await db.unvoteDestination(input.destinationId, ctx.user.id);
      await db.recordActivity({
        tripId: destination.tripId,
        actorUserId: ctx.user.id,
        action: "vote.withdrawn",
        entityType: "destination",
        entityId: input.destinationId,
      });
      return { success: true };
    }),
  /**
   * Finalise or un-finalise one place. Several can be finalised at once — a
   * week in Spain is Barcelona *and* Girona — so this touches only the row
   * named, unlike `dates.lock`.
   */
  setLock: protectedProcedure
    .input(z.object({ destinationId: z.number(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.destinationId);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "admin");
      await db.setDestinationLock(
        input.destinationId,
        input.locked,
        ctx.user.id
      );
      await db.recordActivity({
        tripId: destination.tripId,
        actorUserId: ctx.user.id,
        action: input.locked ? "proposal.locked" : "proposal.unlocked",
        entityType: "destination",
        entityId: input.destinationId,
        metadata: { name: destination.name },
      });
      return { success: true };
    }),
  /** Clear every finalised place on the trip. */
  unlockAll: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      await db.unlockDestinations(input.tripId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.unlocked",
        entityType: "destination",
      });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(destination.tripId, ctx.user.id);
      if (destination.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can remove it.",
        });
      await db.recordActivity({
        tripId: destination.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.deleted",
        entityType: "destination",
        entityId: input.id,
        metadata: { name: destination.name },
      });
      await db.deleteDestination(input.id);
      return { success: true };
    }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        vibes: z.string().optional(),
        estimatedCost: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(destination.tripId, ctx.user.id);
      if (destination.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can edit it.",
        });
      const { id, ...data } = input;
      await db.updateDestination(id, data);
      return { success: true };
    }),
  clone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination)
        throw new TRPCError({ code: "NOT_FOUND", message: "Place not found." });
      await requireTripRole(destination.tripId, ctx.user.id, "tripmate");
      const newId = await db.createDestination({
        tripId: destination.tripId,
        proposedBy: ctx.user.id,
        name: `${destination.name} (copy)`,
        description: destination.description ?? undefined,
        imageUrl: destination.imageUrl ?? undefined,
        vibes: destination.vibes ?? undefined,
        estimatedCost: destination.estimatedCost ?? undefined,
      });
      await db.voteDestination({
        destinationId: newId,
        userId: ctx.user.id,
        vote: "love",
      });
      return { id: newId };
    }),
});
