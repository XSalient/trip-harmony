/**
 * Comment threads attached to any proposal type.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";

export const commentsRouter = router({
  /**
   * Who voted on a proposal, how, and when — plus who has not.
   *
   * Lives here rather than in three near-identical copies across the dates,
   * destinations and accommodations routers, for the same reason the comment
   * endpoints do: it is one shape that works for all three proposal types.
   *
   * Tripmates and admins only. A watcher gets the vote *count* in the proposal
   * payload and nothing more — see `projectProposalForRole`.
   */
  voters: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        proposalType: z.enum([
          "date",
          "destination",
          "accommodation",
          "budget",
        ]),
        proposalId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      return db.getProposalVoters(
        input.proposalType,
        input.proposalId,
        input.tripId
      );
    }),
  countsByTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getCommentCountsByTrip(input.tripId);
    }),
  /**
   * A thread's contents. Tripmates and admins only.
   *
   * A comment carries a name, a timestamp and an opinion — the same attribution
   * `projectProposalForRole` strips from a watcher's proposals — so the thread
   * itself is not a watcher's to read. It also used to check nothing at all:
   * any signed-in account could read any thread by guessing a proposal id.
   */
  list: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        proposalType: z.enum([
          "date",
          "destination",
          "accommodation",
          "budget",
        ]),
        proposalId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      return db.getComments(
        input.proposalType,
        input.proposalId,
        input.tripId,
        ctx.user.id
      );
    }),
  add: protectedProcedure
    .input(
      z.object({
        proposalType: z.enum([
          "date",
          "destination",
          "accommodation",
          "budget",
        ]),
        proposalId: z.number(),
        tripId: z.number(),
        content: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.createComment({
        proposalType: input.proposalType,
        proposalId: input.proposalId,
        tripId: input.tripId,
        userId: ctx.user.id,
        content: input.content,
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "comment.added",
        entityType: input.proposalType,
        entityId: input.proposalId,
      });
      return { id };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.getComment(input.id);
      if (!comment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found.",
        });
      await requireTripRole(comment.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(comment.tripId, ctx.user.id);
      if (comment.userId !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the author, or an admin, can delete a comment.",
        });
      await db.recordActivity({
        tripId: comment.tripId,
        actorUserId: ctx.user.id,
        action: "comment.deleted",
        entityType: comment.proposalType,
        entityId: comment.proposalId,
      });
      await db.deleteComment(input.id);
      return { success: true };
    }),
});
