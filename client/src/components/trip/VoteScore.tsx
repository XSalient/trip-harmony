/**
 * The green (or red) number on a proposal card — and, when you tap it, what it
 * means.
 *
 * It is a weighted vote total, not a count of anything else on the card: a stay
 * with a single Yes reads "+2", which looks like it is counting something that
 * happened twice. Nothing on the screen said otherwise, so the number is now a
 * button that explains itself.
 *
 * The weights live here rather than in each page so the badge and the order the
 * cards are sorted in cannot drift apart — `scoreVotes` is what the pages sort
 * by.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A Yes is worth two Maybes, and a No outweighs a Yes — one person's objection
 * sinks an option a single champion likes. Unknown values score nothing; the
 * vote enum only ever produces these three.
 */
const VOTE_WEIGHTS = { love: 2, fine: 1, veto: -3 } as const;

const VOTE_LABELS = { love: "Yes", fine: "Maybe", veto: "No" } as const;

type Vote = { vote: string };

export function scoreVotes(votes: Vote[] | null | undefined): number {
  return (votes ?? []).reduce(
    (total, v) =>
      total + (VOTE_WEIGHTS[v.vote as keyof typeof VOTE_WEIGHTS] ?? 0),
    0
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export default function VoteScore({
  votes,
  className = "",
}: {
  votes?: Vote[] | null;
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
            {(Object.keys(VOTE_WEIGHTS) as (keyof typeof VOTE_WEIGHTS)[]).map(
              vote => {
                const count = (votes ?? []).filter(v => v.vote === vote).length;
                return (
                  <div key={vote} className="flex items-center gap-2">
                    <span className="flex-1">
                      {VOTE_LABELS[vote]}{" "}
                      <span className="text-muted-foreground">
                        ({signed(VOTE_WEIGHTS[vote])} each)
                      </span>
                    </span>
                    <span className="text-muted-foreground">×{count}</span>
                    <span className="w-10 text-right font-medium">
                      {signed(count * VOTE_WEIGHTS[vote])}
                    </span>
                  </div>
                );
              }
            )}
            <div className="flex items-center gap-2 border-t border-border/50 pt-1.5 font-semibold">
              <span className="flex-1">Total</span>
              <span className={`w-10 text-right ${tone}`}>{signed(score)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Options are ordered by this score. A No is worth more than a Yes, so
            one objection outweighs one enthusiast.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
