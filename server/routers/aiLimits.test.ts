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
