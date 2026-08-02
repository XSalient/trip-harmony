/**
 * AI scoring of an accommodation against every member's trip preferences.
 *
 * Called fire-and-forget from the accommodation and preference routers: a
 * failure here must never fail the user's write, so everything is wrapped and
 * logged rather than thrown.
 */
import { invokeLLM } from "../_core/llm.js";
import { logger } from "../_core/logger.js";
import * as db from "../db.js";
import { extractLLMText } from "./_shared.js";

const log = logger.child({ scope: "matchAnalysis" });

/** Run AI match analysis for one accommodation and save result to DB. Fire-and-forget safe. */
export async function runAccommodationMatchAnalysis(
  accommodationId: number,
  tripId: number
): Promise<void> {
  try {
    const accommodation = await db.getAccommodation(accommodationId);
    if (!accommodation) return;

    const [members, allPrefs] = await Promise.all([
      db.getTripMembers(tripId),
      db.getAllTripPreferences(tripId),
    ]);

    const accepted = members.filter((m: any) => m.status === "accepted");
    const memberProfiles = accepted.map((m: any) => {
      const prefRow = allPrefs.find((p: any) => p.userId === m.userId);
      let tripPrefs: any = null;
      try {
        if (prefRow) tripPrefs = JSON.parse(prefRow.rawText);
      } catch {}
      return {
        name: m.userName || m.userEmail || `Member #${m.userId}`,
        tripPrefs: tripPrefs
          ? {
              mustHaves: tripPrefs.mustHaves || "",
              strongPreferences: tripPrefs.strongPreferences || "",
              avoids: tripPrefs.avoids || "",
              openComments: tripPrefs.openComments || "",
            }
          : null,
      };
    });

    const accSummary = [
      `Name: ${accommodation.name}`,
      accommodation.description
        ? `Description: ${accommodation.description}`
        : "",
      accommodation.location ? `Location: ${accommodation.location}` : "",
      accommodation.bedrooms ? `Bedrooms: ${accommodation.bedrooms}` : "",
      accommodation.bathrooms ? `Bathrooms: ${accommodation.bathrooms}` : "",
      accommodation.ensuites ? `En-suites: ${accommodation.ensuites}` : "",
      accommodation.amenities ? `Amenities: ${accommodation.amenities}` : "",
      accommodation.totalPrice
        ? `Total price: ${accommodation.totalPrice}`
        : "",
      accommodation.pricePerNight
        ? `Per night: ${accommodation.pricePerNight}`
        : "",
      accommodation.link ? `Link: ${accommodation.link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const profileText = memberProfiles
      .map(p => {
        const lines = [`Member: ${p.name}`];
        if (p.tripPrefs) {
          if (p.tripPrefs.mustHaves)
            lines.push(`  Must-haves: ${p.tripPrefs.mustHaves}`);
          if (p.tripPrefs.strongPreferences)
            lines.push(
              `  Strong preferences: ${p.tripPrefs.strongPreferences}`
            );
          if (p.tripPrefs.avoids)
            lines.push(`  Avoids/dealbreakers: ${p.tripPrefs.avoids}`);
          if (p.tripPrefs.openComments)
            lines.push(`  Comments: ${p.tripPrefs.openComments}`);
        } else {
          lines.push("  Trip preferences: not set");
        }
        return lines.join("\n");
      })
      .join("\n\n");

    const prompt = `You are an expert group travel analyst. Analyze how well this accommodation matches each group member's stated preferences for this trip.

ACCOMMODATION:
${accSummary}

GROUP MEMBERS (${memberProfiles.length} people):
${profileText}

Return ONLY a valid JSON object with this exact structure:
{
  "groupFitScore": <0-100 integer, overall group fit>,
  "comfortScore": <1-10 number, one decimal, overall comfort>,
  "resentmentRisk": <"low" | "medium" | "high">,
  "summary": "<2-3 sentence honest group-level summary>",
  "flags": ["<critical issue 1>", "<critical issue 2>"],
  "memberMatches": [
    {
      "name": "<member name>",
      "score": <0-100 integer match score>,
      "verdict": "<one short emoji+word verdict like ✅ Great fit | ⚠️ Some concerns | ❌ Poor match>",
      "reason": "<1-2 sentences explaining the match or mismatch for this person>"
    }
  ]
}

Be honest and specific. Flag hard constraint failures (stairs, accessibility, dietary, etc.) clearly. Include an entry in "memberMatches" for every member listed above, in the same order — a member who has set no preferences still gets an entry, with a neutral score of 65 and a reason saying their preferences are not set.`;

    const raw = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a travel group analyst. Reply only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
    });
    const text = extractLLMText(raw, "{}");
    const clean = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const result = JSON.parse(clean);
    await db.saveAccommodationMatchAnalysis(accommodationId, {
      groupFitScore: result.groupFitScore ?? 50,
      comfortScore: result.comfortScore ?? 5,
      resentmentRisk: result.resentmentRisk ?? "medium",
      summary: result.summary ?? "Analysis unavailable.",
      flags: result.flags ?? [],
      memberMatches: result.memberMatches ?? [],
    });
  } catch (err) {
    log.error("accommodation match analysis failed", {
      accommodationId,
      tripId,
      err,
    });
  }
}

/** Re-analyse all accommodations for a trip (call after preferences change). */
export async function runTripMatchAnalyses(tripId: number): Promise<void> {
  try {
    const accs = await db.getAccommodations(tripId);
    for (const acc of accs) {
      runAccommodationMatchAnalysis(acc.id, tripId).catch(() => {});
    }
  } catch (err) {
    log.error("trip match re-analysis failed", { tripId, err });
  }
}
