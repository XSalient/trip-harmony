/**
 * AI now runs only because a person asked.
 *
 * The two guarantees worth a test are that no router still triggers a model
 * call as a side effect of an ordinary write, and that the referee's cooldown
 * arithmetic is the same on both sides of the wire.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REFEREE_COOLDOWN_MS,
  refereeCooldownRemainingMs,
} from "../../shared/const.js";

const routers = join(import.meta.dirname);
const read = (file: string) => readFileSync(join(routers, file), "utf8");

describe("refereeCooldownRemainingMs", () => {
  const now = Date.parse("2026-08-02T12:00:00Z");

  it("is zero when the referee has never spoken", () => {
    expect(refereeCooldownRemainingMs(null, now)).toBe(0);
    expect(refereeCooldownRemainingMs(undefined, now)).toBe(0);
  });

  it("is the full window immediately after a run", () => {
    expect(refereeCooldownRemainingMs(new Date(now), now)).toBe(
      REFEREE_COOLDOWN_MS
    );
  });

  it("counts down as time passes", () => {
    const twoMinutesAgo = new Date(now - 2 * 60_000);
    expect(refereeCooldownRemainingMs(twoMinutesAgo, now)).toBe(
      REFEREE_COOLDOWN_MS - 2 * 60_000
    );
  });

  it("is zero once the window has passed, and never negative", () => {
    const longAgo = new Date(now - REFEREE_COOLDOWN_MS - 60_000);
    expect(refereeCooldownRemainingMs(longAgo, now)).toBe(0);
  });

  it("is zero exactly at the boundary, so the button re-enables", () => {
    const exactly = new Date(now - REFEREE_COOLDOWN_MS);
    expect(refereeCooldownRemainingMs(exactly, now)).toBe(0);
  });

  it("accepts an ISO string, which is what arrives over the wire", () => {
    expect(
      refereeCooldownRemainingMs(new Date(now - 60_000).toISOString(), now)
    ).toBe(REFEREE_COOLDOWN_MS - 60_000);
  });

  it("treats an unparseable timestamp as no cooldown rather than throwing", () => {
    expect(refereeCooldownRemainingMs("not a date", now)).toBe(0);
  });
});

describe("no AI runs as a side effect of an ordinary write", () => {
  it("adding an accommodation does not start a match analysis", () => {
    const src = read("accommodations.ts");
    const create = src.slice(
      src.indexOf("create: protectedProcedure"),
      src.indexOf("vote: protectedProcedure")
    );
    expect(create).not.toContain("runAccommodationMatchAnalysis");
    expect(create).not.toContain("invokeLLM");
  });

  it("saving preferences does not re-analyse the trip", () => {
    const src = read("preferences.ts");
    expect(src).not.toContain("runTripMatchAnalyses");
    expect(src).not.toContain("invokeLLM");
  });

  it("offering to turn a preference into a proposal costs nothing", () => {
    // The suggestions screen asks for this after every save. A model call here
    // would be a paid request per keystroke-and-save, fired by a form rather
    // than by anybody asking for AI — the exact thing E4 removed. Detection is
    // deterministic; the model belongs behind an explicit button, and adding
    // one means changing this test on purpose.
    expect(read("suggestions.ts")).not.toContain("invokeLLM");
  });

  it("only the two admin actions reach match analysis", () => {
    const src = read("accommodations.ts");
    // `refreshMatch` and `analyseAll`, and nothing else.
    const calls = src.match(
      /run(AccommodationMatchAnalysis|TripMatchAnalyses)\(/g
    );
    expect(calls).toHaveLength(2);
  });

  it("every match-analysis entry point requires an admin", () => {
    const src = read("accommodations.ts");
    for (const proc of ["refreshMatch", "analyseAll"]) {
      const start = src.indexOf(`${proc}: protectedProcedure`);
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, start + 1200);
      expect(body).toContain('"admin"');
    }
  });

  it("the referee only analyses for an admin", () => {
    const src = read("referee.ts");
    const start = src.indexOf("analyze: protectedProcedure");
    expect(src.slice(start, start + 400)).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "admin")'
    );
  });
});

/**
 * Production ran for a day reporting "that site blocked our request" on every
 * listing URL, including ones we had read perfectly, because `AI_INTEGRATIONS_*`
 * was unset and the model call is what turns a page into form fields. The
 * message sent people to the paste box, which needs the same model.
 */
describe("a missing AI provider is not reported as a blocked site", () => {
  const src = read("accommodations.ts");
  const fetchFromUrl = src.slice(
    src.indexOf("fetchFromUrl: protectedProcedure"),
    src.indexOf("parseAttributes: protectedProcedure")
  );

  it("checks for a provider before spending the request on a model call", () => {
    const beforeTry = fetchFromUrl.slice(0, fetchFromUrl.indexOf("try {"));
    expect(beforeTry).toContain("config.ai.isConfigured");
    expect(beforeTry).toContain('"ai-unavailable"');
  });

  it("tells the client which failure it was", () => {
    expect(fetchFromUrl).toContain('"extraction-failed"');
    // Every exit carries the field, so the client can switch on it safely.
    const returns = fetchFromUrl.match(/success: (false|Object\.keys)/g) ?? [];
    const errors = fetchFromUrl.match(/error: /g) ?? [];
    expect(errors.length).toBeGreaterThanOrEqual(returns.length);
  });

  it("the UI keeps the three failures apart", () => {
    const ui = readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "client",
        "src",
        "pages",
        "TripAccommodations.tsx"
      ),
      "utf8"
    );
    const start = ui.indexOf("const runUrlExtraction");
    const body = ui.slice(start, ui.indexOf("const handleFetchFromUrl"));
    // The AI branch must come first: when there is no model, "try pasting the
    // page" is advice that cannot work.
    expect(body.indexOf('"ai-unavailable"')).toBeGreaterThan(-1);
    expect(body.indexOf('"ai-unavailable"')).toBeLessThan(
      body.indexOf("result.blocked")
    );
  });
});
