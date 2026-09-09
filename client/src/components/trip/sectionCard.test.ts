/**
 * The section header's controls, and the order they are in.
 *
 * Expanding a section used to move the chevron: it lived inside the title
 * button, `addSlot` was appended after it, and so the right-most control was
 * the chevron when collapsed and Add when open. The thumb that had just opened
 * a section landed on Add.
 *
 * Structural, like `dragDrop.test.ts` next door: there is no React test
 * renderer in this project, and the guarantee is about the source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dirname, "SectionCard.tsx"),
  "utf8"
);

/** `SectionCard`'s body — `CollapsibleRow` below it has its own chevron. */
const card = source.slice(
  source.indexOf("export default function SectionCard"),
  source.indexOf("export function CollapsibleRow")
);

describe("the section header", () => {
  it("puts Add to the left of the chevron", () => {
    const add = card.indexOf("{open && addSlot}");
    const chevron = card.indexOf("<ChevronDown", add);
    expect(add).toBeGreaterThan(-1);
    expect(chevron).toBeGreaterThan(add);
  });

  it("keeps the chevron out of the title button, or Add cannot precede it", () => {
    const titleButtonEnd = card.indexOf("</button>");
    expect(card.indexOf("<ChevronDown")).toBeGreaterThan(titleButtonEnd);
  });

  it("still toggles from the chevron", () => {
    const chevronButton = card.slice(card.indexOf("{open && addSlot}"));
    expect(chevronButton).toContain("onClick={onToggle}");
  });

  it("announces one control, not two", () => {
    // The chevron is the same action a second time. Two tab stops and two
    // announcements for one section would be a worse page than the one this
    // ordering fixes.
    expect(card.match(/aria-expanded=\{/g)).toHaveLength(1);
    expect(card).toContain('aria-hidden="true"');
    expect(card).toContain("tabIndex={-1}");
  });
});
