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
      className={`rounded-lg border p-2.5 text-xs ${row.selected ? "border-green-300 bg-green-50/60 dark:bg-green-950/20" : "border-border/40 bg-background"}`}
    >
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
                <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-3.5 w-3.5" />
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
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {options.map(btn => (
          <button
            key={btn.vote}
            onClick={() => onVote(btn.vote)}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded border text-[11px] transition-colors ${myVote === btn.vote ? btn.active : "border-border/60 text-muted-foreground hover:border-border"}`}
          >
            {btn.icon && <btn.icon className="h-3 w-3" />}
            {btn.label}
          </button>
        ))}
      </div>
      {/* Its own row, not a fourth chip: it is a different kind of answer,
          and four buttons across a phone read as none. */}
      <button
        onClick={() => onVote(MAJORITY_VOTE as T)}
        aria-pressed={myVote === MAJORITY_VOTE}
        className={`w-full flex items-center justify-center gap-1 py-1 rounded border text-[11px] transition-colors ${
          myVote === MAJORITY_VOTE
            ? "bg-muted text-foreground border-foreground/20"
            : "border-border/60 text-muted-foreground hover:border-border"
        }`}
      >
        <Users className="h-3 w-3" />
        {VOTE_LABELS[MAJORITY_VOTE]}
      </button>
    </div>
  );
}

const DATE_OPTIONS = [
  {
    vote: "available" as const,
    icon: Check,
    label: "Yes",
    active: "bg-green-100 text-green-700 border-green-300",
  },
  {
    vote: "maybe" as const,
    icon: HelpCircle,
    label: "Maybe",
    active: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  {
    vote: "unavailable" as const,
    icon: X,
    label: "No",
    active: "bg-red-100 text-red-600 border-red-300",
  },
] as const;

const CHOICE_OPTIONS = [
  {
    vote: "love" as const,
    label: "Yes",
    active: "bg-green-100 text-green-700 border-green-300",
  },
  {
    vote: "fine" as const,
    label: "Maybe",
    active: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  {
    vote: "veto" as const,
    label: "No",
    active: "bg-red-100 text-red-600 border-red-300",
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
          <span className="text-green-600">
            {countVotes(row, "available")}✓
          </span>
          <span className="text-yellow-600">{countVotes(row, "maybe")}?</span>
          <span className="text-red-500">
            {countVotes(row, "unavailable")}✗
          </span>
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
          <span className="text-green-600">{countVotes(row, "love")}✓</span>
          <span className="text-yellow-600">{countVotes(row, "fine")}?</span>
          <span className="text-red-500">{countVotes(row, "veto")}✗</span>
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
          <span className="text-pink-600">{countVotes(row, "love")}❤</span>
          <span className="text-blue-600">{countVotes(row, "fine")}✓</span>
          <span className="text-red-500">{countVotes(row, "veto")}✗</span>
        </>
      }
      votes={
        <VoteButtons options={CHOICE_OPTIONS} myVote={myVote} onVote={onVote} />
      }
    />
  );
}
