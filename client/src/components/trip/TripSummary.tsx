/**
 * Where the trip actually stands, in three lines, at the top of the page.
 *
 * Everything here was already on the trip page — but spread across the
 * sections you had to open and read to answer "are we going yet?". The rest of
 * the page starts collapsed precisely because this card exists.
 */
import { format } from "date-fns";
import { Link } from "wouter";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Disclosure } from "@/components/harmony/Disclosure";
import { ProgressRing } from "@/components/harmony/ProgressRing";
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
  /** Settled by the group, as opposed to still open. */
  done: boolean;
}) {
  return (
    <Link href={href} className="block">
      <div className="pressable-lg -mx-2 flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-[14px] transition-colors hover:bg-muted/50">
        <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {/* A dot, not a tick. Five ticks down one column said "settled" five
              times and nothing about which line still needed anybody — the
              open ones are what the reader is looking for. */}
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${done ? "bg-success" : "bg-warning"}`}
          />
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <span
            className={`tabular truncate text-right ${done ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            {value}
          </span>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
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

  // How much of the trip is decided. Only the sections this trip actually uses
  // count — a trip with the budget switched off is not permanently stuck at
  // three quarters.
  const decisions: Array<[SectionKey, boolean]> = [
    ["dates", Boolean(lockedDate)],
    ["accommodations", lockedAccommodations > 0],
    ["suggestions", lockedSuggestions > 0],
    ["budget", Boolean(budget)],
  ];
  const live = decisions.filter(([key]) => shows(key));
  const settled = {
    done: live.filter(([, ok]) => ok).length,
    total: live.length,
  };
  const headline =
    settled.total === 0
      ? "Nothing to settle"
      : settled.done === settled.total
        ? "All settled"
        : settled.done === 0
          ? "Just getting started"
          : "Coming together";

  return (
    <Card className="border-border/70 py-0">
      <CardContent className="p-0">
        {/* The header answers "are we going yet?" on its own, which is what
            the card is for — a row labelled "Summary" answered nothing and
            still had to be opened to say anything. */}
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="pressable-lg flex w-full items-center gap-3 p-3 text-left"
        >
          <ProgressRing
            value={settled.total ? (settled.done / settled.total) * 100 : 0}
            size={44}
            stroke={4}
            label="Trip progress"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-bold tracking-tight">
              {headline}
            </span>
            <span className="block text-[13px] text-muted-foreground">
              {settled.done} of {settled.total} decisions settled
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <Disclosure open={open}>
          <div className="space-y-1.5 px-3 pb-3">
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
            {/* Who is coming is a fact, not a decision — it gets no dot and
                does not count towards the ring. */}
            {headcount && (
              <Link href={`/trips/${tripId}/members`} className="block">
                <div className="pressable-lg -mx-2 flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-[14px] transition-colors hover:bg-muted/50">
                  <span className="shrink-0 pl-3.5 text-muted-foreground">
                    Coming
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="tabular truncate text-right font-semibold text-foreground">
                      {who(headcount)}
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
