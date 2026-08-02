/**
 * Shared inspiration board with Love/Maybe/No voting.
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

export const vibeBoardRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const items = await db.getVibeItems(input.tripId);
      return projectProposalsForRole(items, role);
    }),
  add: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        title: z.string().min(1),
        description: z.string().optional(),
        url: z.string().optional(),
        imageUrl: z.string().optional(),
        tags: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.createVibeItem({
        tripId: input.tripId,
        proposedBy: ctx.user.id,
        title: input.title,
        description: input.description,
        url: input.url,
        imageUrl: input.imageUrl,
        tags: input.tags,
      });
      // Pinning something to the board is a vote for it.
      await db.voteVibeItem({
        vibeItemId: id,
        userId: ctx.user.id,
        vote: "love",
      });
      return { id };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getVibeItem(input.id);
      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(item.tripId, ctx.user.id);
      if (item.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who added this, or an admin, can remove it.",
        });
      await db.deleteVibeItem(input.id);
      return { success: true };
    }),
  vote: protectedProcedure
    .input(
      z.object({
        vibeItemId: z.number(),
        vote: z.enum(["love", "fine", "veto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.getVibeItem(input.vibeItemId);
      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      await db.voteVibeItem({
        vibeItemId: input.vibeItemId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      return { success: true };
    }),
  unvote: protectedProcedure
    .input(z.object({ vibeItemId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getVibeItem(input.vibeItemId);
      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      await db.unvoteVibeItem(input.vibeItemId, ctx.user.id);
      return { success: true };
    }),
});
