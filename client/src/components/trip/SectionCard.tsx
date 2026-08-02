/**
 * The trip page's sections, and the pieces that make one.
 *
 * `SectionCard` wraps a list of proposals; `CollapsibleRow` wraps prose or a
 * link. Both collapse, because a trip page that renders every section expanded
 * is a page you scroll rather than read.
 */
import React from "react";
import { useLocation, Link } from "wouter";
import { CheckCircle2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      className="gap-1 h-8 text-xs rounded-lg shrink-0"
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
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /**
   * How many proposals in this section are finalised. Dates can only ever be
   * 0 or 1 and read "Decided"; places and accommodations count up.
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
  title,
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
      className={`border py-0 ${locked ? "border-green-200 bg-green-50/40 dark:bg-green-950/10" : "border-border/50"} ${className ?? ""}`}
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-3 px-3 pt-3 pb-2">
          <button
            onClick={onToggle}
            aria-expanded={open}
            className="flex flex-1 min-w-0 items-center gap-3 text-left"
          >
            <div
              className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${locked ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"}`}
            >
              {locked ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{title}</span>
              {locked && (
                <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 px-1.5">
                  {singleLock ? "Decided" : `${lockedCount} finalised`}
                </Badge>
              )}
              {!locked && pendingCount && pendingCount > 0 ? (
                <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 px-1.5">
                  {pendingCount} to vote
                </Badge>
              ) : null}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && addSlot}
        </div>
        {open && (
          <>
            {/* An empty list still arrives as `[]`, which is truthy — count the
                rendered children rather than the expression that made them. */}
            {React.Children.count(children) > 0 ? (
              <div className="px-3 pb-2 space-y-1.5">{children}</div>
            ) : (
              <p className="px-3 pb-3 text-xs text-muted-foreground">
                {emptyText}
              </p>
            )}
            <Link href={href}>
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer rounded-b-xl">
                <span>View all details</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A plain collapsible block for the sections that are a link rather than a list
 * — budget, vibe board, itinerary, the referee, and the trip description.
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
    <Card className="border-border/50 py-0">
      <CardContent className="p-0">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-3 p-3 text-left"
        >
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass ?? "bg-primary/10 text-primary"}`}
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
        {open && <div className="px-3 pb-3">{children}</div>}
      </CardContent>
    </Card>
  );
}
