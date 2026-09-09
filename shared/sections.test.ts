/**
 * Reading back what a trip stored.
 *
 * The column is a `text` blob written by a previous build of this app, so the
 * parse has to survive a value that build understood and this one does not.
 * It is also the only thing standing between a bad column and a trip page that
 * will not render.
 */
import { describe, expect, it } from "vitest";
import {
  HIDEABLE_SECTION_KEYS,
  TRIP_SECTIONS,
  parseHiddenSections,
  sectionLabel,
} from "./sections.js";

describe("parseHiddenSections", () => {
  it("reads a stored array", () => {
    expect(parseHiddenSections('["budget","dates"]')).toEqual([
      "budget",
      "dates",
    ]);
  });

  it("treats null and empty as nothing hidden", () => {
    expect(parseHiddenSections(null)).toEqual([]);
    expect(parseHiddenSections(undefined)).toEqual([]);
    expect(parseHiddenSections("")).toEqual([]);
    expect(parseHiddenSections("[]")).toEqual([]);
  });

  it("drops keys this build does not know", () => {
    // A section removed from the app would otherwise leave a value nothing can
    // display and nothing can clear.
    expect(parseHiddenSections('["budget","vibeboard"]')).toEqual(["budget"]);
  });

  it("shows everything rather than throwing on a bad blob", () => {
    // Showing a section that was meant to be hidden costs one tap. Failing to
    // render the trip page costs the trip.
    expect(parseHiddenSections("not json")).toEqual([]);
    expect(parseHiddenSections('{"budget":true}')).toEqual([]);
    expect(parseHiddenSections("[1,2,null]")).toEqual([]);
  });
});

describe("the section list", () => {
  it("never offers the summary as hideable", () => {
    // Every other section starts collapsed because the summary exists. A trip
    // with all of them off would render an empty screen with no way back.
    expect(HIDEABLE_SECTION_KEYS).not.toContain("summary");
    expect(TRIP_SECTIONS.find(s => s.key === "summary")?.hideable).toBe(false);
  });

  it("gives z.enum a non-empty tuple", () => {
    expect(HIDEABLE_SECTION_KEYS.length).toBeGreaterThan(0);
  });

  it("has a label for every key, for the turned-off notice", () => {
    for (const s of TRIP_SECTIONS) expect(sectionLabel(s.key)).toBe(s.label);
  });
});
