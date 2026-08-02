/**
 * "Finalised by Ada · 2 Aug 2026", under a locked proposal.
 *
 * One component for all three proposal screens so they cannot describe the same
 * fact differently. Renders nothing unless the proposal is actually finalised.
 *
 * A watcher never receives `lockedBy` or `lockedAt` — the router strips them —
 * so they see the lock state without the attribution, which is the intent
 * rather than an accident of this component.
 */
import { format } from "date-fns";

type Member = { userId: number; user?: { name: string | null } | null };

export default function FinalisedBy({
  proposal,
  members,
  currentUserId,
}: {
  proposal: {
    selected?: boolean;
    lockedBy?: number | null;
    lockedAt?: Date | string | null;
  };
  members?: Member[];
  currentUserId?: number;
}) {
  if (!proposal.selected) return null;

  // Proposals finalised before lock attribution existed have no author. Say
  // "Finalised" plainly rather than inventing one.
  const who =
    proposal.lockedBy == null
      ? null
      : proposal.lockedBy === currentUserId
        ? "you"
        : (members?.find(m => m.userId === proposal.lockedBy)?.user?.name ??
          null);

  const when = proposal.lockedAt ? new Date(proposal.lockedAt) : null;
  const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;

  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      Finalised
      {who ? ` by ${who}` : ""}
      {validWhen ? ` · ${format(validWhen, "d MMM yyyy")}` : ""}
    </p>
  );
}
