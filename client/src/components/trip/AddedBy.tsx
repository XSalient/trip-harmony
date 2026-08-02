/**
 * "Added by Ada · 2 Aug", under a proposal.
 *
 * Deliberately quiet — the same muted register as `FinalisedBy`, which it sits
 * beside. This is side information: useful when you wonder who suggested
 * something, never the point of the row.
 *
 * A watcher never receives `proposer` or `createdAt` (the router strips them),
 * so this renders nothing for them without needing to know their role.
 */
import { format } from "date-fns";

export default function AddedBy({
  proposal,
  currentUserId,
}: {
  proposal: {
    proposedBy?: number | null;
    proposer?: { id: number; name: string | null } | null;
    createdAt?: Date | string | null;
  };
  currentUserId?: number;
}) {
  const who =
    proposal.proposedBy == null
      ? null
      : proposal.proposedBy === currentUserId
        ? "you"
        : (proposal.proposer?.name ?? null);

  const when = proposal.createdAt ? new Date(proposal.createdAt) : null;
  const validWhen = when && !Number.isNaN(when.getTime()) ? when : null;

  if (!who && !validWhen) return null;

  return (
    <p className="text-[11px] text-muted-foreground">
      Added
      {who ? ` by ${who}` : ""}
      {validWhen ? ` · ${format(validWhen, "d MMM yyyy")}` : ""}
    </p>
  );
}
