/**
 * Where the trip actually stands, in three lines, at the top of the page.
 *
 * Everything here was already on the trip page — but spread across the
 * sections you had to open and read to answer "are we going yet?". The rest of
 * the page starts collapsed precisely because this card exists.
 */
import { format } from "date-fns";
import { Link } from "wouter";
import { CalendarCheck, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One figure, linking to the section it summarises — the summary is a place to
 * start from, not a dead end.
 */
function Line({
  label,
  value,
  href,
  done,
}: {
  label: string;
  value: string;
  href: string;
  /** Green when the group has settled it; muted while it is still open. */
  done: boolean;
}) {
  return (
    <Link href={href}>
      <div className="flex items-baseline justify-between gap-3 text-sm py-0.5 rounded cursor-pointer hover:bg-muted/40 transition-colors">
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span
          className={`text-right font-medium truncate ${done ? "text-green-600" : "text-muted-foreground"}`}
        >
          {value}
        </span>
      </div>
    </Link>
  );
}

export default function TripSummary({
  tripId,
  lockedDate,
  lockedSuggestions,
  totalSuggestions,
  lockedAccommodations,
  totalAccommodations,
  open,
  onToggle,
}: {
  tripId: number;
  /** The one locked date proposal, if the group has picked one. */
  lockedDate?: { startDate: string | Date; endDate: string | Date } | null;
  lockedSuggestions: number;
  totalSuggestions: number;
  lockedAccommodations: number;
  totalAccommodations: number;
  open: boolean;
  onToggle: () => void;
}) {
  const dates = lockedDate
    ? `${format(new Date(lockedDate.startDate), "d MMM")} – ${format(
        new Date(lockedDate.endDate),
        "d MMM yyyy"
      )}`
    : "Not finalised";

  const countOf = (locked: number, total: number) =>
    locked > 0 ? `${locked} of ${total} finalised` : `${total} proposed`;

  return (
    <Card className="border-border/50 py-0">
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 p-3 text-left"
        >
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <p className="flex-1 text-sm font-medium">Summary</p>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-1.5">
            <Line
              label="Dates"
              value={dates}
              href={`/trips/${tripId}/dates`}
              done={Boolean(lockedDate)}
            />
            <Line
              label="Accommodations"
              value={countOf(lockedAccommodations, totalAccommodations)}
              href={`/trips/${tripId}/accommodations`}
              done={lockedAccommodations > 0}
            />
            <Line
              label="Suggestions"
              value={countOf(lockedSuggestions, totalSuggestions)}
              href={`/trips/${tripId}/suggestions`}
              done={lockedSuggestions > 0}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
