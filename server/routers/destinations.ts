/**
 * Destination suggestions with vibe tags and voting.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";

export const destinationsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getDestinations(input.tripId);
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
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.userId !== ctx.user.id) {
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
      await db.voteDestination({
        destinationId: input.destinationId,
        userId: ctx.user.id,
        vote: input.vote,
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
      await db.unvoteDestination(input.destinationId, ctx.user.id);
      return { success: true };
    }),
  select: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        destinationId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await db.selectDestination(input.tripId, input.destinationId);
      return { success: true };
    }),
  deselect: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deselectDestinations(input.tripId);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination) throw new Error("Destination not found");
      const isOrganizer = await db.isTripOrganizer(
        destination.tripId,
        ctx.user.id
      );
      if (destination.proposedBy !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
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
      if (!destination) throw new Error("Destination not found");
      const isOrganizer = await db.isTripOrganizer(
        destination.tripId,
        ctx.user.id
      );
      if (destination.proposedBy !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
      const { id, ...data } = input;
      await db.updateDestination(id, data);
      return { success: true };
    }),
  clone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination) throw new Error("Destination not found");
      const newId = await db.createDestination({
        tripId: destination.tripId,
        proposedBy: ctx.user.id,
        name: `${destination.name} (copy)`,
        description: destination.description ?? undefined,
        imageUrl: destination.imageUrl ?? undefined,
        vibes: destination.vibes ?? undefined,
        estimatedCost: destination.estimatedCost ?? undefined,
      });
      return { id: newId };
    }),
});
