/**
 * Reporting content, blocking people, and the admin queue that answers both.
 *
 * Apple's guideline 1.2 requires four things of an app carrying user-generated
 * content: a filter, a way to report, a way to block, and a published contact.
 * The filter is `shared/moderation.ts`, applied to every mutation by the
 * `withContentFilter` middleware in `_core/trpc.ts`; the
 * contact is `SUPPORT_EMAIL`; the other two are here.
 *
 * Reports go to **app** admins — `users.role === "admin"`, what `adminProcedure`
 * checks — rather than to the reported trip's own admins. A trip admin can
 * already delete any comment on their trip, but reporting a trip admin to that
 * same trip admin is not a moderation path, and theirs is the behaviour most
 * worth being able to escalate past.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "../_core/trpc.js";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";

export const moderationRouter = router({
  /**
   * Report something.
   *
   * Reporting is deliberately cheap — no trip role beyond membership, no
   * evidence required — because a report that is hard to file is a report that
   * does not get filed. The unique index behind `createContentReport` is what
   * keeps that from being abusable: the same person reporting the same thing
   * twice is one row.
   *
   * `tripId` is checked when given, so nobody can use this endpoint to probe
   * which trip ids exist by reporting into trips they are not in.
   */
  report: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(["comment", "proposal", "trip", "member"]),
        contentId: z.number(),
        tripId: z.number().optional(),
        reason: z.enum([
          "spam",
          "harassment",
          "hate",
          "sexual",
          "violence",
          "other",
        ]),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.tripId !== undefined)
        await requireTripRole(input.tripId, ctx.user.id, "watcher");

      if (input.contentType === "member" && input.contentId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't report yourself.",
        });

      await db.createContentReport({
        reporterUserId: ctx.user.id,
        tripId: input.tripId ?? null,
        contentType: input.contentType,
        contentId: input.contentId,
        reason: input.reason,
        note: input.note ?? null,
      });

      ctx.log.info("content reported", {
        contentType: input.contentType,
        contentId: input.contentId,
        reason: input.reason,
      });

      // Deliberately the same answer whether this created a row or hit the
      // uniqueness index. "You already reported this" tells somebody their
      // report was not counted, which is both discouraging and untrue.
      return { success: true } as const;
    }),

  /**
   * Stop hearing from somebody.
   *
   * This is not mutual invisibility, and the schema comment on `user_blocks`
   * explains why at length: a blocked member keeps their place in the trip and
   * their vote keeps counting, because a trip somebody is legitimately on must
   * not quietly lose a voter. What changes is that their comments arrive
   * collapsed and they can no longer invite you or add you to a contact book.
   */
  block: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't block yourself.",
        });
      const target = await db.getUserById(input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person no longer has an account.",
        });
      await db.createUserBlock(ctx.user.id, input.userId);
      return { success: true } as const;
    }),

  unblock: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteUserBlock(ctx.user.id, input.userId);
      return { success: true } as const;
    }),

  /** Who the caller has blocked. Their own list; never anybody else's. */
  blocks: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserBlocks(ctx.user.id);
  }),

  /** The moderation queue. App admins only. */
  queue: adminProcedure.query(async () => {
    return db.getOpenContentReports();
  }),

  /** How many reports are waiting — for the badge, so the queue is noticed. */
  openCount: adminProcedure.query(async () => {
    return { count: await db.countOpenContentReports() };
  }),

  /**
   * Close a report.
   *
   * `actioned` and `dismissed` are both closures; the distinction is the record
   * of whether anything was done, which is what makes the queue auditable
   * afterwards. Acting on the content itself — deleting a comment, removing a
   * member — stays with the existing endpoints that already authorise it.
   */
  resolve: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["actioned", "dismissed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const closed = await db.resolveContentReport(
        input.id,
        input.status,
        ctx.user.id
      );
      if (!closed)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That report is already closed, or does not exist.",
        });
      ctx.log.info("report resolved", { id: input.id, status: input.status });
      return { success: true } as const;
    }),
});
