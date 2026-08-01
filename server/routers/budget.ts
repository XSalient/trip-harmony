/**
 * Expense logging and per-person budget summaries.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const budgetRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
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
        if (m.budgetMax && perPerson > parseFloat(m.budgetMax as string)) {
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateBudgetItem(id, data);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteBudgetItem(input.id);
      return { success: true };
    }),
  summary: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
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
      const memberBudgets = acceptedMembers.map(m => ({
        userId: m.userId,
        budgetMax: m.budgetMax ? parseFloat(m.budgetMax as string) : null,
        overBudget: m.budgetMax
          ? perPerson > parseFloat(m.budgetMax as string)
          : false,
      }));
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
