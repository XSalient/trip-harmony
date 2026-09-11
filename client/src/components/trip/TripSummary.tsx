/**
 * Where the trip actually stands, in three lines, at the top of the page.
 *
 * Everything here was already on the trip page — but spread across the
 * sections you had to open and read to answer "are we going yet?". The rest of
 * the page starts collapsed precisely because this card exists.
 */
import { format } from "date-fns";
import { Link } from "wouter";
import { CalendarCheck, Check, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SectionKey } from "@shared/sections";

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
    <Link href={href} className="block">
      <div className="-mx-2 flex min-h-9 items-center justify-between gap-3 rounded-lg px-2 text-[14px] transition-colors hover:bg-muted/50">
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {done && (
            <Check
              className="size-3.5 shrink-0 text-success"
              aria-label="settled"
            />
          )}
          <span
            className={`truncate text-right tabular ${done ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            {value}
          </span>
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
  budget,
  headcount,
  hiddenSections = [],
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
  /** The finalised budget as one trip total, when the group has settled it. */
  budget?: { currency: string; tripTotal: number } | null;
  /** Adults and children. Pets are shown but never divided by. */
  headcount?: {
    adults: number;
    children: number;
    pets: number;
  } | null;
  /**
   * Sections this trip has switched off. Each line here links to a section's
   * own screen, so a line for a hidden one is a link to a notice saying the
   * thing you just tapped does not apply to this trip.
   */
  hiddenSections?: SectionKey[];
  open: boolean;
  onToggle: () => void;
}) {
  const dates = lockedDate
    ? `${format(new Date(lockedDate.startDate), "d MMM")} – ${format(
        new Date(lockedDate.endDate),
        "d MMM yyyy"
      )}`
    : "Not finalised";

  const who = (h: { adults: number; children: number; pets: number }) => {
    const parts = [`${h.adults} ${h.adults === 1 ? "adult" : "adults"}`];
    if (h.children)
      parts.push(`${h.children} ${h.children === 1 ? "child" : "children"}`);
    if (h.pets) parts.push(`${h.pets} ${h.pets === 1 ? "pet" : "pets"}`);
    return parts.join(" · ");
  };

  const countOf = (locked: number, total: number) =>
    locked > 0 ? `${locked} of ${total} finalised` : `${total} proposed`;

  const shows = (section: SectionKey) => !hiddenSections.includes(section);

  return (
    <Card className="border-border/70 py-0">
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 p-3 text-left"
        >
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <CalendarCheck className="h-5 w-5" />
          </div>
          <p className="flex-1 text-sm font-medium">Summary</p>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-1.5">
            {shows("dates") && (
              <Line
                label="Dates"
                value={dates}
                href={`/trips/${tripId}/dates`}
                done={Boolean(lockedDate)}
              />
            )}
            {shows("accommodations") && (
              <Line
                label="Accommodations"
                value={countOf(lockedAccommodations, totalAccommodations)}
                href={`/trips/${tripId}/accommodations`}
                done={lockedAccommodations > 0}
              />
            )}
            {shows("suggestions") && (
              <Line
                label="Suggestions"
                value={countOf(lockedSuggestions, totalSuggestions)}
                href={`/trips/${tripId}/suggestions`}
                done={lockedSuggestions > 0}
              />
            )}
            {shows("budget") && (
              <Line
                label="Budget"
                value={
                  budget
                    ? `${budget.currency} ${Math.round(budget.tripTotal).toLocaleString()}`
                    : "Not finalised"
                }
                href={`/trips/${tripId}/budget`}
                done={Boolean(budget)}
              />
            )}
            {headcount && (
              <Line
                label="Coming"
                value={who(headcount)}
                href={`/trips/${tripId}/members`}
                done={headcount.adults + headcount.children > 0}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
