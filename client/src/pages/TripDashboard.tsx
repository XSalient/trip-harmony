import { useAuth } from "@/_core/hooks/useAuth";
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
  MapPin,
  Home as HomeIcon,
  DollarSign,
  Users,
  CheckCircle2,
  Bot,
  Plus,
  Sparkles,
  AlertCircle,
  ClipboardList,
  FileText,
} from "lucide-react";
import TripSummary from "@/components/trip/TripSummary";
import EditTripDialog from "@/components/trip/EditTripDialog";
import TripActionsMenu from "@/components/trip/TripActionsMenu";
import { useSectionState } from "@/components/trip/useSectionState";
import { useProposalDialogs } from "@/components/trip/useProposalDialogs";
import SectionCard, {
  AddProposalButton,
  CollapsibleRow,
  SectionLink,
} from "@/components/trip/SectionCard";
import {
  ChoiceProposalRow,
  DateProposalRow,
} from "@/components/trip/ProposalRow";

export default function TripDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const tripId = parseInt(params.id || "0");

  const { data: trip, isLoading } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { data: members } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: budgetSummary } = trpc.budget.summary.useQuery(
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
  // Only the summary needs this — a count of planned days. The itinerary
  // itself lives on its own screen.
  const { data: itineraryDays } = trpc.itinerary.getDays.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );

  const { data: myRole } = trpc.trips.myRole.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const role = myRole?.role ?? null;
  const isAdmin = role === "admin";
  // Watchers view the trip and change nothing. The server rejects them anyway;
  // this keeps the page from offering controls that can only fail.
  const canContribute = role === "admin" || role === "tripmate";

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
  const { isOpen, toggle } = useSectionState(tripId);

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

  const pendingVotes = {
    dates:
      dateProposals?.filter(
        (d: any) =>
          !d.selected && !d.votes?.some((v: any) => v.userId === user?.id)
      ).length || 0,
    destinations:
      destinations?.filter(
        (d: any) =>
          !d.selected && !d.votes?.some((v: any) => v.userId === user?.id)
      ).length || 0,
    accommodations:
      accommodations?.filter(
        (a: any) =>
          !a.selected && !a.votes?.some((v: any) => v.userId === user?.id)
      ).length || 0,
  };
  const totalPending =
    pendingVotes.dates +
    pendingVotes.destinations +
    pendingVotes.accommodations;

  /**
   * Finalise or un-finalise from the dashboard.
   *
   * Dates replace whatever was locked before, so the whole list is rewritten
   * optimistically; places and accommodations toggle one row and leave the
   * rest. Follows the vote handlers' `setData` pattern rather than inventing a
   * second approach to the same problem.
   */
  const handleToggleLock = async (kind: "date" | "dest" | "acc", row: any) => {
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
      } else {
        utils.accommodations.list.setData({ tripId }, (old: any) =>
          old?.map((a: any) => (a.id === row.id ? { ...a, selected: next } : a))
        );
        await setAccLockMutation.mutateAsync({
          accommodationId: row.id,
          locked: next,
        });
        await refetchAcc();
      }
      toast.success(next ? "Finalised" : "Un-finalised");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that");
      refetchDates();
      refetchDest();
      refetchAcc();
    } finally {
      setLockBusy(null);
    }
  };

  // Dates finalise to exactly one; places and accommodations to any number.
  // These were all `find()` when every section was single-lock — treating the
  // last two as "the chosen one" silently hid every finalised option but one.
  const lockedDate = dateProposals?.find((d: any) => d.selected);
  const lockedDests = destinations?.filter((d: any) => d.selected) ?? [];
  const lockedAccs = accommodations?.filter((a: any) => a.selected) ?? [];

  const handleDateVote = (
    proposalId: number,
    vote: "available" | "maybe" | "unavailable"
  ) => {
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

  const handleDestVote = (
    destinationId: number,
    vote: "love" | "fine" | "veto"
  ) => {
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

  const handleAccVote = (
    accommodationId: number,
    vote: "love" | "fine" | "veto"
  ) => {
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
        {/* Pending votes alert */}
        {totalPending > 0 && (
          <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  You have {totalPending} unvoted proposal
                  {totalPending > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Open a section below to vote
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Summary — the only section open by default ── */}
        <TripSummary
          tripId={tripId}
          lockedDate={lockedDate}
          lockedPlaces={lockedDests.length}
          totalPlaces={destinations?.length ?? 0}
          lockedAccommodations={lockedAccs.length}
          totalAccommodations={accommodations?.length ?? 0}
          itineraryDays={itineraryDays?.length ?? 0}
          open={isOpen("summary")}
          onToggle={() => toggle("summary")}
        />

        {/* ── Trip Description — set at creation, shown nowhere until now.
            With no description there is nothing for a member to expand, so only
            an admin — who can do something about it — sees the row. ── */}
        {(trip.description || isAdmin) && (
          <CollapsibleRow
            title="Trip Description"
            subtitle={trip.description ? undefined : "Not set yet"}
            icon={<FileText className="h-5 w-5" />}
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
        {canContribute && (
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
                ? "bg-green-100 dark:bg-green-900/30 text-green-600"
                : undefined
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
        <SectionCard
          title="Dates"
          icon={Calendar}
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
              memberCount={memberCount}
              commentCount={(commentCounts as any)[`date_${p.id}`] || 0}
              lockBusy={lockBusy === p.id}
              canManage={p.proposedBy === user?.id || isAdmin}
              onToggleLock={() => handleToggleLock("date", p)}
              onEdit={() => openEdit("date", p)}
              onClone={() => openClone("date", p)}
              onDelete={() => removeProposal("date", p.id)}
              onVote={vote => handleDateVote(p.id, vote)}
            />
          ))}
        </SectionCard>

        {/* ── Accommodations (was "Stays" — UI copy only) ── */}
        <SectionCard
          title="Accommodations"
          icon={HomeIcon}
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
              memberCount={memberCount}
              commentCount={
                (commentCounts as any)[`accommodation_${a.id}`] || 0
              }
              lockBusy={lockBusy === a.id}
              canManage={a.proposedBy === user?.id || isAdmin}
              onToggleLock={() => handleToggleLock("acc", a)}
              onEdit={() => openEdit("acc", a)}
              onClone={() => openClone("acc", a)}
              onDelete={() => removeProposal("acc", a.id)}
              onVote={vote => handleAccVote(a.id, vote)}
            />
          ))}
        </SectionCard>

        {/* ── Places (the `destinations` router, renamed in the UI only) ── */}
        <SectionCard
          title="Places"
          icon={MapPin}
          href={`/trips/${tripId}/destinations`}
          lockedCount={lockedDests.length}
          pendingCount={pendingVotes.destinations}
          addSlot={
            canContribute ? (
              <AddProposalButton href={`/trips/${tripId}/destinations?add=1`} />
            ) : null
          }
          emptyText="No places yet — suggest the first one!"
          open={isOpen("places")}
          onToggle={() => toggle("places")}
        >
          {topDests.map((d: any) => (
            <ChoiceProposalRow
              key={d.id}
              tripId={tripId}
              row={d}
              userId={user?.id}
              detailHref={`/trips/${tripId}/destinations`}
              proposalType="destination"
              isAdmin={isAdmin}
              canContribute={canContribute}
              memberCount={memberCount}
              commentCount={(commentCounts as any)[`destination_${d.id}`] || 0}
              lockBusy={lockBusy === d.id}
              canManage={d.proposedBy === user?.id || isAdmin}
              onToggleLock={() => handleToggleLock("dest", d)}
              onEdit={() => openEdit("dest", d)}
              onClone={() => openClone("dest", d)}
              onDelete={() => removeProposal("dest", d.id)}
              onVote={vote => handleDestVote(d.id, vote)}
            />
          ))}
        </SectionCard>

        {/* ── Budget ── */}
        <CollapsibleRow
          title="Budget"
          subtitle={
            budgetSummary && budgetSummary.total > 0
              ? `${trip.currency} ${budgetSummary.total.toFixed(0)} total`
              : "Nothing tracked yet"
          }
          icon={<DollarSign className="h-5 w-5" />}
          open={isOpen("budget")}
          onToggle={() => toggle("budget")}
        >
          <p className="text-sm text-muted-foreground mb-2">
            {budgetSummary && budgetSummary.total > 0
              ? `${trip.currency} ${budgetSummary.total.toFixed(0)} total · ~${trip.currency} ${budgetSummary.perPerson.toFixed(0)} per person across ${memberCount} ${memberCount === 1 ? "member" : "members"}.`
              : "Track expenses and set a comfortable limit for the group."}
          </p>
          <SectionLink href={`/trips/${tripId}/budget`}>
            View the budget
          </SectionLink>
        </CollapsibleRow>

        {/* ── Vibe Board ── */}
        <CollapsibleRow
          title="Vibe Board"
          icon={<Sparkles className="h-5 w-5" />}
          iconClass="bg-pink-100 dark:bg-pink-900/30 text-pink-600"
          open={isOpen("vibe")}
          onToggle={() => toggle("vibe")}
        >
          <p className="text-sm text-muted-foreground mb-2">
            Share inspiration — links, photos, ideas.
          </p>
          <SectionLink href={`/trips/${tripId}/vibe`}>
            Open the vibe board
          </SectionLink>
        </CollapsibleRow>

        {/* ── Itinerary ── */}
        <CollapsibleRow
          title="Itinerary"
          subtitle={
            itineraryDays && itineraryDays.length > 0
              ? `${itineraryDays.length} day${itineraryDays.length > 1 ? "s" : ""} planned`
              : undefined
          }
          icon={<Calendar className="h-5 w-5" />}
          iconClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
          open={isOpen("itinerary")}
          onToggle={() => toggle("itinerary")}
        >
          <p className="text-sm text-muted-foreground mb-2">
            Plan your days with activities &amp; logistics.
          </p>
          <SectionLink href={`/trips/${tripId}/itinerary`}>
            Open the itinerary
          </SectionLink>
        </CollapsibleRow>

        {/* ── AI Referee — not for watchers: it summarises the group's argument ── */}
        {canContribute && (
          <CollapsibleRow
            title="AI Referee"
            icon={<Bot className="h-5 w-5" />}
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
