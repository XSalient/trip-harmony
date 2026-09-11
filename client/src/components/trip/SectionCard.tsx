/**
 * The trip page's sections, and the pieces that make one.
 *
 * `SectionCard` wraps a list of proposals; `CollapsibleRow` wraps prose or a
 * link. Both collapse, because a trip page that renders every section expanded
 * is a page you scroll rather than read.
 */
import React from "react";
import { useLocation, Link } from "wouter";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Disclosure } from "@/components/harmony/Disclosure";

/**
 * Sends you to the section's own screen with its add dialog already open.
 *
 * The trip page used to host a thinner copy of each add form — `QuickAddStay`
 * asked for a name, a link and a price, while the accommodations screen asks
 * for all that plus beds, parking, amenities, URL import and the paste
 * fallback. Two forms for one job drift, and one of them is always behind.
 */
export function AddProposalButton({ href }: { href: string }) {
  const [, navigate] = useLocation();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 shrink-0 gap-1 rounded-full text-xs touch-target"
      onClick={e => {
        // The section header toggles; this goes somewhere more specific.
        e.stopPropagation();
        navigate(href);
      }}
    >
      <Plus className="h-3.5 w-3.5" /> Add
    </Button>
  );
}

/**
 * The way out of a collapsed section into its own screen. `SectionCard` has its
 * own "View all details" footer; this is the equivalent for `CollapsibleRow`,
 * whose body is prose rather than a list.
 */
export function SectionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        {children}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

type SectionCardProps = {
  /** Anchor, so something elsewhere on the page can scroll this into view. */
  id?: string;
  title: string;
  /**
   * Tile colour, from the category ramp — `bg-cat-3-soft text-cat-3-on-soft`.
   * Every section painted in the one brand violet made the page a single
   * column of identical rows; a hue per section is what makes it scannable.
   */
  tone?: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /**
   * How many proposals in this section are finalised. Dates can only ever be
   * 0 or 1 and read "Decided"; suggestions and accommodations count up.
   */
  lockedCount?: number;
  /** Dates are single-lock, so their badge says "Decided" rather than "1 finalised". */
  singleLock?: boolean;
  pendingCount?: number;
  addSlot?: React.ReactNode;
  children?: React.ReactNode;
  emptyText: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
};

/**
 * A collapsible section of the trip page.
 *
 * The header toggles; "View all details" navigates. The whole card used to be
 * the navigation target, which cannot coexist with a header that expands — so
 * the two jobs are now separate controls rather than one ambiguous one.
 *
 * Collapsed, the header still carries everything you need to decide whether to
 * open it: the count of finalised options, and how many proposals are waiting
 * on your vote.
 */
export default function SectionCard({
  id,
  title,
  tone,
  icon: Icon,
  href,
  lockedCount = 0,
  singleLock,
  pendingCount,
  addSlot,
  children,
  emptyText,
  open,
  onToggle,
  className,
}: SectionCardProps) {
  const locked = lockedCount > 0;
  // `py-0` because the card manages its own padding — `Card`'s default `py-6`
  // is dead space on a collapsed section, and every section starts collapsed.
  return (
    <Card
      id={id}
      // `scroll-mt` keeps the sticky header from covering the section this
      // lands on when something scrolls it into view.
      className={`relative scroll-mt-20 overflow-hidden rounded-2xl border border-border/70 py-0 shadow-e1 transition-shadow hover:shadow-e2 ${className ?? ""}`}
    >
      {locked && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-success"
        />
      )}
      <CardContent className="p-0">
        <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="pressable-lg flex flex-1 min-w-0 items-center gap-3 text-left"
          >
            {/* The section keeps its own icon once it is decided.
                It used to be replaced by a tick, which meant every settled
                section looked identical — four rows of the same green circle,
                and no way to find dates without reading. The tick is now a
                corner mark on the tile, so the row still says what it is. */}
            <div
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-[10px] ${tone ?? "bg-primary/12 text-primary"}`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {locked && (
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-card"
                >
                  <Check className="size-2.5 stroke-[3px]" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-semibold tracking-tight">
                {title}
              </span>
              {locked && (
                <Badge className="rounded-md border-0 bg-success-soft px-1.5 text-[11px] font-semibold text-success-on-soft">
                  {singleLock ? "Decided" : `${lockedCount} finalised`}
                </Badge>
              )}
              {!locked && pendingCount && pendingCount > 0 ? (
                <Badge className="rounded-md border-0 bg-warning-soft px-1.5 text-[11px] font-semibold text-warning-on-soft">
                  {pendingCount} to vote
                </Badge>
              ) : null}
            </div>
          </button>
          {open && addSlot}
          {/* The chevron is a sibling of the title button rather than the last
              thing inside it, so that Add can sit between them. Expanding a
              section used to push the chevron inward and put Add under the
              thumb that had just opened it: the control you were using moved
              the moment you used it. It is the right-most thing in both states
              now, and Add appears to its left.

              Deliberately not a second tab stop — `aria-expanded` and the
              accessible name live on the title button, and this is the same
              action a second time. A screen reader announcing two controls for
              one section would be a worse page than the one this fixes. */}
          <button
            onClick={onToggle}
            aria-hidden="true"
            tabIndex={-1}
            className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground touch-target hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        {/* Opening a section grows it rather than replacing the layout in one
            frame, and its proposals arrive one after the other rather than all
            at once — the order is the information (MASTER §7 `stagger-sequence`). */}
        <Disclosure open={open}>
          {/* An empty list still arrives as `[]`, which is truthy — count the
              rendered children rather than the expression that made them. */}
          {React.Children.count(children) > 0 ? (
            <div className="space-y-2 px-3.5 pb-3">
              {React.Children.map(children, (child, i) => (
                <div
                  className="stagger-item"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {child}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3.5 pb-3 text-[13px] text-muted-foreground">
              {emptyText}
            </p>
          )}
          <Link href={href}>
            <div className="pressable-lg flex min-h-11 cursor-pointer items-center justify-between rounded-b-2xl border-t border-border/60 px-3.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
              <span>View all details</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        </Disclosure>
      </CardContent>
    </Card>
  );
}

/**
 * A plain collapsible block for the sections that are a link rather than a list
 * — budget, the referee, and the trip description.
 */
export function CollapsibleRow({
  title,
  subtitle,
  icon,
  iconClass,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconClass?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 py-0 shadow-e1">
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="pressable-lg flex min-h-[52px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${iconClass ?? "bg-primary/12 text-primary"}`}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <Disclosure open={open}>
          <div className="px-3 pb-3">{children}</div>
        </Disclosure>
      </CardContent>
    </Card>
  );
}
