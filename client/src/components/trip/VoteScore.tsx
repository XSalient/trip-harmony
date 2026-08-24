/**
 * The green (or red) number on a proposal card — and, when you tap it, what it
 * means.
 *
 * It is a weighted vote total, not a count of anything else on the card: a stay
 * with a single Yes reads "+2", which looks like it is counting something that
 * happened twice. Nothing on the screen said otherwise, so the number is now a
 * button that explains itself.
 *
 * The weights themselves live in `shared/votes.ts` — this component used to
 * carry its own copy, alongside two more on the server, which is how the badge,
 * the order the cards sort in and the referee's reasoning came to be three
 * implementations of one rule. `scoreVotes` is re-exported here because the
 * pages import it from this file.
 */
import { useState } from "react";
import {
  PREFERENCE_VOTES,
  VOTE_LABELS,
  VOTE_WEIGHTS,
  scoreVotes,
} from "@shared/votes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export { scoreVotes };

type Vote = { vote: string };

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export default function VoteScore({
  votes,
  /**
   * Which values this card's proposal type can hold. Dates and the other three
   * use different enums, and listing "Available" on a budget card was the
   * confusion this prop exists to avoid.
   */
  voteSet = PREFERENCE_VOTES,
  className = "",
}: {
  votes?: Vote[] | null;
  voteSet?: readonly string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const score = scoreVotes(votes);
  const tone =
    score > 0
      ? "text-green-600"
      : score < 0
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <>
      <button
        onClick={e => {
          // Cards are often clickable themselves.
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Vote score ${signed(score)} — how this is worked out`}
        className={`text-lg font-bold underline decoration-dotted decoration-1 underline-offset-4 ${tone} ${className}`}
      >
        {signed(score)}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Vote score {signed(score)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5 pt-1 text-sm">
            {voteSet.map(vote => {
              const weight = VOTE_WEIGHTS[vote] ?? 0;
              const count = (votes ?? []).filter(v => v.vote === vote).length;
              return (
                <div key={vote} className="flex items-center gap-2">
                  <span className="flex-1">
                    {VOTE_LABELS[vote] ?? vote}{" "}
                    <span className="text-muted-foreground">
                      ({signed(weight)} each)
                    </span>
                  </span>
                  <span className="text-muted-foreground">×{count}</span>
                  <span className="w-10 text-right font-medium">
                    {signed(count * weight)}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 border-t border-border/50 pt-1.5 font-semibold">
              <span className="flex-1">Total</span>
              <span className={`w-10 text-right ${tone}`}>{signed(score)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Options are ordered by this score. A No is worth more than a Yes, so
            one objection outweighs one enthusiast. "Go with the majority" is
            worth nothing on purpose — it states no preference to weigh.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
