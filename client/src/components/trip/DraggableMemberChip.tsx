/**
 * A member chip you can drag from one family to another.
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
import { GripVertical, X } from "lucide-react";
import { memo } from "react";

/** Marks an element as somewhere a member can be dropped. */
export const DROP_ATTR = "data-drop-group";

/** Marks the chip currently in hand, so the hit test can see past it. */
export const DRAGGING_ATTR = "data-dragging";

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

function DraggableMemberChip({
  userId,
  label,
  isMe,
  canMove,
  removeLabel,
  onRemove,
  dragging,
  isPending,
  layoutId,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  /**
   * Passed back to every callback, so the page can hand each chip the *same*
   * four handlers instead of minting a closure per chip per render — which is
   * what lets `memo` below do anything at all.
   */
  userId: number;
  label: string;
  isMe: boolean;
  /** False for somebody this caller may not reorganise — no drag, no cross. */
  canMove: boolean;
  removeLabel: string;
  /** True while this chip is the one in hand. */
  dragging: boolean;
  /** True while this member's move is still in flight with the server. */
  isPending?: boolean;
  /**
   * Identity that survives being re-parented into another card, so the chip
   * animates across rather than vanishing and reappearing. Must be unique on
   * the page — a React `key` will not do, being scoped to one parent.
   */
  layoutId?: string;
  onRemove: (userId: number) => void;
  onDragStart: (userId: number) => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (userId: number, info: PanInfo) => void;
}) {
  const base = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
    isMe ? "border-primary/40 bg-primary/5" : "border-border/60"
  }`;

  // Hooks before the early return: a chip can go from movable to not (a role
  // changes under you), and React does not allow the hook count to change.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const reduceMotion = useReducedMotion();

  if (!canMove) {
    return (
      <span className={base}>
        {label}
        {isMe && <span className="text-muted-foreground">(you)</span>}
      </span>
    );
  }

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
      onDragStart={() => onDragStart(userId)}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={(_, info) => {
        // Zero the transform rather than animating it home. The optimistic
        // update re-parents this chip in the same commit, so `layoutId` takes
        // it from here to its new card; animating back to the origin first is
        // the rebound that made a successful move look like a failed one.
        x.set(0);
        y.set(0);
        onDragEnd(userId, info);
      }}
      {...(dragging ? { [DRAGGING_ATTR]: "true" } : {})}
      aria-busy={isPending || undefined}
      className={`${base} relative cursor-grab touch-none select-none active:cursor-grabbing ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground/60" />
      {label}
      {isMe && <span className="text-muted-foreground">(you)</span>}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onRemove(userId)}
        className="text-muted-foreground hover:text-destructive"
        aria-label={removeLabel}
      >
        <X className="h-3 w-3" />
      </button>
    </motion.span>
  );
}

/**
 * Memoised because the page it lives on is one large component: a drag used to
 * re-render every chip on the trip on every pointer frame. Every remaining prop
 * is a primitive, so the shallow compare is the whole story — provided the
 * caller's four handlers keep their identity, which is what `userId` above is
 * for.
 */
export default memo(DraggableMemberChip);
