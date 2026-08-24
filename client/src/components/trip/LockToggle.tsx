/**
 * Finalise or un-finalise one proposal, in the space of an icon.
 *
 * Dates allow one lock and suggestions and accommodations allow many, but that is
 * the caller's problem — from here it is one row, on or off.
 */
import { Lock, Unlock } from "lucide-react";

export default function LockToggle({
  locked,
  canLock,
  busy,
  disabledReason,
  onToggle,
}: {
  locked: boolean;
  /** Admins only. Everyone else sees the padlock as a static badge. */
  canLock: boolean;
  busy?: boolean;
  /**
   * Why finalising is refused right now, if it is — today only "everybody
   * abstained". The server refuses regardless; this turns a padlock that does
   * nothing into one that says why.
   */
  disabledReason?: string | null;
  onToggle: () => void;
}) {
  // Un-finalising is never blocked, so the reason only applies on the way in.
  const blocked = !locked && Boolean(disabledReason);
  if (!canLock) {
    return locked ? (
      <Lock className="h-3.5 w-3.5 text-green-600" aria-label="Finalised" />
    ) : null;
  }
  return (
    <button
      onClick={e => {
        // The row itself navigates into the section.
        e.stopPropagation();
        onToggle();
      }}
      disabled={busy || blocked}
      aria-pressed={locked}
      aria-label={locked ? "Un-finalise this option" : "Finalise this option"}
      title={
        blocked
          ? (disabledReason ?? undefined)
          : locked
            ? "Un-finalise"
            : "Finalise"
      }
      className={`p-0.5 rounded transition-colors disabled:opacity-50 ${
        locked
          ? "text-green-600 hover:bg-green-100"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {locked ? (
        <Lock className="h-3.5 w-3.5" />
      ) : (
        <Unlock className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
