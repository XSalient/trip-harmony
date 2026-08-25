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
  source.indexOf("function DraggableMemberChip")
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
    expect(source).toContain("onRemove(userId)");
  });

  it("does not let the remove button start a drag", () => {
    expect(source).toContain("onPointerDown={e => e.stopPropagation()}");
  });

  it("renders a plain chip for somebody the caller may not move", () => {
    expect(fn.length).toBeGreaterThan(0);
    expect(source).toContain("if (!canMove)");
  });
});

// The component itself, without the file's header comment — which names the
// prop below in order to explain why it is gone.
const chip = source.slice(source.indexOf("function DraggableMemberChip"));

/**
 * The second bug that looked exactly like the first one: the drop was accepted
 * and the move was written, but the chip animated back to the card it came
 * from and stayed there until a mutation and five refetches had landed. People
 * re-dragged, which queued another round of the same work.
 */
describe("a dropped chip does not rebound", () => {
  it("never snaps the chip back to where the drag started", () => {
    expect(chip).not.toContain("dragSnapToOrigin");
  });

  it("zeroes the drag transform on release instead of animating it home", () => {
    expect(source).toContain("x.set(0)");
    expect(source).toContain("y.set(0)");
  });

  it("carries the chip across when it is re-parented into another card", () => {
    // A React `key` will not do this — it is scoped to one parent, so the chip
    // would vanish from one card and appear in the other with no continuity.
    expect(source).toContain("layoutId={layoutId}");
  });
});

const page = readFileSync(
  join(import.meta.dirname, "..", "..", "pages", "TripMembers.tsx"),
  "utf8"
);

const assign = page.slice(
  page.indexOf("const assignMember ="),
  page.indexOf("const movingUserId")
);

describe("assigning a member is applied before the server answers", () => {
  it("patches the query that positions the chip", () => {
    expect(assign).toContain("onMutate");
    expect(assign).toContain("utils.trips.members.setData");
  });

  it("moves the member's own attendee row with them, as the server does", () => {
    expect(assign).toContain("utils.groups.attendees.setData");
    expect(assign).toContain("a.memberUserId === userId");
  });

  it("cancels in-flight refetches before patching", () => {
    // Otherwise a refetch that was already on its way lands on top of the
    // patch and puts the chip back.
    expect(assign).toContain("utils.trips.members.cancel");
    expect(assign.indexOf("cancel")).toBeLessThan(assign.indexOf("setData"));
  });

  it("rolls the patch back when the move fails", () => {
    // A patch with no rollback leaves the screen lying permanently, which is
    // worse than the wait it replaced.
    expect(assign).toContain("onError");
    expect(assign).toContain("previous.members");
    expect(assign).toContain("previous.attendees");
  });

  it("does not refetch the group list, which an assign cannot change", () => {
    // `getTripGroups` reads `trip_groups` alone — no members, no counts.
    expect(assign).not.toContain("groups.list.invalidate");
  });

  it("refetches the voter denominator only when the trip votes by group", () => {
    expect(assign).toContain('votingUnit === "group"');
  });
});

const dragOver = page.slice(
  page.indexOf("const handleDragOver"),
  page.indexOf("const handleDragStart")
);

describe("a drag does not re-render the page on every pointer frame", () => {
  it("hit-tests at most once a frame", () => {
    // `elementsFromPoint` forces layout, and pointer events outrun frames.
    expect(dragOver).toContain("requestAnimationFrame");
    expect(dragOver).toContain("hitTestQueued");
  });

  it("sets state only when the card under the pointer actually changes", () => {
    expect(dragOver).toContain("Object.is(dragOverRef.current, next)");
  });

  it("compares with Object.is, so null and undefined stay different answers", () => {
    // `null` is the ungrouped card and `undefined` is no target at all. `===`
    // would tell them apart too, but a truthiness check would not, and this is
    // the line where somebody would reach for one.
    expect(dragOver).not.toContain("=== next");
  });

  it("reads the pointer position before the frame it is used in", () => {
    // framer reuses the PanInfo object between events.
    expect(dragOver).toContain("info.point.x");
    expect(dragOver.indexOf("info.point.x")).toBeLessThan(
      dragOver.indexOf("requestAnimationFrame")
    );
  });

  it("memoises the chip, and hands it handlers that keep their identity", () => {
    expect(source).toContain("memo(DraggableMemberChip)");
    // Inline arrows on these four would make the memo above do nothing.
    expect(page).toContain("onDragStart={handleDragStart}");
    expect(page).toContain("onDrag={handleDragOver}");
    expect(page).toContain("onDragEnd={handleDrop}");
    expect(page).not.toContain("onDrag={info =>");
  });

  it("buckets members and attendees once rather than per card", () => {
    expect(page).toContain("membersByGroup");
    expect(page).toContain("attendeesByGroup");
    // The per-card filters this replaced were O(families × members) a render.
    expect(page).not.toContain(
      "accepted.filter((m: any) => m.groupId === g.id)"
    );
  });
});
