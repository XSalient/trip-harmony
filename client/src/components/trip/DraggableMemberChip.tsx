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
 */
import { motion, type PanInfo } from "framer-motion";
import { GripVertical, X } from "lucide-react";

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

export default function DraggableMemberChip({
  label,
  isMe,
  canMove,
  removeLabel,
  onRemove,
  dragging,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  label: string;
  isMe: boolean;
  /** False for somebody this caller may not reorganise — no drag, no cross. */
  canMove: boolean;
  removeLabel: string;
  /** True while this chip is the one in hand. */
  dragging: boolean;
  onRemove: () => void;
  onDragStart: () => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (info: PanInfo) => void;
}) {
  const base = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
    isMe ? "border-primary/40 bg-primary/5" : "border-border/60"
  }`;

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
      dragSnapToOrigin
      dragMomentum={false}
      // A short hold before the drag takes over, so a tap on the × is a tap
      // and a scroll past the chip is a scroll.
      dragElastic={0.2}
      whileDrag={{ scale: 1.08, zIndex: 50, cursor: "grabbing" }}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info)}
      onDragEnd={(_, info) => onDragEnd(info)}
      {...(dragging ? { [DRAGGING_ATTR]: "true" } : {})}
      className={`${base} relative cursor-grab touch-none select-none active:cursor-grabbing`}
    >
      <GripVertical className="h-3 w-3 text-muted-foreground/60" />
      {label}
      {isMe && <span className="text-muted-foreground">(you)</span>}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
        aria-label={removeLabel}
      >
        <X className="h-3 w-3" />
      </button>
    </motion.span>
  );
}
