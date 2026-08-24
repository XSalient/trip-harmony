/**
 * "Go with the majority" — the vote for having no preference.
 *
 * Its own full-width row rather than a fourth chip beside Yes/Maybe/No, for
 * two reasons: four buttons across a phone leaves each one too narrow to read,
 * and this is not a fourth opinion. It states that you have none and will take
 * whatever the group decides, which is a different kind of answer and looks
 * like one.
 *
 * It counts as having voted — that is the point, it stops one person's
 * indifference reading as a chase — and it is worth nothing in the score
 * (`shared/votes.ts`).
 */
import { MAJORITY_VOTE, VOTE_LABELS } from "@shared/votes";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default function AbstainButton({
  active,
  onVote,
  className = "",
}: {
  active: boolean;
  onVote: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onVote}
      aria-pressed={active}
      className={`w-full rounded-lg text-xs h-8 font-normal text-muted-foreground ${
        active ? "bg-muted text-foreground border-foreground/20" : ""
      } ${className}`}
    >
      <Users className="h-3.5 w-3.5 mr-1.5" />
      {VOTE_LABELS[MAJORITY_VOTE]}
    </Button>
  );
}
