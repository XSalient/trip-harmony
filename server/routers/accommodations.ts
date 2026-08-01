/**
 * Stay proposals, voting, URL import, and AI match analysis.
 */
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import { extractLLMText } from "./_shared";
import { runAccommodationMatchAnalysis } from "./matchAnalysis";

export const accommodationsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getAccommodations(input.tripId);
    }),
  create: protectedProcedure
    .input(
      z.object({
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalize = (s: string | undefined) =>
        (s || "").trim().toLowerCase();
      const existingAccs = await db.getAccommodations(input.tripId);
      const dupAcc = existingAccs.find(
        a =>
          normalize(a.name) === normalize(input.name) &&
          normalize(a.description ?? undefined) ===
            normalize(input.description) &&
          normalize(a.location ?? undefined) === normalize(input.location) &&
          normalize(a.link ?? undefined) === normalize(input.link)
      );
      if (dupAcc)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An identical accommodation already exists. Please change at least one field.",
        });
      // Calculate per-person cost
      const members = await db.getTripMembers(input.tripId);
      const memberCount =
        members.filter(m => m.status === "accepted").length || 1;
      const perPersonCost = input.totalPrice
        ? (parseFloat(input.totalPrice) / memberCount).toFixed(2)
        : undefined;
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
      // Fire AI match analysis in background (non-blocking)
      runAccommodationMatchAnalysis(id, input.tripId).catch(() => {});
      return { id };
    }),
  vote: protectedProcedure
    .input(
      z.object({
        accommodationId: z.number(),
        vote: z.enum(["love", "fine", "veto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.voteAccommodation({
        accommodationId: input.accommodationId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      return { success: true };
    }),
  unvote: protectedProcedure
    .input(
      z.object({
        accommodationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.unvoteAccommodation(input.accommodationId, ctx.user.id);
      return { success: true };
    }),
  select: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        accommodationId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await db.selectAccommodation(input.tripId, input.accommodationId);
      return { success: true };
    }),
  deselect: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deselectAccommodations(input.tripId);
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation) throw new Error("Accommodation not found");
      const isOrganizer = await db.isTripOrganizer(
        accommodation.tripId,
        ctx.user.id
      );
      if (accommodation.proposedBy !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
      await db.deleteAccommodation(input.id);
      return { success: true };
    }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        pricePerNight: z.string().optional(),
        totalPrice: z.string().optional(),
        location: z.string().optional(),
        link: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        singleBeds: z.number().optional(),
        doubleBeds: z.number().optional(),
        freeParking: z.boolean().optional(),
        amenities: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation) throw new Error("Accommodation not found");
      const isOrganizer = await db.isTripOrganizer(
        accommodation.tripId,
        ctx.user.id
      );
      if (accommodation.proposedBy !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
      const { id, ...data } = input;
      await db.updateAccommodation(id, data);
      return { success: true };
    }),
  refreshMatch: protectedProcedure
    .input(
      z.object({
        accommodationId: z.number(),
        tripId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await runAccommodationMatchAnalysis(input.accommodationId, input.tripId);
      return { success: true };
    }),

  clone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation) throw new Error("Accommodation not found");
      const newId = await db.createAccommodation({
        tripId: accommodation.tripId,
        proposedBy: ctx.user.id,
        name: `${accommodation.name} (copy)`,
        description: accommodation.description ?? undefined,
        imageUrl: accommodation.imageUrl ?? undefined,
        pricePerNight: accommodation.pricePerNight ?? undefined,
        totalPrice: accommodation.totalPrice ?? undefined,
        location: accommodation.location ?? undefined,
        link: accommodation.link ?? undefined,
        bedrooms: accommodation.bedrooms ?? undefined,
        bathrooms: accommodation.bathrooms ?? undefined,
        singleBeds: accommodation.singleBeds ?? undefined,
        doubleBeds: accommodation.doubleBeds ?? undefined,
        freeParking: accommodation.freeParking ?? undefined,
        amenities: accommodation.amenities ?? undefined,
      });
      return { id: newId };
    }),
  fetchFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      try {
        // Fetch page content (basic HTML)
        let pageContent = "";
        try {
          const res = await fetch(input.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; TripHarmony/1.0)",
            },
            signal: AbortSignal.timeout(8000),
          });
          const html = await res.text();
          // Extract basic metadata from HTML
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = html.match(
            /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
          );
          const ogTitleMatch = html.match(
            /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
          );
          const ogDescMatch = html.match(
            /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
          );
          const ogImageMatch = html.match(
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
          );
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

        const raw = extractLLMText(response, "{}");
        const data = JSON.parse(raw);
        return { success: true, data };
      } catch (err) {
        return { success: false, data: {} };
      }
    }),
  parseAttributes: protectedProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
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
        const raw = extractLLMText(response, "{}");
        const data = JSON.parse(raw);
        return { success: true, data };
      } catch {
        return { success: false, data: {} };
      }
    }),
});
