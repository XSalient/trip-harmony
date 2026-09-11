/**
 * The compact proposal rows the trip page shows inside each section.
 *
 * Two shapes, because the votes differ: dates are Yes/Maybe/No on availability,
 * while suggestions and accommodations are Yes/Maybe/No on enthusiasm and share a
 * single row type. Everything around the vote buttons — the lock, the comment
 * count, the owner menu, the who-voted control — is the same in all three, so it
 * lives in `RowShell` and is written once.
 */
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import {
  Check,
  Copy,
  HelpCircle,
  MessageCircle,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  Users,
  Heart,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAJORITY_VOTE,
  VOTE_LABELS,
  finaliseBlockReason,
  type DateVote,
  type PreferenceVote,
} from "@shared/votes";
import LockToggle from "./LockToggle";
import VotedCount from "./VotedCount";
import { haptic } from "@/lib/haptics";

type ProposalType = "date" | "destination" | "accommodation" | "budget";

/** What every row needs, whatever it is a proposal for. */
type CommonProps = {
  tripId: number;
  row: any;
  detailHref: string;
  proposalType: ProposalType;
  isAdmin: boolean;
  canContribute: boolean;
  /** Voters, not members — a family is one. See `VotedCount`. */
  voterCount: number;
  commentCount: number;
  lockBusy: boolean;
  /** True when the viewer proposed this, so they may edit or delete it. */
  canManage: boolean;
  onToggleLock: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
};

function RowShell({
  row,
  tripId,
  proposalType,
  isAdmin,
  canContribute,
  voterCount,
  commentCount,
  lockBusy,
  canManage,
  onToggleLock,
  onEdit,
  onClone,
  onDelete,
  title,
  tally,
  votes,
}: CommonProps & {
  /** The proposal's own name or dates — the only part that differs above. */
  title: React.ReactNode;
  tally: React.ReactNode;
  votes: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border/70 bg-card p-3 text-[13px] shadow-e1 transition-shadow hover:shadow-e2`}
    >
      {row.selected && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-success" />
      )}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex-1 min-w-0">{title}</div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <LockToggle
            locked={row.selected}
            canLock={isAdmin}
            busy={lockBusy}
            disabledReason={finaliseBlockReason(row.votes)}
            onToggle={onToggleLock}
          />
          {commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <MessageCircle className="h-3 w-3" />
              {commentCount}
            </span>
          )}
          {canManage && !row.selected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Proposal actions" className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors touch-target hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
                  <Pencil className="h-3 w-3" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onClone} className="gap-2 text-xs">
                  <Copy className="h-3 w-3" /> Clone &amp; Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        {tally}
        <VotedCount
          className="ml-auto"
          tripId={tripId}
          proposalType={proposalType}
          proposalId={row.id}
          votedCount={row.votes?.length || 0}
          voterCount={voterCount}
          canSeeDetail={canContribute}
        />
      </div>
      {canContribute && !row.selected && votes}
    </div>
  );
}

function VoteButtons<T extends string>({
  options,
  myVote,
  onVote,
}: {
  options: ReadonlyArray<{
    vote: T;
    label: string;
    active: string;
    icon?: React.ComponentType<{ className?: string }>;
  }>;
  myVote?: T;
  onVote: (vote: T) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-full bg-muted/70 p-1">
        {options.map(btn => (
          <button
            key={btn.vote}
            onClick={() => {
              haptic("select");
              onVote(btn.vote);
            }}
            aria-pressed={myVote === btn.vote}
            className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${myVote === btn.vote ? `${btn.active} font-semibold shadow-e1` : "text-muted-foreground hover:text-foreground"}`}
          >
            {btn.icon && <btn.icon className="h-4 w-4 shrink-0" />}
            {btn.label}
          </button>
        ))}
      </div>
      {/* Its own row, not a fourth chip: it is a different kind of answer,
          and four buttons across a phone read as none. */}
      <button
        onClick={() => {
          haptic("select");
          onVote(MAJORITY_VOTE as T);
        }}
        aria-pressed={myVote === MAJORITY_VOTE}
        className={`flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          myVote === MAJORITY_VOTE
            ? "bg-muted font-semibold text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Users className="h-4 w-4 shrink-0" />
        {VOTE_LABELS[MAJORITY_VOTE]}
      </button>
    </div>
  );
}

/**
 * One entry in a proposal's vote tally.
 *
 * These were bare glyphs — `{n}✓`, `{n}?`, `{n}✗`, `{n}❤` — which are text
 * characters standing in for icons: they render inconsistently across
 * platforms, cannot be styled with the icon scale, and a screen reader reads
 * "3 check mark". Icon plus number plus an accessible label instead.
 */
function TallyChip({
  icon: Icon,
  count,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  tone: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${tone}`}
      title={`${count} ${label}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="tabular font-semibold">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const DATE_OPTIONS = [
  {
    vote: "available" as const,
    icon: Check,
    label: "Yes",
    active: "bg-success-soft text-success-on-soft border-success-border",
  },
  {
    vote: "maybe" as const,
    icon: HelpCircle,
    label: "Maybe",
    active: "bg-warning-soft text-warning-on-soft border-warning-border",
  },
  {
    vote: "unavailable" as const,
    icon: X,
    label: "No",
    active: "bg-danger-soft text-danger-on-soft border-danger-border",
  },
] as const;

const CHOICE_OPTIONS = [
  {
    vote: "love" as const,
    label: "Yes",
    active: "bg-success-soft text-success-on-soft border-success-border",
  },
  {
    vote: "fine" as const,
    label: "Maybe",
    active: "bg-warning-soft text-warning-on-soft border-warning-border",
  },
  {
    vote: "veto" as const,
    label: "No",
    active: "bg-danger-soft text-danger-on-soft border-danger-border",
  },
] as const;

/** Short forms, because a proposal row has one line to say this in. */
const SCOPE_WORDS = {
  trip_total: "for the trip",
  per_person: "per person",
  per_adult: "per adult",
  per_group: "per family",
} as const;

const countVotes = (row: any, vote: string) =>
  row.votes?.filter((v: any) => v.vote === vote).length || 0;

export function DateProposalRow({
  userId,
  onVote,
  ...props
}: CommonProps & {
  userId?: number;
  onVote: (vote: DateVote) => void;
}) {
  const { row, detailHref } = props;
  const myVote = row.votes?.find((v: any) => v.userId === userId)?.vote;
  const nights = differenceInDays(
    new Date(row.endDate),
    new Date(row.startDate)
  );

  return (
    <RowShell
      {...props}
      title={
        <Link href={detailHref}>
          <span className="cursor-pointer hover:underline">
            {row.label && (
              <span className="font-medium mr-1">{row.label} · </span>
            )}
            <span className="text-muted-foreground">
              {format(new Date(row.startDate), "MMM d")} –{" "}
              {format(new Date(row.endDate), "MMM d, yyyy")} · {nights}n
            </span>
          </span>
        </Link>
      }
      tally={
        <>
          <TallyChip icon={Check} count={countVotes(row, "available")} label="available" tone="text-success" />
          <TallyChip icon={HelpCircle} count={countVotes(row, "maybe")} label="maybe" tone="text-warning" />
          <TallyChip icon={X} count={countVotes(row, "unavailable")} label="unavailable" tone="text-danger" />
        </>
      }
      votes={
        <VoteButtons options={DATE_OPTIONS} myVote={myVote} onVote={onVote} />
      }
    />
  );
}

/**
 * A budget.
 *
 * Same votes and the same shell as a suggestion; what differs is the title,
 * which has to carry two figures at once — the amount as it was written
 * ("1,400 per family") and what that comes to for the whole trip. A card
 * showing only one of them cannot be compared with the card next to it, which
 * was written in a different unit.
 */
export function BudgetProposalRow({
  userId,
  onVote,
  tripTotalLabel,
  ...props
}: CommonProps & {
  userId?: number;
  onVote: (vote: PreferenceVote) => void;
  /** The normalised trip total, e.g. "EUR 16,800 for the trip". */
  tripTotalLabel?: string;
}) {
  const { row, detailHref } = props;
  const myVote = row.votes?.find((v: any) => v.userId === userId)?.vote;

  return (
    <RowShell
      {...props}
      title={
        <>
          <Link href={detailHref}>
            <span className="font-medium cursor-pointer hover:underline">
              {row.title}
            </span>
          </Link>
          <div className="text-[11px] text-muted-foreground">
            {row.currency} {Number(row.amount).toLocaleString()}{" "}
            {SCOPE_WORDS[row.scope as keyof typeof SCOPE_WORDS] ?? ""}
            {tripTotalLabel ? ` · ${tripTotalLabel}` : ""}
          </div>
        </>
      }
      tally={
        <>
          <TallyChip icon={Check} count={countVotes(row, "love")} label="love it" tone="text-success" />
          <TallyChip icon={HelpCircle} count={countVotes(row, "fine")} label="fine" tone="text-warning" />
          <TallyChip icon={X} count={countVotes(row, "veto")} label="veto" tone="text-danger" />
        </>
      }
      votes={
        <VoteButtons options={CHOICE_OPTIONS} myVote={myVote} onVote={onVote} />
      }
    />
  );
}

/**
 * A place or an accommodation. They differ only in the subtitle — an
 * accommodation carries a nightly price — so one component covers both.
 */
export function ChoiceProposalRow({
  userId,
  onVote,
  priceLabel,
  ...props
}: CommonProps & {
  userId?: number;
  onVote: (vote: PreferenceVote) => void;
  /** e.g. "£120/night". Accommodations only. */
  priceLabel?: string;
}) {
  const { row, detailHref } = props;
  const myVote = row.votes?.find((v: any) => v.userId === userId)?.vote;

  return (
    <RowShell
      {...props}
      title={
        <>
          <Link href={detailHref}>
            <span className="font-medium truncate block cursor-pointer hover:underline">
              {row.name}
            </span>
          </Link>
          {priceLabel && (
            <span className="text-muted-foreground">{priceLabel}</span>
          )}
        </>
      }
      tally={
        <>
          <TallyChip icon={Heart} count={countVotes(row, "love")} label="love it" tone="text-cat-4" />
          <TallyChip icon={Check} count={countVotes(row, "fine")} label="fine" tone="text-info" />
          <TallyChip icon={X} count={countVotes(row, "veto")} label="veto" tone="text-danger" />
        </>
      }
      votes={
        <VoteButtons options={CHOICE_OPTIONS} myVote={myVote} onVote={onVote} />
      }
    />
  );
}
