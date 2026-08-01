/**
 * Shared inspiration board with Love/Maybe/No voting.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const vibeBoardRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getVibeItems(input.tripId);
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
      const id = await db.createVibeItem({
        tripId: input.tripId,
        proposedBy: ctx.user.id,
        title: input.title,
        description: input.description,
        url: input.url,
        imageUrl: input.imageUrl,
        tags: input.tags,
      });
      return { id };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getVibeItem(input.id);
      if (!item) throw new Error("Item not found");
      const isOrganizer = await db.isTripOrganizer(item.tripId, ctx.user.id);
      if (item.proposedBy !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
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
      await db.unvoteVibeItem(input.vibeItemId, ctx.user.id);
      return { success: true };
    }),
});
