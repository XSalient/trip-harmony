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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LockToggle from "./LockToggle";
import VotedCount from "./VotedCount";

type ProposalType = "date" | "destination" | "accommodation";

/** What every row needs, whatever it is a proposal for. */
type CommonProps = {
  tripId: number;
  row: any;
  detailHref: string;
  proposalType: ProposalType;
  isAdmin: boolean;
  canContribute: boolean;
  memberCount: number;
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
  memberCount,
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
          memberCount={memberCount}
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

const countVotes = (row: any, vote: string) =>
  row.votes?.filter((v: any) => v.vote === vote).length || 0;

export function DateProposalRow({
  userId,
  onVote,
  ...props
}: CommonProps & {
  userId?: number;
  onVote: (vote: "available" | "maybe" | "unavailable") => void;
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
  onVote: (vote: "love" | "fine" | "veto") => void;
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
