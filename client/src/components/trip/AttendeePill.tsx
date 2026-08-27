/**
 * One person on the trip who has no account — a child, a partner who will not
 * install anything, the dog.
 *
 * The same chip a member gets, and for the same reason: two rows on a card
 * that look alike but behave differently is the thing people report as broken.
 * It drags between cards, its body opens the edit dialog, and its `×` removes
 * the person from the trip — which is what `×` means here, there being no
 * account to leave behind.
 *
 * Clicking and dragging share one surface, so `DraggableChip` swallows the
 * click that ends a drag; without that, every drop would also open the dialog.
 *
 * Rows that stand for a member never reach here — the page buckets those out,
 * and the server refuses to move one on its own anyway.
 */
import type { PanInfo } from "framer-motion";
import { Baby, PawPrint, X } from "lucide-react";
import { memo } from "react";
import DraggableChip, { dragIdFor } from "./DraggableChip";

function AttendeePill({
  attendee,
  canEdit,
  dragging,
  isPending,
  layoutId,
  onEdit,
  onRemove,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  attendee: { id: number; name: string; kind: string; age: number | null };
  /** False for somebody this caller may not change — no drag, no click, no cross. */
  canEdit: boolean;
  dragging: boolean;
  isPending?: boolean;
  layoutId?: string;
  onEdit: (attendee: any) => void;
  onRemove: (id: number) => void;
  onDragStart: (dragId: string) => void;
  onDrag: (info: PanInfo) => void;
  onDragEnd: (dragId: string, info: PanInfo) => void;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px]";

  const body = (
    <>
      {attendee.kind === "pet" ? (
        <PawPrint className="h-3 w-3 text-muted-foreground" />
      ) : attendee.kind === "child" ? (
        <Baby className="h-3 w-3 text-muted-foreground" />
      ) : null}
      {attendee.name}
      {/* Never for a pet, and never to a watcher — the server strips it
          either way. */}
      {attendee.age != null && (
        <span className="text-muted-foreground">{attendee.age}</span>
      )}
    </>
  );

  if (!canEdit) return <span className={base}>{body}</span>;

  return (
    <DraggableChip
      dragId={dragIdFor("attendee", attendee.id)}
      className={base}
      dragging={dragging}
      isPending={isPending}
      layoutId={layoutId}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onActivate={() => onEdit(attendee)}
      activateLabel={`Edit ${attendee.name}`}
      trailing={
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onRemove(attendee.id)}
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Remove ${attendee.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      }
    >
      {body}
    </DraggableChip>
  );
}

/** Memoised for the reason `DraggableMemberChip` is — see the note there. */
export default memo(AttendeePill);
