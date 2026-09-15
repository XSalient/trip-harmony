/**
 * One trip, one number — the bug this module exists for.
 *
 * The trips list drew its ring from the `phase` column and the trip page
 * counted the decisions the group had actually settled, so the same trip read
 * differently depending on which screen you were looking at. Phase is a label
 * an admin picks in the edit dialog; nothing in the app advances it.
 */
import { describe, expect, it } from "vitest";
import { DECISION_SECTIONS, progressHeadline, tripProgress } from "./progress";

describe("tripProgress", () => {
  it("is nothing settled on a trip that has settled nothing", () => {
    expect(tripProgress({})).toEqual({ done: 0, total: 4, percent: 0 });
  });

  it("counts each finalised decision once", () => {
    expect(tripProgress({ dates: true, budget: true })).toMatchObject({
      done: 2,
      total: 4,
      percent: 50,
    });
  });

  it("is everything when every live decision is made", () => {
    const all = Object.fromEntries(DECISION_SECTIONS.map(k => [k, true]));
    expect(tripProgress(all).percent).toBe(100);
  });

  it("ignores a section the trip switched off", () => {
    // Otherwise a trip that is not doing budgets is stuck at three quarters
    // for as long as it exists.
    expect(tripProgress({ dates: true }, ["budget", "suggestions"])).toEqual({
      done: 1,
      total: 2,
      percent: 50,
    });
  });

  it("does not divide by zero when every section is off", () => {
    expect(tripProgress({}, [...DECISION_SECTIONS])).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });

  it("treats a missing answer as unsettled rather than throwing", () => {
    // The list sends whatever the query found; a trip with no proposals at all
    // has no flags to send.
    expect(tripProgress(undefined).percent).toBe(0);
    expect(tripProgress(null).percent).toBe(0);
  });

  it("reads back as a whole number, because it is drawn as one", () => {
    expect(tripProgress({ dates: true }).percent).toBe(25);
  });
});

describe("progressHeadline", () => {
  it("says what the fraction means", () => {
    expect(progressHeadline(tripProgress({}))).toBe("Just getting started");
    expect(progressHeadline(tripProgress({ dates: true }))).toBe(
      "Coming together"
    );
    expect(
      progressHeadline(
        tripProgress(Object.fromEntries(DECISION_SECTIONS.map(k => [k, true])))
      )
    ).toBe("All settled");
    expect(progressHeadline(tripProgress({}, [...DECISION_SECTIONS]))).toBe(
      "Nothing to settle"
    );
  });
});
