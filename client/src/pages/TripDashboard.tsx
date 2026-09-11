import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import {
  Calendar,
  Lightbulb,
  Home as HomeIcon,
  DollarSign,
  Users,
  CheckCircle2,
  Bot,
  Plus,
  ChevronRight,
  ClipboardList,
  FileText,
} from "lucide-react";
import { haptic } from "@/lib/haptics";
import TripSummary from "@/components/trip/TripSummary";
import EditTripDialog from "@/components/trip/EditTripDialog";
import TripActionsMenu from "@/components/trip/TripActionsMenu";
import WatcherNotice from "@/components/trip/WatcherNotice";
import { useSectionState } from "@/components/trip/useSectionState";
import type { SectionKey } from "@shared/sections";
import { useProposalDialogs } from "@/components/trip/useProposalDialogs";
import SectionCard, {
  AddProposalButton,
  CollapsibleRow,
  SectionLink,
} from "@/components/trip/SectionCard";
import {
  BudgetProposalRow,
  ChoiceProposalRow,
  DateProposalRow,
} from "@/components/trip/ProposalRow";
import type { DateVote, PreferenceVote } from "@shared/votes";

export default function TripDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const tripId = parseInt(params.id || "0");

  const {
    data: trip,
    isLoading,
    error: tripError,
    refetch: refetchTrip,
  } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: budgetSummary } = trpc.budget.summary.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: budgets, refetch: refetchBudgets } = trpc.budget.list.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: destinations, refetch: refetchDest } =
    trpc.destinations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: accommodations, refetch: refetchAcc } =
    trpc.accommodations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: dateProposals, refetch: refetchDates } =
    trpc.dates.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const voteDateMutation = trpc.dates.vote.useMutation();
  const unvoteDateMutation = trpc.dates.unvote.useMutation();
  const voteDestMutation = trpc.destinations.vote.useMutation();
  const unvoteDestMutation = trpc.destinations.unvote.useMutation();
  const voteAccMutation = trpc.accommodations.vote.useMutation();
  const unvoteAccMutation = trpc.accommodations.unvote.useMutation();
  const voteBudgetMutation = trpc.budget.vote.useMutation();
  const unvoteBudgetMutation = trpc.budget.unvote.useMutation();
  const deleteBudgetMutation = trpc.budget.delete.useMutation();
  const lockBudgetMutation = trpc.budget.setLock.useMutation();
  const deleteDateMutation = trpc.dates.delete.useMutation();
  const deleteDestMutation = trpc.destinations.delete.useMutation();
  const deleteAccMutation = trpc.accommodations.delete.useMutation();
  const editDateMutation = trpc.dates.edit.useMutation();
  const editDestMutation = trpc.destinations.edit.useMutation();
  const editAccMutation = trpc.accommodations.edit.useMutation();
  const proposeDateMutation = trpc.dates.propose.useMutation();
  const lockDateMutation = trpc.dates.lock.useMutation();
  const unlockDatesMutation = trpc.dates.unlock.useMutation();
  const setDestLockMutation = trpc.destinations.setLock.useMutation();
  const setAccLockMutation = trpc.accommodations.setLock.useMutation();
  const createDestMutation = trpc.destinations.create.useMutation();
  const createAccMutation = trpc.accommodations.create.useMutation();
  const { data: commentCounts = {} } = trpc.comments.countsByTrip.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: myPrefs } = trpc.preferences.getMy.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: prefCount } = trpc.preferences.countForTrip.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );

  // Watchers view the trip and change nothing. The server rejects them anyway;
  // this keeps the page from offering controls that can only fail. The same
  // hook answers on every other trip screen, which is the point of it: this
  // rule used to live here and nowhere else.
  const {
    canAdminister: isAdmin,
    canContribute,
    isWatcher,
  } = useTripRole(tripId);

  const [lockBusy, setLockBusy] = useState<number | null>(null);
  const [editTripOpen, setEditTripOpen] = useState(false);

  const utils = trpc.useUtils();
  const {
    openEdit,
    openClone,
    remove: removeProposal,
    element: proposalDialogs,
  } = useProposalDialogs({
    tripId,
    refetchDates,
    refetchDests: refetchDest,
    refetchAccs: refetchAcc,
  });
  const { isOpen, toggle, openSection } = useSectionState(tripId);

  if (isLoading) {
    return (
      <AppShell title="Trip" showBack backHref="/">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  /**
   * A trip you cannot see and a trip we could not load are different answers.
   *
   * Both used to render "Trip not found", so a server fault — the case that
   * made this page fail intermittently — was reported as a missing trip, with
   * nothing to do about it. Only the refusals are genuinely "not found".
   */
  if (tripError) {
    const code = tripError.data?.code;
    const refused = code === "FORBIDDEN" || code === "NOT_FOUND";
    return (
      <AppShell title="Trip" showBack backHref="/">
        <div className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">
            {refused
              ? "Trip not found."
              : "This trip could not be loaded just now."}
          </p>
          {!refused && (
            <Button variant="outline" onClick={() => refetchTrip()}>
              Try again
            </Button>
          )}
        </div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell title="Trip" showBack backHref="/">
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Trip not found.</p>
        </div>
      </AppShell>
    );
  }

  const acceptedMembers =
    members?.filter((m: any) => m.status === "accepted") || [];
  const memberCount = acceptedMembers.length || 1;
  // Voters, not members: a family is one in group mode, and a watcher is never
  // one. Derived by the server so four screens cannot answer it differently.
  const voterCount = (trip as any)?.voterCount || 1;

  // Which sections this trip uses. Parsed by the server so this is already an
  // array; a trip that has never opened Trip settings has an empty one.
  const hiddenSections: SectionKey[] = (trip as any)?.hiddenSections ?? [];
  const shows = (section: SectionKey) => !hiddenSections.includes(section);

  const unvoted = (rows: any[] | undefined) =>
    rows?.filter(
      (r: any) =>
        !r.selected && !r.votes?.some((v: any) => v.userId === user?.id)
    ).length || 0;

  // A hidden section contributes nothing. Counting it would put "you have 3
  // unvoted proposals — open a section below to vote" above a page with no
  // such section on it, which is an instruction the reader cannot follow.
  const pendingVotes = {
    dates: shows("dates") ? unvoted(dateProposals) : 0,
    destinations: shows("suggestions") ? unvoted(destinations) : 0,
    accommodations: shows("accommodations") ? unvoted(accommodations) : 0,
    budgets: shows("budget") ? unvoted(budgets) : 0,
  };
  const totalPending =
    pendingVotes.dates +
    pendingVotes.destinations +
    pendingVotes.accommodations +
    pendingVotes.budgets;

  // Where "waiting on your vote" sends you: the first section with outstanding
  // votes, in the order the sections appear on the page rather than the order
  // this object happens to be written in.
  const firstPending = (
    [
      ["dates", "Dates", pendingVotes.dates],
      ["accommodations", "Stays", pendingVotes.accommodations],
      ["suggestions", "Suggestions", pendingVotes.destinations],
      ["budget", "Budget", pendingVotes.budgets],
    ] as const
  )
    .filter(([, , n]) => n > 0)
    .map(([section, label]) => ({ section: section as SectionKey, label }))[0];

  /**
   * Finalise or un-finalise from the dashboard.
   *
   * Dates replace whatever was locked before, so the whole list is rewritten
   * optimistically; suggestions and accommodations toggle one row and leave the
   * rest. Follows the vote handlers' `setData` pattern rather than inventing a
   * second approach to the same problem.
   */
  const handleToggleLock = async (
    kind: "date" | "dest" | "acc" | "budget",
    row: any
  ) => {
    const next = !row.selected;
    setLockBusy(row.id);
    try {
      if (kind === "date") {
        utils.dates.list.setData({ tripId }, (old: any) =>
          old?.map((p: any) => ({ ...p, selected: next && p.id === row.id }))
        );
        if (next)
          await lockDateMutation.mutateAsync({ tripId, proposalId: row.id });
        else await unlockDatesMutation.mutateAsync({ tripId });
        await refetchDates();
      } else if (kind === "dest") {
        utils.destinations.list.setData({ tripId }, (old: any) =>
          old?.map((d: any) => (d.id === row.id ? { ...d, selected: next } : d))
        );
        await setDestLockMutation.mutateAsync({
          destinationId: row.id,
          locked: next,
        });
        await refetchDest();
      } else if (kind === "acc") {
        utils.accommodations.list.setData({ tripId }, (old: any) =>
          old?.map((a: any) => (a.id === row.id ? { ...a, selected: next } : a))
        );
        await setAccLockMutation.mutateAsync({
          accommodationId: row.id,
          locked: next,
        });
        await refetchAcc();
      } else {
        // Budget finalises to exactly one, like dates: a trip has several
        // places to sleep but one answer to "how much are we spending".
        utils.budget.list.setData({ tripId }, (old: any) =>
          old?.map((b: any) => ({ ...b, selected: next && b.id === row.id }))
        );
        await lockBudgetMutation.mutateAsync({
          proposalId: row.id,
          locked: next,
        });
        await refetchBudgets();
      }
      toast.success(next ? "Finalised" : "Un-finalised");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that");
      refetchDates();
      refetchDest();
      refetchAcc();
      refetchBudgets();
    } finally {
      setLockBusy(null);
    }
  };

  // Dates finalise to exactly one; suggestions and accommodations to any number.
  // These were all `find()` when every section was single-lock — treating the
  // last two as "the chosen one" silently hid every finalised option but one.
  const lockedDate = dateProposals?.find((d: any) => d.selected);
  const lockedDests = destinations?.filter((d: any) => d.selected) ?? [];
  const lockedAccs = accommodations?.filter((a: any) => a.selected) ?? [];
  const lockedBudget = budgets?.find((b: any) => b.selected);

  const handleBudgetVote = (proposalId: number, vote: PreferenceVote) => {
    const currentVote = budgets
      ?.find((b: any) => b.id === proposalId)
      ?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.budget.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((b: any) => {
        if (b.id !== proposalId) return b;
        const filtered =
          b.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return {
          ...b,
          votes: isUnvote
            ? filtered
            : [...filtered, { userId: user?.id, vote }],
        };
      });
    });
    if (isUnvote) {
      unvoteBudgetMutation.mutate(
        { proposalId },
        { onError: () => refetchBudgets(), onSuccess: () => refetchBudgets() }
      );
    } else {
      voteBudgetMutation.mutate(
        { proposalId, vote },
        { onError: () => refetchBudgets(), onSuccess: () => refetchBudgets() }
      );
    }
  };

  const removeBudget = async (id: number) => {
    try {
      await deleteBudgetMutation.mutateAsync({ id });
      await refetchBudgets();
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove that");
    }
  };

  const handleDateVote = (proposalId: number, vote: DateVote) => {
    const currentVote = dateProposals
      ?.find((p: any) => p.id === proposalId)
      ?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.dates.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((p: any) => {
        if (p.id !== proposalId) return p;
        const filtered =
          p.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return {
          ...p,
          votes: isUnvote
            ? filtered
            : [...filtered, { userId: user?.id, vote }],
        };
      });
    });
    if (isUnvote) {
      unvoteDateMutation.mutate(
        { proposalId },
        { onError: () => refetchDates(), onSuccess: () => refetchDates() }
      );
    } else {
      voteDateMutation.mutate(
        { proposalId, vote },
        {
          onError: () => {
            toast.error("Vote failed");
            refetchDates();
          },
          onSuccess: () => refetchDates(),
        }
      );
    }
  };

  const handleDestVote = (destinationId: number, vote: PreferenceVote) => {
    const currentVote = destinations
      ?.find((d: any) => d.id === destinationId)
      ?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.destinations.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((d: any) => {
        if (d.id !== destinationId) return d;
        const filtered =
          d.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return {
          ...d,
          votes: isUnvote
            ? filtered
            : [...filtered, { userId: user?.id, vote }],
        };
      });
    });
    if (isUnvote) {
      unvoteDestMutation.mutate(
        { destinationId },
        { onError: () => refetchDest(), onSuccess: () => refetchDest() }
      );
    } else {
      voteDestMutation.mutate(
        { destinationId, vote },
        {
          onError: () => {
            toast.error("Vote failed");
            refetchDest();
          },
          onSuccess: () => refetchDest(),
        }
      );
    }
  };

  const handleAccVote = (accommodationId: number, vote: PreferenceVote) => {
    const currentVote = accommodations
      ?.find((a: any) => a.id === accommodationId)
      ?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.accommodations.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((a: any) => {
        if (a.id !== accommodationId) return a;
        const filtered =
          a.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return {
          ...a,
          votes: isUnvote
            ? filtered
            : [...filtered, { userId: user?.id, vote }],
        };
      });
    });
    if (isUnvote) {
      unvoteAccMutation.mutate(
        { accommodationId },
        { onError: () => refetchAcc(), onSuccess: () => refetchAcc() }
      );
    } else {
      voteAccMutation.mutate(
        { accommodationId, vote },
        {
          onError: () => {
            toast.error("Vote failed");
            refetchAcc();
          },
          onSuccess: () => refetchAcc(),
        }
      );
    }
  };

  const topDates = dateProposals?.slice(0, 3) || [];
  const topDests = destinations?.slice(0, 3) || [];
  const topAccs = accommodations?.slice(0, 3) || [];
  const topBudgets = budgets?.slice(0, 3) || [];

  return (
    <AppShell
      title={trip.name}
      showBack
      backHref="/"
      headerRight={
        <div className="flex items-center gap-1">
          {isAdmin && (
            <TripActionsMenu
              tripId={tripId}
              tripName={trip.name}
              onEdit={() => setEditTripOpen(true)}
            />
          )}
          <Link href={`/trips/${tripId}/members`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Trip members"
            >
              <Users className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      }
    >
      <div className="px-4 py-4 space-y-4">
        {isWatcher && <WatcherNotice />}

        {/* Waiting on you.

            This used to be a full-height card that said "open a section below
            to vote" — a hundred and twenty pixels of instruction sitting on
            top of the thing it was describing, on a screen where the first
            actionable control was already below the fold. It is now one row
            that does the opening itself: tap it and the first section with
            outstanding votes expands and scrolls under your thumb. */}
        {totalPending > 0 && firstPending && (
          <button
            onClick={() => {
              openSection(firstPending.section);
              haptic("select");
              // After the section has been told to open — its height animates,
              // so the target is only where it belongs a frame later.
              requestAnimationFrame(() =>
                document
                  .getElementById(`section-${firstPending.section}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              );
            }}
            className="pressable-lg relative flex min-h-12 w-full items-center gap-2.5 overflow-hidden rounded-2xl border border-border/70 bg-card px-3.5 py-2 pl-4 text-left shadow-e1"
          >
            {/* A spine and a live dot rather than a filled amber panel. A soft
                fill at this size is a slab of colour with no edge to it — and
                in dark mode an amber one is brown. The spine is the same
                vocabulary a settled section uses, in the other tone. */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-warning"
            />
            <span aria-hidden className="live-dot bg-warning" />
            <span className="flex-1 text-[14px] font-semibold">
              {totalPending} waiting on your vote
            </span>
            <span className="text-[13px] font-medium text-warning">
              {firstPending.label}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )}

        {/* ── Summary — the only section open by default ── */}
        <TripSummary
          tripId={tripId}
          lockedDate={lockedDate}
          lockedSuggestions={lockedDests.length}
          totalSuggestions={destinations?.length ?? 0}
          lockedAccommodations={lockedAccs.length}
          budget={budgetSummary?.finalised ?? null}
          headcount={budgetSummary?.headcount ?? null}
          totalAccommodations={accommodations?.length ?? 0}
          hiddenSections={hiddenSections}
          open={isOpen("summary")}
          onToggle={() => toggle("summary")}
        />

        {/* ── Trip Description — set at creation, shown nowhere until now.
            With no description there is nothing for a member to expand, so only
            an admin — who can do something about it — sees the row. ── */}
        {shows("description") && (trip.description || isAdmin) && (
          <CollapsibleRow
            title="Trip Description"
            subtitle={trip.description ? undefined : "Not set yet"}
            icon={<FileText className="h-5 w-5" />}
            iconClass="bg-cat-4-soft text-cat-4-on-soft"
            open={isOpen("description")}
            onToggle={() => toggle("description")}
          >
            {trip.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {trip.description}
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs"
                onClick={() => setEditTripOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add a description
              </Button>
            )}
          </CollapsibleRow>
        )}

        {/* ── My Trip Preferences ── */}
        {shows("preferences") && canContribute && (
          <CollapsibleRow
            title={myPrefs ? "My Trip Preferences" : "Add My Trip Preferences"}
            subtitle={
              myPrefs
                ? `Saved · ${prefCount?.count || 0}/${memberCount} members submitted`
                : "Not set yet"
            }
            icon={
              myPrefs ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <ClipboardList className="h-5 w-5" />
              )
            }
            iconClass={
              myPrefs
                ? "bg-success-soft text-success-on-soft"
                : "bg-cat-2-soft text-cat-2-on-soft"
            }
            open={isOpen("preferences")}
            onToggle={() => toggle("preferences")}
          >
            <p className="text-sm text-muted-foreground mb-2">
              Must-haves and dealbreakers the AI uses to score proposals for
              you.
            </p>
            <SectionLink href={`/trips/${tripId}/preferences`}>
              {myPrefs ? "Review my preferences" : "Set my preferences"}
            </SectionLink>
          </CollapsibleRow>
        )}

        {/* ── Dates ── */}
        {shows("dates") && (
          <SectionCard
            title="Dates"
            icon={Calendar}
            tone="bg-cat-1-soft text-cat-1-on-soft"
            href={`/trips/${tripId}/dates`}
            lockedCount={lockedDate ? 1 : 0}
            singleLock
            pendingCount={pendingVotes.dates}
            addSlot={
              canContribute ? (
                <AddProposalButton href={`/trips/${tripId}/dates?add=1`} />
              ) : null
            }
            emptyText="No dates proposed yet — add the first one above!"
            open={isOpen("dates")}
            id="section-dates"
            onToggle={() => toggle("dates")}
          >
            {topDates.map((p: any) => (
              <DateProposalRow
                key={p.id}
                tripId={tripId}
                row={p}
                userId={user?.id}
                detailHref={`/trips/${tripId}/dates`}
                proposalType="date"
                isAdmin={isAdmin}
                canContribute={canContribute}
                voterCount={voterCount}
                commentCount={(commentCounts as any)[`date_${p.id}`] || 0}
                lockBusy={lockBusy === p.id}
                canManage={
                  canContribute && (p.proposedBy === user?.id || isAdmin)
                }
                onToggleLock={() => handleToggleLock("date", p)}
                onEdit={() => openEdit("date", p)}
                onClone={() => openClone("date", p)}
                onDelete={() => removeProposal("date", p.id)}
                onVote={vote => handleDateVote(p.id, vote)}
              />
            ))}
          </SectionCard>
        )}

        {/* ── Accommodations (was "Stays" — UI copy only) ── */}
        {shows("accommodations") && (
          <SectionCard
            title="Accommodations"
            icon={HomeIcon}
            tone="bg-cat-5-soft text-cat-5-on-soft"
            href={`/trips/${tripId}/accommodations`}
            lockedCount={lockedAccs.length}
            pendingCount={pendingVotes.accommodations}
            addSlot={
              canContribute ? (
                <AddProposalButton
                  href={`/trips/${tripId}/accommodations?add=1`}
                />
              ) : null
            }
            emptyText="No accommodations suggested yet — add an option!"
            open={isOpen("accommodations")}
            id="section-accommodations"
            onToggle={() => toggle("accommodations")}
          >
            {topAccs.map((a: any) => (
              <ChoiceProposalRow
                key={a.id}
                tripId={tripId}
                row={a}
                userId={user?.id}
                detailHref={`/trips/${tripId}/accommodations`}
                proposalType="accommodation"
                priceLabel={
                  a.pricePerNight
                    ? `${trip.currency}${a.pricePerNight}/night`
                    : undefined
                }
                isAdmin={isAdmin}
                canContribute={canContribute}
                voterCount={voterCount}
                commentCount={
                  (commentCounts as any)[`accommodation_${a.id}`] || 0
                }
                lockBusy={lockBusy === a.id}
                canManage={
                  canContribute && (a.proposedBy === user?.id || isAdmin)
                }
                onToggleLock={() => handleToggleLock("acc", a)}
                onEdit={() => openEdit("acc", a)}
                onClone={() => openClone("acc", a)}
                onDelete={() => removeProposal("acc", a.id)}
                onVote={vote => handleAccVote(a.id, vote)}
              />
            ))}
          </SectionCard>
        )}

        {/* ── Suggestions (the `destinations` router, renamed in the UI only) ── */}
        {shows("suggestions") && (
          <SectionCard
            title="Suggestions"
            icon={Lightbulb}
            tone="bg-cat-2-soft text-cat-2-on-soft"
            href={`/trips/${tripId}/suggestions`}
            lockedCount={lockedDests.length}
            pendingCount={pendingVotes.destinations}
            addSlot={
              canContribute ? (
                <AddProposalButton
                  href={`/trips/${tripId}/suggestions?add=1`}
                />
              ) : null
            }
            emptyText="No suggestions yet — add the first one!"
            open={isOpen("suggestions")}
            id="section-suggestions"
            onToggle={() => toggle("suggestions")}
          >
            {topDests.map((d: any) => (
              <ChoiceProposalRow
                key={d.id}
                tripId={tripId}
                row={d}
                userId={user?.id}
                detailHref={`/trips/${tripId}/suggestions`}
                proposalType="destination"
                isAdmin={isAdmin}
                canContribute={canContribute}
                voterCount={voterCount}
                commentCount={
                  (commentCounts as any)[`destination_${d.id}`] || 0
                }
                lockBusy={lockBusy === d.id}
                canManage={
                  canContribute && (d.proposedBy === user?.id || isAdmin)
                }
                onToggleLock={() => handleToggleLock("dest", d)}
                onEdit={() => openEdit("dest", d)}
                onClone={() => openClone("dest", d)}
                onDelete={() => removeProposal("dest", d.id)}
                onVote={vote => handleDestVote(d.id, vote)}
              />
            ))}
          </SectionCard>
        )}

        {/* ── Budget — a voting section like the three above it ── */}
        {shows("budget") && (
          <SectionCard
            title="Budget"
            icon={DollarSign}
            tone="bg-cat-6-soft text-cat-6-on-soft"
            href={`/trips/${tripId}/budget`}
            lockedCount={lockedBudget ? 1 : 0}
            singleLock
            pendingCount={pendingVotes.budgets}
            addSlot={
              canContribute ? (
                <AddProposalButton href={`/trips/${tripId}/budget?add=1`} />
              ) : null
            }
            emptyText="No budget proposed yet — put a number on the table."
            open={isOpen("budget")}
            id="section-budget"
            onToggle={() => toggle("budget")}
          >
            {topBudgets.map((b: any) => (
              <BudgetProposalRow
                key={b.id}
                tripId={tripId}
                row={b}
                userId={user?.id}
                detailHref={`/trips/${tripId}/budget`}
                proposalType="budget"
                isAdmin={isAdmin}
                canContribute={canContribute}
                voterCount={voterCount}
                commentCount={(commentCounts as any)[`budget_${b.id}`] || 0}
                lockBusy={lockBusy === b.id}
                canManage={
                  canContribute && (b.proposedBy === user?.id || isAdmin)
                }
                onToggleLock={() => handleToggleLock("budget", b)}
                onEdit={() => navigate(`/trips/${tripId}/budget?edit=${b.id}`)}
                onClone={() => navigate(`/trips/${tripId}/budget?add=1`)}
                onDelete={() => removeBudget(b.id)}
                onVote={(vote: PreferenceVote) => handleBudgetVote(b.id, vote)}
                tripTotalLabel={
                  budgetSummary?.leading && b.id === budgetSummary.leading.id
                    ? `${b.currency} ${Math.round(budgetSummary.leading.tripTotal).toLocaleString()} for the trip`
                    : undefined
                }
              />
            ))}
          </SectionCard>
        )}

        {/* ── AI Referee — not for watchers: it summarises the group's argument ── */}
        {shows("referee") && canContribute && (
          <CollapsibleRow
            title="AI Referee"
            icon={<Bot className="h-5 w-5" />}
            iconClass="bg-cat-3-soft text-cat-3-on-soft"
            open={isOpen("referee")}
            onToggle={() => toggle("referee")}
          >
            <p className="text-sm text-muted-foreground mb-2">
              Mediation and compromise suggestions, run when you ask for them.
            </p>
            <SectionLink href={`/trips/${tripId}/referee`}>
              Open the referee
            </SectionLink>
          </CollapsibleRow>
        )}
      </div>

      <EditTripDialog
        tripId={tripId}
        name={trip.name}
        description={trip.description ?? null}
        open={editTripOpen}
        onOpenChange={setEditTripOpen}
      />

      {proposalDialogs}
    </AppShell>
  );
}
