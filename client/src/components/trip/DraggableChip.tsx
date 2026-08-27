/**
 * A chip you can drag from one family card to another.
 *
 * The mechanics, shared by the two things a card holds: a member with an
 * account (`DraggableMemberChip`) and somebody without one (`AttendeePill`).
 * They differ in what a drop means to the server and in what the `×` does, and
 * in nothing else — so the drag itself lives here once.
 *
 * Pointer-based drag through framer-motion, which is already in the stack, and
 * **not** the HTML5 drag-and-drop API — that one does not fire on mobile touch
 * browsers at all, which is the whole reason a drag feature usually has to be
 * built on pointer events instead.
 *
 * Drag is an addition, never the only way in. The `×` on the chip and the `+`
 * on each card still do the same job, because drag has no answer for somebody
 * on a keyboard or a screen reader, and because dropping onto a card that is
 * scrolled off the screen is not possible however good the drag is.
 *
 * Hit-testing is done against the drop targets' own DOM at the moment the
 * pointer is released — `elementsFromPoint` rather than bounding boxes cached
 * on drag start, because the page scrolls underneath a drag and cached boxes
 * would be wrong by then.
 *
 * The chip being dragged is skipped during that hit test. It is directly under
 * the pointer for the whole gesture, so without that every drop resolves to the
 * card the chip started in — which looks exactly like a drag that did nothing.
 *
 * **The chip must not animate back to where it came from.** It used to, via
 * `dragSnapToOrigin`, and that rebound was read as "the drag failed" — people
 * dragged the same person three or four times because the only honest signal
 * arrived a network round trip later. The drag transform is now driven by motion
 * values that are zeroed the instant the pointer lifts, and `layoutId` carries
 * the chip from wherever it was released into whichever card the optimistic
 * update just re-parented it into. See ADR 0021.
 */
import {
  motion,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import { GripVertical } from "lucide-react";
import { useRef, type ReactNode } from "react";

/** Marks an element as somewhere somebody can be dropped. */
export const DROP_ATTR = "data-drop-group";

/** Marks the chip currently in hand, so the hit test can see past it. */
export const DRAGGING_ATTR = "data-dragging";

/**
 * What is in hand, as one value.
 *
 * A member is identified by their `userId` and an attendee by their row `id`,
 * and the two number spaces overlap — user 5 and attendee 5 are different
 * people. Everything about a drag is therefore keyed by this string rather
 * than by a bare number, which is what makes one set of drag state cover both.
 */
export type DragKind = "member" | "attendee";
export const dragIdFor = (kind: DragKind, id: number) => `${kind}:${id}`;
export function parseDragId(dragId: string): { kind: DragKind; id: number } {
  const [kind, id] = dragId.split(":");
  return { kind: kind as DragKind, id: Number(id) };
}

/**
 * The group under the pointer, or `undefined` if none.
 *
 * `null` is a real answer here and means "Not in a group" — the ungrouped
 * bucket is a drop target like any other, and conflating it with "no target"
 * would make dragging somebody out of a family impossible.
 */
export function groupUnderPointer(info: PanInfo): number | null | undefined {
  const x = info.point.x - window.scrollX;
  const y = info.point.y - window.scrollY;
  for (const el of document.elementsFromPoint(x, y)) {
    // The chip in hand is the top hit at every point of the gesture; reading
    // it would resolve every drop back to where the drag began.
    if ((el as HTMLElement).closest(`[${DRAGGING_ATTR}]`)) continue;
    const target = (el as HTMLElement).closest<HTMLElement>(`[${DROP_ATTR}]`);
    if (target) {
      const raw = target.getAttribute(DROP_ATTR);
      return raw === "none" ? null : Number(raw);
    }
  }
  return undefined;
}

export default function DraggableChip({
  dragId,
  className,
  dragging,
  isPending,
  layoutId,
  children,
  trailing,
  onDragStart,
  onDrag,
  onDragEnd,
  onActivate,
  activateLabel,
}: {
  /**
   * Passed back to every callback, so the page can hand each chip the *same*
   * three handlers instead of minting a closure per chip per render — which is
   * what lets the wrappers' `memo` do anything at all.
   */
  dragId: string;
  className: string;
  /** True while this chip is the one in hand. */
  dragging: boolean;
  /** True while this move is still in flight with the server. */
  isPending?: boolean;
  /**
   * Identity that survives being re-parented into another card, so the chip
   * animates across rather than vanishing and reappearing. Must be unique on
   * the page — a React `key` will not do, being scoped to one parent.
   */
  layoutId?: string;
  children: ReactNode;
  /** The `×`, and anything else that must not start a drag. */
  trailing?: ReactNode;
  onDragStart: (dragId: string) => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (dragId: string, info: PanInfo) => void;
  /** Click or Enter on the chip body, when it does something. */
  onActivate?: () => void;
  activateLabel?: string;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  /**
   * Whether the gesture that is ending was a drag.
   *
   * A drag finishes with a click on whatever was under the pointer, so a chip
   * that both drags and opens something would open it at the end of every
   * drag. framer only calls `onDragStart` once the gesture passes its
   * threshold, which is exactly the line between the two.
   */
  const dragged = useRef(false);

  return (
    <motion.span
      drag
      dragMomentum={false}
      dragElastic={0.2}
      style={{ x, y }}
      layoutId={layoutId}
      // Instant when the reader asked for that: the chip still lands in the
      // right card, it just gets there without the flight.
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 40 }
      }
      whileDrag={{ scale: 1.08, zIndex: 50, cursor: "grabbing" }}
      onPointerDown={() => {
        dragged.current = false;
      }}
      onDragStart={() => {
        dragged.current = true;
        onDragStart(dragId);
      }}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={(_, info) => {
        // Zero the transform rather than animating it home. The optimistic
        // update re-parents this chip in the same commit, so `layoutId` takes
        // it from here to its new card; animating back to the origin first is
        // the rebound that made a successful move look like a failed one.
        x.set(0);
        y.set(0);
        onDragEnd(dragId, info);
      }}
      {...(dragging ? { [DRAGGING_ATTR]: "true" } : {})}
      aria-busy={isPending || undefined}
      className={`${className} relative cursor-grab touch-none select-none active:cursor-grabbing ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground/60" />
      {onActivate ? (
        <button
          type="button"
          onClick={() => {
            if (dragged.current) return;
            onActivate();
          }}
          className="inline-flex items-center gap-1 hover:text-foreground"
          aria-label={activateLabel}
        >
          {children}
        </button>
      ) : (
        children
      )}
      {trailing}
    </motion.span>
  );
}
