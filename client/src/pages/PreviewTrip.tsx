import { useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  HelpCircle,
  MapPin,
  MessageCircle,
  MoreVertical,
  Plus,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * A faithful mock of the trip screen, with no data layer behind it.
 *
 * The real one is auth-gated, so without a session the only way to judge its
 * density, hierarchy and colour is to rebuild its markup here. This is a design
 * surface, not a second implementation: it deliberately uses plain markup so it
 * can be changed quickly, and nothing imports it.
 *
 * Development only, same as the rest of /preview.
 */

/* ------------------------------------------------------------ summary --- */

function SummaryLine({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done?: boolean;
}) {
  return (
    <div className="-mx-2 flex min-h-9 items-center justify-between gap-3 rounded-lg px-2 text-[14px] transition-colors hover:bg-muted/50">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {done && <Check className="size-3.5 shrink-0 text-success" />}
        <span
          className={cn(
            "tabular truncate text-right",
            done ? "font-semibold text-foreground" : "text-muted-foreground"
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- rows --- */

function CollapsibleRow({
  icon: Icon,
  title,
  subtitle,
  tone = "bg-primary/12 text-primary",
}: {
  icon: typeof FileText;
  title: string;
  subtitle?: string;
  tone?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-e1">
      <button className="flex min-h-[52px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            tone
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight">
            {title}
          </span>
          {subtitle && (
            <span className="block truncate text-[13px] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

function VoteRow({
  title,
  meta,
  yes,
  maybe,
  no,
  voted,
  mine,
  selected,
}: {
  title: string;
  meta: string;
  yes: number;
  maybe: number;
  no: number;
  voted: string;
  mine?: "yes" | "maybe" | "no";
  selected?: boolean;
}) {
  const [vote, setVote] = useState(mine);
  const options = [
    {
      key: "yes" as const,
      label: "Yes",
      icon: Check,
      active: "bg-success-soft text-success-on-soft",
    },
    {
      key: "maybe" as const,
      label: "Maybe",
      icon: HelpCircle,
      active: "bg-warning-soft text-warning-on-soft",
    },
    {
      key: "no" as const,
      label: "No",
      icon: X,
      active: "bg-danger-soft text-danger-on-soft",
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-3 text-[13px] shadow-e1">
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-success"
        />
      )}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{title}</p>
          <p className="tabular truncate text-[12px] text-muted-foreground">
            {meta}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <span className="flex items-center gap-0.5 text-[12px]">
            <MessageCircle className="size-3" />1
          </span>
          <button className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
            <MoreVertical className="size-4" />
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <span className="flex items-center gap-1 text-success">
          <Check className="size-3.5" />
          <span className="tabular font-semibold">{yes}</span>
        </span>
        <span className="flex items-center gap-1 text-warning">
          <HelpCircle className="size-3.5" />
          <span className="tabular font-semibold">{maybe}</span>
        </span>
        <span className="flex items-center gap-1 text-danger">
          <X className="size-3.5" />
          <span className="tabular font-semibold">{no}</span>
        </span>
        <span className="tabular ml-auto text-[12px] text-muted-foreground">
          {voted}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-1 rounded-full bg-muted/70 p-1">
          {options.map(o => (
            <button
              key={o.key}
              onClick={() => setVote(o.key)}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors",
                vote === o.key
                  ? cn(o.active, "font-semibold shadow-e1")
                  : "text-muted-foreground"
              )}
            >
              <o.icon className="size-4" />
              {o.label}
            </button>
          ))}
        </div>
        <button className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full text-[12px] font-medium text-muted-foreground">
          <Users className="size-4" />
          Go with the majority
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- screen --- */

export default function PreviewTrip() {
  const [open, setOpen] = useState(true);

  return (
    <div className="screen-forward min-h-dvh bg-background">
      <header className="glass-flat safe-area-top sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-4">
          <Button variant="ghost" size="icon" className="-ml-2 shrink-0">
            <ChevronRight className="size-5 rotate-180" />
          </Button>
          <h1 className="flex-1 truncate font-display text-lg font-bold tracking-tight">
            Lisbon &amp; the Algarve
          </h1>
          <Button variant="ghost" size="icon" className="shrink-0">
            <Users className="size-5" />
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-3 px-4 py-3 pb-nav">
        {/* Status, as a compact figure list rather than five green headlines. */}
        <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-e1">
          <SummaryLine label="Dates" value="21 Sep – 30 Sep 2026" done />
          <SummaryLine label="Accommodations" value="1 of 5 finalised" done />
          <SummaryLine label="Suggestions" value="2 of 5 finalised" done />
          <SummaryLine label="Budget" value="Not finalised" />
          <SummaryLine label="Coming" value="7 adults" done />
        </div>

        <CollapsibleRow icon={FileText} title="Trip Description" />
        <CollapsibleRow
          icon={Check}
          title="My Trip Preferences"
          subtitle="Saved · 6/7 members submitted"
          tone="bg-success-soft text-success-on-soft"
        />

        {/* Settled sections are marked by a spine and a pill — not a tint that
            recolours everything nested inside them. */}
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-e1">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-success"
          />
          <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-success-soft text-success-on-soft">
                <CalendarDays className="h-[18px] w-[18px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold tracking-tight">
                  Dates
                </span>
                <Badge className="rounded-md border-0 bg-success-soft px-1.5 text-[11px] font-semibold text-success-on-soft">
                  Decided
                </Badge>
              </span>
            </button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1 rounded-full text-xs"
            >
              <Plus className="size-3.5" />
              Add
            </Button>
            <button className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground">
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  open && "rotate-180"
                )}
              />
            </button>
          </div>

          {open && (
            <div className="space-y-2 px-3.5 pb-3">
              <VoteRow
                title="First week of September"
                meta="Aug 31 – Sep 9, 2026 · 9n"
                yes={3}
                maybe={1}
                no={2}
                voted="6/6 voted"
                mine="maybe"
              />
              <VoteRow
                title="Late September — shoulder season"
                meta="Sep 21 – Sep 30, 2026 · 9n"
                yes={5}
                maybe={1}
                no={0}
                voted="6/6 voted"
                selected
              />
            </div>
          )}

          <div className="flex min-h-11 items-center justify-between border-t border-border/60 px-3.5 py-2 text-[13px] text-muted-foreground">
            View all dates
            <ChevronRight className="size-3.5" />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-e1">
          <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/12 text-primary">
              <MapPin className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight">
                Suggestions
              </span>
              <Badge className="rounded-md border-0 bg-warning-soft px-1.5 text-[11px] font-semibold text-warning-on-soft">
                3 to vote
              </Badge>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="px-3.5 pb-3 text-[13px] text-muted-foreground">
            Five places on the table, two already agreed.
          </div>
        </div>

        <CollapsibleRow
          icon={Wallet}
          title="Budget"
          subtitle="Not finalised"
          tone="bg-cat-6-soft text-cat-6-on-soft"
        />
      </main>

      {/* Nav, at the real size so collisions show up here rather than on a phone. */}
      <nav className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="glass pointer-events-auto mx-auto mb-2 flex w-fit max-w-[calc(100%-1rem)] items-center gap-0.5 rounded-full p-1 shadow-e3">
          {[
            { icon: Home, label: "Home", active: true },
            { icon: Plus, label: "New Trip", create: true },
            { icon: Bell, label: "Alerts" },
            { icon: User, label: "Profile" },
          ].map(item => (
            <span
              key={item.label}
              className={cn(
                "relative flex min-h-12 min-w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-1.5",
                item.create
                  ? "grad-brand text-primary-foreground shadow-e2"
                  : item.active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground"
              )}
            >
              <item.icon
                className={cn("h-5 w-5", item.active && "stroke-[2.5px]")}
              />
              <span
                className={cn(
                  "text-[10px]",
                  item.active ? "font-semibold" : "font-medium"
                )}
              >
                {item.label}
              </span>
            </span>
          ))}
        </div>
      </nav>
    </div>
  );
}
