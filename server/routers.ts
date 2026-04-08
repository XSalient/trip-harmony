import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendMagicLinkEmail, sendTripInviteEmail } from "./utils/mailer";

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex") === key);
    });
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure.input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8),
    })).mutation(async ({ ctx, input }) => {
      const existing = await db.getUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
      const passwordHash = await hashPassword(input.password);
      const openId = `email:${nanoid(32)}`;
      const user = await db.createUserWithPassword({ openId, name: input.name, email: input.email, passwordHash });
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account." });
      const token = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true };
    }),
    login: publicProcedure.input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const token = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true };
    }),
    requestMagicLink: publicProcedure.input(z.object({
      email: z.string().email(),
    })).mutation(async ({ ctx, input }) => {
      const token = crypto.randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.createMagicLinkToken(input.email, token, expiresAt);
      const proto = ctx.req.get("x-forwarded-proto") || ctx.req.protocol;
      const origin = `${proto}://${ctx.req.get("host")}`;
      const magicUrl = `${origin}/auth/magic/${token}`;
      await sendMagicLinkEmail(input.email, magicUrl);
      const isDev = process.env.NODE_ENV === "development";
      return { success: true, ...(isDev ? { debugUrl: magicUrl } : {}) };
    }),
    verifyMagicLink: publicProcedure.input(z.object({
      token: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const row = await db.consumeMagicLinkToken(input.token);
      if (!row) throw new TRPCError({ code: "UNAUTHORIZED", message: "This magic link is invalid or has expired." });
      let user = await db.getUserByEmail(row.email);
      if (!user) {
        const openId = `magic:${nanoid(32)}`;
        const name = row.email.split("@")[0];
        user = await db.createUserWithPassword({ openId, name, email: row.email, passwordHash: "" });
      }
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to authenticate." });
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const name = user.name || row.email.split("@")[0] || "User";
      const sessionToken = await sdk.createSessionToken(user.openId, { name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true };
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
    getByInviteCode: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
      return db.getTripByInviteCode(input.code);
    }),
    sendInviteEmail: protectedProcedure.input(z.object({
      tripId: z.number(),
      email: z.string().email(),
    })).mutation(async ({ ctx, input }) => {
      const trip = await db.getTrip(input.tripId);
      if (!trip) throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
      const member = await db.getTripMember(input.tripId, ctx.user.id);
      if (!member) throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this trip." });
      const proto = ctx.req.get("x-forwarded-proto") || ctx.req.protocol;
      const origin = `${proto}://${ctx.req.get("host")}`;
      const inviteUrl = `${origin}/join/${trip.inviteCode}`;
      await sendTripInviteEmail(input.email, ctx.user.name || "Someone", trip.name, inviteUrl);
      return { success: true };
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
    deselect: protectedProcedure.input(z.object({ tripId: z.number() })).mutation(async ({ input }) => {
      await db.deselectDateProposals(input.tripId);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.id);
      if (!proposal) throw new Error("Proposal not found");
      if (proposal.proposedBy !== ctx.user.id) throw new Error("Not authorized");
      await db.deleteDateProposal(input.id);
      return { success: true };
    }),
    parseNatural: protectedProcedure.input(z.object({
      text: z.string().min(1),
      referenceYear: z.number().optional(),
    })).mutation(async ({ input }) => {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const year = input.referenceYear || today.getFullYear();
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a precise date parser for a group trip planning app. Today is ${todayStr}. Default year: ${year}.

RULES:
- "last N weekends in [month]" = the FINAL N weekends of that month (NOT past weekends relative to today)
- "first N weekends in [month]" = the FIRST N weekends
- A weekend = Saturday to Sunday (2 days)
- Use default year unless a different year is stated
- Return a raw JSON array — no markdown fences, no wrapper object, no explanation
- Max 8 proposals

EXAMPLE — "last 2 weekends in September 2026":
September 2026 weekends: Sep 5-6, Sep 12-13, Sep 19-20, Sep 26-27 → last 2 = Sep 19-20 and Sep 26-27
Output: [{"startDate":"2026-09-19","endDate":"2026-09-20","label":"Weekend Sep 19-20"},{"startDate":"2026-09-26","endDate":"2026-09-27","label":"Weekend Sep 26-27"}]`,
            },
            {
              role: "user",
              content: input.text,
            },
          ],
        });
        const raw = (response.choices?.[0]?.message?.content as string) || "[]";
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) return { proposals: [] };
        const proposals = JSON.parse(match[0]);
        return { proposals: Array.isArray(proposals) ? proposals : [] };
      } catch {
        return { proposals: [] };
      }
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
    deselect: protectedProcedure.input(z.object({ tripId: z.number() })).mutation(async ({ input }) => {
      await db.deselectDestinations(input.tripId);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const destination = await db.getDestination(input.id);
      if (!destination) throw new Error("Destination not found");
      if (destination.proposedBy !== ctx.user.id) throw new Error("Not authorized");
      await db.deleteDestination(input.id);
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
      singleBeds: z.number().optional(),
      doubleBeds: z.number().optional(),
      toilets: z.number().optional(),
      ensuites: z.number().optional(),
      freeParking: z.boolean().optional(),
      camperParking: z.boolean().optional(),
      amenities: z.string().optional(),
      preferences: z.string().optional(),
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
    deselect: protectedProcedure.input(z.object({ tripId: z.number() })).mutation(async ({ input }) => {
      await db.deselectAccommodations(input.tripId);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation) throw new Error("Accommodation not found");
      if (accommodation.proposedBy !== ctx.user.id) throw new Error("Not authorized");
      await db.deleteAccommodation(input.id);
      return { success: true };
    }),
    fetchFromUrl: protectedProcedure.input(z.object({ url: z.string().url() })).mutation(async ({ input }) => {
      try {
        // Fetch page content (basic HTML)
        let pageContent = "";
        try {
          const res = await fetch(input.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; TripHarmony/1.0)" },
            signal: AbortSignal.timeout(8000),
          });
          const html = await res.text();
          // Extract basic metadata from HTML
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
          const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
          const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
          pageContent = JSON.stringify({
            url: input.url,
            title: ogTitleMatch?.[1] || titleMatch?.[1] || "",
            description: ogDescMatch?.[1] || descMatch?.[1] || "",
            imageUrl: ogImageMatch?.[1] || "",
          });
        } catch {
          pageContent = JSON.stringify({ url: input.url });
        }

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an accommodation data extractor. Given metadata from a booking/accommodation page, extract structured information. Return ONLY JSON with these fields (use null for unknown): name, description, location, pricePerNight (number or null), totalPrice (number or null), bedrooms (int or null), bathrooms (int or null), singleBeds (int or null), doubleBeds (int or null), freeParking (boolean), amenities (string array), imageUrl (string or null).`,
            },
            {
              role: "user",
              content: `Extract accommodation info from this page metadata:\n${pageContent}\n\nReturn JSON only, no markdown.`,
            },
          ],
          responseFormat: { type: "json_object" },
        });

        const raw = (response.choices?.[0]?.message?.content as string) || "{}";
        const data = JSON.parse(raw);
        return { success: true, data };
      } catch (err) {
        return { success: false, data: {} };
      }
    }),
    parseAttributes: protectedProcedure.input(z.object({ text: z.string().min(1) })).mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an accommodation attributes extractor. Given a natural language description of accommodation preferences/requirements, extract structured attributes. Return ONLY JSON with any relevant fields from this list (omit unknown ones): singleBeds (int), doubleBeds (int), bedrooms (int), bathrooms (int), toilets (int, standalone toilets), ensuites (int, toilet+shower combined), freeParking (boolean), camperParking (boolean), amenities (string array of extra features like WiFi, Pool, Kitchen, Microwave, Washing Machine, Dryer, Air conditioning, Heating, TV, Dishwasher, BBQ, etc.). Be smart and infer from context.`,
            },
            {
              role: "user",
              content: `Parse these accommodation preferences: "${input.text}"\n\nReturn JSON only, no markdown.`,
            },
          ],
          responseFormat: { type: "json_object" },
        });
        const raw = (response.choices?.[0]?.message?.content as string) || "{}";
        const data = JSON.parse(raw);
        return { success: true, data };
      } catch {
        return { success: false, data: {} };
      }
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
