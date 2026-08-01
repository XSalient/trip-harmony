/**
 * Stay proposals, voting, URL import, and AI match analysis.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm.js";
import { logger } from "../_core/logger.js";
import * as db from "../db.js";
import { extractLLMText } from "./_shared.js";
import { runAccommodationMatchAnalysis } from "./matchAnalysis.js";
import {
  cleanListingUrl,
  coerceExtractedAccommodation,
  fetchListingPage,
  hasUsableSignal,
  hintsFromListingUrl,
  looksLikeBotCheck,
  parseListingHtml,
  type ListingPageFacts,
} from "../utils/listingPage.js";

const log = logger.child({ scope: "accommodations" });

/** Gemini honours `json_object` but still fences the odd reply; take the object either way. */
function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

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
      // Proposing is itself a vote — nobody adds a stay they are against.
      await db.voteAccommodation({
        accommodationId: id,
        userId: ctx.user.id,
        vote: "love",
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
      await db.voteAccommodation({
        accommodationId: newId,
        userId: ctx.user.id,
        vote: "love",
      });
      return { id: newId };
    }),
  fetchFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const url = input.url.trim();
      const hints = hintsFromListingUrl(url);
      let facts: ListingPageFacts | null = null;
      let blocked = false;

      const page = await fetchListingPage(url);
      if (page.ok) {
        const parsed = parseListingHtml(page.html, url);
        // Booking sites answer a server-side fetch with a robot check often
        // enough that a 200 is not evidence the details are there.
        if (looksLikeBotCheck(parsed)) blocked = true;
        else facts = parsed;
      } else {
        blocked = page.reason === "blocked";
      }
      if (!facts)
        log.info("listing page unreadable, falling back to URL hints", {
          host: hints.host,
          blocked,
          status: page.ok ? 200 : page.status,
        });

      // With neither page metadata nor a readable URL there is nothing to extract.
      if (!hasUsableSignal(facts, hints))
        return { success: false, data: {}, source: "none" as const, blocked };

      try {
        const context = JSON.stringify({
          url: cleanListingUrl(url),
          page: facts ?? null,
          urlHints: hints,
        }).slice(0, 8000);

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You extract accommodation details for a trip-planning form.

You are given "page" (metadata the listing published, or null when the site refused our request) and "urlHints" (what the URL itself encodes: property slug, ISO 3166-1 country code, stay dates, guest counts).

RULES:
- Use ONLY the supplied data. Never invent a price, a rating, a bed count or a city.
- When "page" is null, still return what the URL supports: "slug" is the property name (tidy the capitalisation), "countryCode" gives the country (expand the ISO code, e.g. "si" is Slovenia) — and nothing else.
- Titles often carry trailing site furniture ("… — Updated 2026 Prices", "| Booking.com"). Strip it from name; keep the town or city for location.
- location is a place ("Ljubljana, Slovenia"), not a full postal address, unless only an address is given.
- Prices are plain numbers in the listing's own currency, no symbols or thousands separators. If a price covers the whole stay it is totalPrice, not pricePerNight; urlHints.nights tells you the stay length.
- amenities: only features the page actually names.

Return ONLY JSON with these fields, null for anything unknown: name, description, location, pricePerNight, totalPrice, bedrooms, bathrooms, singleBeds, doubleBeds, toilets, ensuites, freeParking, camperParking, amenities (string array), imageUrl.`,
            },
            {
              role: "user",
              content: `${context}\n\nReturn JSON only, no markdown.`,
            },
          ],
          responseFormat: { type: "json_object" },
        });

        const data = coerceExtractedAccommodation(
          parseJsonObject(extractLLMText(response, "{}")),
          url
        );
        // The page's own image beats whatever the model echoed back.
        if (facts?.imageUrl) data.imageUrl = facts.imageUrl;
        return {
          success: Object.keys(data).length > 0,
          data,
          source: facts ? ("page" as const) : ("url" as const),
          blocked,
        };
      } catch (err) {
        log.warn("accommodation URL extraction failed", { err });
        return { success: false, data: {}, source: "none" as const, blocked };
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
        const data = coerceExtractedAccommodation(
          parseJsonObject(extractLLMText(response, "{}"))
        );
        return { success: Object.keys(data).length > 0, data };
      } catch (err) {
        log.warn("accommodation preference parsing failed", { err });
        return { success: false, data: {} };
      }
    }),
});
