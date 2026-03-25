import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ---- Travel DNA ----
  travelDna: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return db.getTravelDna(ctx.user.id);
    }),
    save: protectedProcedure.input(z.object({
      budgetComfort: z.number().min(1).max(10),
      socialEnergy: z.number().min(1).max(10),
      adventureLevel: z.number().min(1).max(10),
      planningStyle: z.number().min(1).max(10),
      culturalCuriosity: z.number().min(1).max(10),
      comfortNeed: z.number().min(1).max(10),
      foodPriority: z.number().min(1).max(10),
      activityPace: z.number().min(1).max(10),
      dietaryNeeds: z.string().optional(),
      accessibilityNeeds: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      return db.upsertTravelDna({ ...input, userId: ctx.user.id });
    }),
    getGroupDna: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getGroupTravelDna(input.tripId);
    }),
  }),

  // ---- Trips ----
  trips: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserTrips(ctx.user.id);
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return db.getTrip(input.id);
    }),
    getByInviteCode: protectedProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return db.getTripByInviteCode(input.code);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      currency: z.string().default("USD"),
    })).mutation(async ({ ctx, input }) => {
      const inviteCode = nanoid(12);
      const tripId = await db.createTrip({
        ...input,
        organizerId: ctx.user.id,
        inviteCode,
      });
      await db.addTripMember({
        tripId,
        userId: ctx.user.id,
        role: "organizer",
        status: "accepted",
      });
      return { id: tripId, inviteCode };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      phase: z.enum(["setup", "dates", "destination", "accommodation", "activities", "finalized"]).optional(),
      status: z.enum(["planning", "active", "completed", "cancelled"]).optional(),
      currency: z.string().optional(),
      totalBudget: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateTrip(id, data);
      return { success: true };
    }),
    join: protectedProcedure.input(z.object({
      inviteCode: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const trip = await db.getTripByInviteCode(input.inviteCode);
      if (!trip) throw new Error("Trip not found");
      await db.addTripMember({
        tripId: trip.id,
        userId: ctx.user.id,
        role: "member",
        status: "accepted",
      });
      // Notify organizer
      await db.createNotification({
        userId: trip.organizerId,
        tripId: trip.id,
        type: "general",
        title: "New member joined!",
        message: `${ctx.user.name || "Someone"} joined your trip "${trip.name}"`,
      });
      return { tripId: trip.id };
    }),
    members: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getTripMembers(input.tripId);
    }),
    updateMemberBudget: protectedProcedure.input(z.object({
      tripId: z.number(),
      budgetMax: z.string(),
    })).mutation(async ({ ctx, input }) => {
      await db.updateMemberBudget(input.tripId, ctx.user.id, input.budgetMax);
      return { success: true };
    }),
  }),

  // ---- Date Proposals ----
  dates: router({
    list: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getDateProposals(input.tripId);
    }),
    propose: protectedProcedure.input(z.object({
      tripId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      label: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const id = await db.createDateProposal({
        tripId: input.tripId,
        proposedBy: ctx.user.id,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        label: input.label,
      });
      // Notify members
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.userId !== ctx.user.id) {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "New date proposed!",
            message: `${ctx.user.name || "Someone"} proposed new dates. Cast your vote!`,
          });
        }
      }
      return { id };
    }),
    vote: protectedProcedure.input(z.object({
      proposalId: z.number(),
      vote: z.enum(["available", "maybe", "unavailable"]),
    })).mutation(async ({ ctx, input }) => {
      await db.voteDateProposal({
        proposalId: input.proposalId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      return { success: true };
    }),
    select: protectedProcedure.input(z.object({
      tripId: z.number(),
      proposalId: z.number(),
    })).mutation(async ({ input }) => {
      await db.selectDateProposal(input.tripId, input.proposalId);
      return { success: true };
    }),
  }),

  // ---- Destinations ----
  destinations: router({
    list: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getDestinations(input.tripId);
    }),
    create: protectedProcedure.input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      vibes: z.string().optional(),
      estimatedCost: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
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
    vote: protectedProcedure.input(z.object({
      destinationId: z.number(),
      vote: z.enum(["love", "fine", "veto"]),
    })).mutation(async ({ ctx, input }) => {
      await db.voteDestination({
        destinationId: input.destinationId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      return { success: true };
    }),
    select: protectedProcedure.input(z.object({
      tripId: z.number(),
      destinationId: z.number(),
    })).mutation(async ({ input }) => {
      await db.selectDestination(input.tripId, input.destinationId);
      return { success: true };
    }),
  }),

  // ---- Accommodations ----
  accommodations: router({
    list: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getAccommodations(input.tripId);
    }),
    create: protectedProcedure.input(z.object({
      tripId: z.number(),
      name: z.string().min(1),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      pricePerNight: z.string().optional(),
      totalPrice: z.string().optional(),
      bedrooms: z.number().optional(),
      bathrooms: z.number().optional(),
      amenities: z.string().optional(),
      location: z.string().optional(),
      link: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // Calculate per-person cost
      const members = await db.getTripMembers(input.tripId);
      const memberCount = members.filter(m => m.status === "accepted").length || 1;
      const perPersonCost = input.totalPrice ? (parseFloat(input.totalPrice) / memberCount).toFixed(2) : undefined;
      const id = await db.createAccommodation({
        ...input,
        perPersonCost,
        proposedBy: ctx.user.id,
      });
      for (const m of members) {
        if (m.userId !== ctx.user.id) {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "New accommodation option!",
            message: `${ctx.user.name || "Someone"} added ${input.name}. Check it out and vote!`,
          });
        }
      }
      return { id };
    }),
    vote: protectedProcedure.input(z.object({
      accommodationId: z.number(),
      vote: z.enum(["love", "fine", "veto"]),
    })).mutation(async ({ ctx, input }) => {
      await db.voteAccommodation({
        accommodationId: input.accommodationId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      return { success: true };
    }),
    select: protectedProcedure.input(z.object({
      tripId: z.number(),
      accommodationId: z.number(),
    })).mutation(async ({ input }) => {
      await db.selectAccommodation(input.tripId, input.accommodationId);
      return { success: true };
    }),
  }),

  // ---- Budget ----
  budget: router({
    list: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getBudgetItems(input.tripId);
    }),
    add: protectedProcedure.input(z.object({
      tripId: z.number(),
      category: z.enum(["accommodation", "transport", "food", "activities", "other"]),
      description: z.string().min(1),
      amount: z.string(),
      currency: z.string().default("USD"),
      splitType: z.enum(["equal", "custom"]).default("equal"),
    })).mutation(async ({ ctx, input }) => {
      const id = await db.createBudgetItem({
        ...input,
        paidBy: ctx.user.id,
      });
      // Check budget thresholds
      const members = await db.getTripMembers(input.tripId);
      const items = await db.getBudgetItems(input.tripId);
      const totalSpent = items.reduce((sum, item) => sum + parseFloat(item.amount as string), 0) + parseFloat(input.amount);
      const perPerson = totalSpent / (members.filter(m => m.status === "accepted").length || 1);
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
    update: protectedProcedure.input(z.object({
      id: z.number(),
      description: z.string().optional(),
      amount: z.string().optional(),
      category: z.enum(["accommodation", "transport", "food", "activities", "other"]).optional(),
      approved: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateBudgetItem(id, data);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteBudgetItem(input.id);
      return { success: true };
    }),
    summary: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      const items = await db.getBudgetItems(input.tripId);
      const members = await db.getTripMembers(input.tripId);
      const acceptedMembers = members.filter(m => m.status === "accepted");
      const total = items.reduce((sum, item) => sum + parseFloat(item.amount as string), 0);
      const perPerson = total / (acceptedMembers.length || 1);
      const byCategory: Record<string, number> = {};
      for (const item of items) {
        byCategory[item.category] = (byCategory[item.category] || 0) + parseFloat(item.amount as string);
      }
      const memberBudgets = acceptedMembers.map(m => ({
        userId: m.userId,
        budgetMax: m.budgetMax ? parseFloat(m.budgetMax as string) : null,
        overBudget: m.budgetMax ? perPerson > parseFloat(m.budgetMax as string) : false,
      }));
      return { total, perPerson, byCategory, memberCount: acceptedMembers.length, memberBudgets, itemCount: items.length };
    }),
  }),

  // ---- Referee (AI) ----
  referee: router({
    messages: protectedProcedure.input(z.object({ tripId: z.number() })).query(async ({ input }) => {
      return db.getRefereeMessages(input.tripId);
    }),
    analyze: protectedProcedure.input(z.object({
      tripId: z.number(),
      phase: z.string(),
    })).mutation(async ({ input }) => {
      const trip = await db.getTrip(input.tripId);
      const members = await db.getTripMembers(input.tripId);
      const groupDna = await db.getGroupTravelDna(input.tripId);
      const budgetItems = await db.getBudgetItems(input.tripId);
      const destinations = await db.getDestinations(input.tripId);
      const accommodations = await db.getAccommodations(input.tripId);

      const totalBudget = budgetItems.reduce((s, i) => s + parseFloat(i.amount as string), 0);
      const memberCount = members.filter(m => m.status === "accepted").length;

      // Compute DNA averages and spreads
      const dnaFields = ["budgetComfort", "socialEnergy", "adventureLevel", "planningStyle", "culturalCuriosity", "comfortNeed", "foodPriority", "activityPace"] as const;
      const dnaStats: Record<string, { avg: number; spread: number }> = {};
      for (const field of dnaFields) {
        const values = groupDna.map(d => d[field]);
        if (values.length > 0) {
          const avg = values.reduce((s, v) => s + v, 0) / values.length;
          const spread = Math.max(...values) - Math.min(...values);
          dnaStats[field] = { avg: Math.round(avg * 10) / 10, spread };
        }
      }

      const contextSummary = JSON.stringify({
        tripName: trip?.name,
        phase: input.phase,
        memberCount,
        dnaStats,
        totalBudget,
        perPerson: memberCount > 0 ? (totalBudget / memberCount).toFixed(2) : 0,
        destinationCount: destinations.length,
        accommodationCount: accommodations.length,
        vetoCount: destinations.reduce((c, d) => c + (d as any).votes?.filter((v: any) => v.vote === "veto").length, 0),
      });

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are Harmony's Active Referee — a witty, empathetic AI mediator for group trip planning. Your job is to detect tension points (budget gaps, preference conflicts, voting deadlocks) and suggest fair compromises. Be concise, warm, and occasionally funny. Keep responses under 200 words. Use emoji sparingly. Address the group directly.`
            },
            {
              role: "user",
              content: `Analyze this group trip situation and provide mediation advice:\n\n${contextSummary}\n\nProvide: 1) A brief status assessment, 2) Any detected conflicts or tension points, 3) A specific compromise suggestion if needed, 4) An encouraging next step.`
            }
          ],
        });

        const content = (response.choices?.[0]?.message?.content as string) || "The referee is thinking...";

        const msgId = await db.createRefereeMessage({
          tripId: input.tripId,
          phase: input.phase,
          messageType: "mediation",
          content,
          context: contextSummary,
        });

        return { id: msgId, content };
      } catch (error) {
        const fallbackContent = `Hey team! I see you're in the ${input.phase} phase with ${memberCount} members. Keep the momentum going — every vote counts! 🎯`;
        const msgId = await db.createRefereeMessage({
          tripId: input.tripId,
          phase: input.phase,
          messageType: "nudge",
          content: fallbackContent,
        });
        return { id: msgId, content: fallbackContent };
      }
    }),
  }),

  // ---- Notifications ----
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUserNotifications(ctx.user.id);
    }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnreadNotificationCount(ctx.user.id);
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.markNotificationRead(input.id);
      return { success: true };
    }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
