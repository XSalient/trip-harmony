/**
 * Expense logging and per-person budget summaries.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import { requireTripRole, tripRoleOf } from "./_shared.js";
import { canSeeMemberDetails } from "../../shared/roles.js";

export const budgetRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getBudgetItems(input.tripId);
    }),
  add: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        category: z.enum([
          "accommodation",
          "transport",
          "food",
          "activities",
          "other",
        ]),
        description: z.string().min(1),
        amount: z.string(),
        currency: z.string().default("USD"),
        splitType: z.enum(["equal", "custom"]).default("equal"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.createBudgetItem({
        ...input,
        paidBy: ctx.user.id,
      });
      // Check budget thresholds
      const members = await db.getTripMembers(input.tripId);
      const items = await db.getBudgetItems(input.tripId);
      const totalSpent =
        items.reduce(
          (sum, item) => sum + parseFloat(item.amount as string),
          0
        ) + parseFloat(input.amount);
      const perPerson =
        totalSpent / (members.filter(m => m.status === "accepted").length || 1);
      for (const m of members) {
        if (
          m.role !== "watcher" &&
          m.budgetMax &&
          perPerson > parseFloat(m.budgetMax as string)
        ) {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "budget_alert",
            title: "Budget threshold exceeded!",
            message: `Per-person cost ($${perPerson.toFixed(2)}) exceeds your budget limit ($${m.budgetMax}).`,
          });
        }
      }
      return { id };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        amount: z.string().optional(),
        category: z
          .enum(["accommodation", "transport", "food", "activities", "other"])
          .optional(),
        approved: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await db.getBudgetItem(input.id);
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Expense not found.",
        });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      const { id, ...data } = input;
      await db.updateBudgetItem(id, data);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getBudgetItem(input.id);
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Expense not found.",
        });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(item.tripId, ctx.user.id);
      if (item.paidBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who logged this, or an admin, can remove it.",
        });
      await db.deleteBudgetItem(input.id);
      return { success: true };
    }),
  summary: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const items = await db.getBudgetItems(input.tripId);
      const members = await db.getTripMembers(input.tripId);
      const acceptedMembers = members.filter(m => m.status === "accepted");
      const total = items.reduce(
        (sum, item) => sum + parseFloat(item.amount as string),
        0
      );
      const perPerson = total / (acceptedMembers.length || 1);
      const byCategory: Record<string, number> = {};
      for (const item of items) {
        byCategory[item.category] =
          (byCategory[item.category] || 0) + parseFloat(item.amount as string);
      }
      // Each member's spending ceiling is personal — a watcher gets the trip's
      // totals but not what any individual can afford.
      const memberBudgets = canSeeMemberDetails(role)
        ? acceptedMembers.map(m => ({
            userId: m.userId,
            budgetMax: m.budgetMax ? parseFloat(m.budgetMax as string) : null,
            overBudget: m.budgetMax
              ? perPerson > parseFloat(m.budgetMax as string)
              : false,
          }))
        : [];
      return {
        total,
        perPerson,
        byCategory,
        memberCount: acceptedMembers.length,
        memberBudgets,
        itemCount: items.length,
      };
    }),
});
