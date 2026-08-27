/**
 * A member chip you can drag from one family to another.
 *
 * The drag itself is `DraggableChip`, shared with the people who have no
 * account. What is left here is what a *member* chip is: "(you)" on your own
 * row, and a `×` that means "out of this family" rather than "off the trip".
 */
import type { PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { memo } from "react";
import DraggableChip, { dragIdFor } from "./DraggableChip";

export {
  DROP_ATTR,
  DRAGGING_ATTR,
  groupUnderPointer,
  dragIdFor,
  parseDragId,
} from "./DraggableChip";

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
   * Passed back to every callback as a drag id, so the page can hand each chip
   * the *same* three handlers instead of minting a closure per chip per render
   * — which is what lets `memo` below do anything at all.
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
  layoutId?: string;
  onRemove: (userId: number) => void;
  onDragStart: (dragId: string) => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (dragId: string, info: PanInfo) => void;
}) {
  const base = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
    isMe ? "border-primary/40 bg-primary/5" : "border-border/60"
  }`;

  const body = (
    <>
      {label}
      {isMe && <span className="text-muted-foreground">(you)</span>}
    </>
  );

  if (!canMove) return <span className={base}>{body}</span>;

  return (
    <DraggableChip
      dragId={dragIdFor("member", userId)}
      className={base}
      dragging={dragging}
      isPending={isPending}
      layoutId={layoutId}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      trailing={
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRemove(userId)}
          className="text-muted-foreground hover:text-destructive"
          aria-label={removeLabel}
        >
          <X className="h-3 w-3" />
        </button>
      }
    >
      {body}
    </DraggableChip>
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
