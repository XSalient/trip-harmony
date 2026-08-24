/**
 * "3/6 voted" — and, when you ask it, which three and who is holding it up.
 *
 * The count alone was the one thing every screen showed and the one thing that
 * never answered the question people actually have, which is who to chase.
 *
 * The denominator is **voters**, not people: on a trip that votes per group a
 * family is one voter, and watchers are in neither mode's count. It is computed
 * once on the server (`trips.get` → `voterCount`) and passed in, because four
 * screens deriving it themselves is how one page came to say "2/4" while the
 * next said "2/3".
 *
 * Watchers get plain text: they receive vote counts but no vote authorship, so
 * there is nothing to open.
 */
import { useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { VOTE_LABELS, VOTE_TONE, countAbstentions } from "@shared/votes";

type ProposalType = "date" | "destination" | "accommodation" | "budget";

export default function VotedCount({
  tripId,
  proposalType,
  proposalId,
  votedCount,
  voterCount,
  votes,
  canSeeDetail,
  className = "",
}: {
  tripId: number;
  proposalType: ProposalType;
  proposalId: number;
  votedCount: number;
  /** Groups plus ungrouped tripmates in group mode; accepted tripmates otherwise. */
  voterCount: number;
  /**
   * The cast votes, only so the abstentions can be named. They are never added
   * to the Yes/Maybe/No counts: "go with the majority" states no preference,
   * and folding it into whichever side is winning would put words in people's
   * mouths.
   */
  votes?: { vote: string }[] | null;
  /** False for watchers — they see the tally, never who cast what. */
  canSeeDetail: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const abstained = countAbstentions(votes);
  const label = `${votedCount}/${voterCount} voted`;
  const aside = abstained > 0 ? ` · ${abstained} going with the majority` : "";

  const { data, isLoading } = trpc.comments.voters.useQuery(
    { tripId, proposalType, proposalId },
    { enabled: open && canSeeDetail }
  );

  if (!canSeeDetail) {
    return (
      <span className={`text-muted-foreground ${className}`}>
        {label}
        {aside}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={e => {
          // Rows are often clickable themselves.
          e.stopPropagation();
          setOpen(true);
        }}
        className={`text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors ${className}`}
      >
        {label}
        {aside}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Who voted</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-2 pt-1">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {(data?.voted.length ?? 0) > 0 && (
                <div className="space-y-1.5">
                  {data?.voted.map(v => (
                    <div
                      key={v.userId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="flex-1 truncate">
                        {v.name || "Member"}
                        {v.group && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {v.group}
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-medium ${VOTE_TONE[v.vote] ?? ""}`}
                      >
                        {VOTE_LABELS[v.vote] ?? v.vote}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                        {format(new Date(v.at), "d MMM HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(data?.notVoted.length ?? 0) > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Still to vote
                  </p>
                  {data?.notVoted.map(m => (
                    <p
                      key={m.userId}
                      className="text-sm text-muted-foreground truncate"
                    >
                      {/* In group mode this list is of groups, not people:
                          naming both adults in one family reads as two chases
                          for one decision. */}
                      {m.group || m.name || "Member"}
                    </p>
                  ))}
                </div>
              )}

              {data &&
                data.voted.length === 0 &&
                data.notVoted.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nobody has voted on this yet.
                  </p>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
