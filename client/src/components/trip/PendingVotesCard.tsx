/**
 * The votes you still owe the group, and one button that takes you to them.
 *
 * This replaces a card that said the same thing and did nothing — "You have 5
 * unvoted proposals · Open a section below to vote" — which left the reader to
 * find the sections themselves on a page where every section starts collapsed.
 * The count was already known here; only the way out of the card is new.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** How many proposals in each section are still waiting on this person. */
export type PendingVotes = {
  dates: number;
  accommodations: number;
  destinations: number;
  budgets: number;
};

/**
 * "3 accommodations · 2 budget" — the sections that are actually waiting, in
 * the order the page renders them, so the sentence matches the scroll.
 */
function breakdown(pending: PendingVotes): string {
  const of = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const parts: string[] = [];
  if (pending.dates) parts.push(of(pending.dates, "date", "dates"));
  if (pending.accommodations)
    parts.push(of(pending.accommodations, "accommodation", "accommodations"));
  if (pending.destinations)
    parts.push(of(pending.destinations, "suggestion", "suggestions"));
  if (pending.budgets) parts.push(of(pending.budgets, "budget", "budgets"));
  return parts.join(" · ");
}

export default function PendingVotesCard({
  pending,
  total,
  onStart,
}: {
  pending: PendingVotes;
  total: number;
  /** Opens the first waiting section and scrolls to it. */
  onStart: () => void;
}) {
  return (
    <Card className="rounded-2xl border-0 bg-card py-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="text-base font-semibold">
            {total} proposal{total > 1 ? "s" : ""} need
            {total > 1 ? "" : "s"} your vote
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {breakdown(pending)}
          </p>
        </div>
        <Button
          className="w-full h-12 rounded-xl text-base font-semibold"
          onClick={onStart}
        >
          Start voting
        </Button>
      </CardContent>
    </Card>
  );
}
