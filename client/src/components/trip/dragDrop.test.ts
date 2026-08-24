/**
 * The hit test that decides which family a dragged member lands in.
 *
 * It exists because of one bug that is invisible in every other way: the chip
 * being dragged sits directly under the pointer for the whole gesture, so a
 * hit test that reads the topmost element resolves **every** drop back to the
 * card the drag started in. The drag animates correctly, the card highlights
 * (the wrong one), the drop is accepted, and nothing moves. It looks like a
 * feature that does not work rather than one with a bug in it.
 *
 * Structural rather than behavioural: `elementsFromPoint` is not implemented
 * in jsdom, so the guarantee is asserted against the source — as
 * `locking.test.ts` does for the finalise guard.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dirname, "DraggableMemberChip.tsx"),
  "utf8"
);

const fn = source.slice(
  source.indexOf("export function groupUnderPointer"),
  source.indexOf("export default function")
);

describe("groupUnderPointer", () => {
  it("skips the chip in hand, or every drop lands where it started", () => {
    expect(fn).toContain("DRAGGING_ATTR");
    // The skip has to come before the drop-target lookup, or reading the
    // chip's own ancestor card is exactly what happens.
    expect(fn.indexOf("DRAGGING_ATTR")).toBeLessThan(fn.indexOf("DROP_ATTR"));
    expect(fn).toContain("continue");
  });

  it("marks the chip while it is being dragged, so there is something to skip", () => {
    expect(source).toContain("dragging ? { [DRAGGING_ATTR]");
  });

  it("hit-tests at drop time rather than caching boxes on drag start", () => {
    // The page scrolls underneath a drag; boxes measured at the start are
    // wrong by the end of it.
    expect(fn).toContain("elementsFromPoint");
  });

  it("converts page coordinates to client coordinates", () => {
    // framer-motion reports page coordinates and elementsFromPoint takes
    // client ones. On an unscrolled page they are identical, which is how
    // this survives every test that does not scroll first.
    expect(fn).toContain("window.scrollX");
    expect(fn).toContain("window.scrollY");
  });

  it("tells 'no target' apart from 'the ungrouped card'", () => {
    // `undefined` is a cancelled drag; `null` is a real destination. Merging
    // them makes dragging somebody out of a family impossible.
    expect(fn).toContain('raw === "none" ? null : Number(raw)');
    expect(fn.trimEnd().endsWith("return undefined;\n}")).toBe(true);
  });
});

describe("drag never becomes the only way", () => {
  it("keeps a button on every chip that can be moved", () => {
    // Drag has no answer for a keyboard, a screen reader, or a drop target
    // scrolled off the screen.
    expect(source).toContain("aria-label={removeLabel}");
    expect(source).toContain("onClick={onRemove}");
  });

  it("does not let the remove button start a drag", () => {
    expect(source).toContain("onPointerDown={e => e.stopPropagation()}");
  });

  it("renders a plain chip for somebody the caller may not move", () => {
    expect(fn.length).toBeGreaterThan(0);
    expect(source).toContain("if (!canMove)");
  });
});
