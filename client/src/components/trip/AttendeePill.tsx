/**
 * One person on the trip who has no account — a child, a partner who will not
 * install anything, the dog.
 *
 * A plain chip rather than a draggable one. Members drag between family cards
 * (`DraggableMemberChip`); an attendee is moved from the dialog behind this
 * pill instead, which is the path a keyboard and a screen reader can take and
 * the one that works on a phone where a target this size is a coin toss. Drag
 * for these can be added later — it would be an addition, not the only way in.
 *
 * The pill is a `<button>` only for somebody allowed to act on it, so a watcher
 * is not offered a control that would be refused. Rows that stand for a member
 * never reach here — the page buckets those out, and the server refuses to move
 * one on its own anyway.
 */
import { Baby, PawPrint, X } from "lucide-react";
import { memo } from "react";

function AttendeePill({
  attendee,
  canEdit,
  onEdit,
  onRemove,
}: {
  attendee: { id: number; name: string; kind: string; age: number | null };
  /** False for somebody this caller may not change — no click, no cross. */
  canEdit: boolean;
  onEdit: (attendee: any) => void;
  onRemove: (id: number) => void;
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
    <span className={base}>
      <button
        type="button"
        onClick={() => onEdit(attendee)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`Edit ${attendee.name}`}
      >
        {body}
      </button>
      <button
        type="button"
        onClick={() => onRemove(attendee.id)}
        className="text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${attendee.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default memo(AttendeePill);
