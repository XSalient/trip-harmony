/**
 * The budget screen: proposals, votes, and one finalised figure.
 *
 * This was an expense journal — a list of what had been spent on a trip that
 * had not happened. It is now a voting section like Dates and Suggestions, and
 * it is built from the same parts (`ScreenHeader`, `VoteScore`, `VotedCount`,
 * `AddedBy`, `FinalisedBy`, `ProposalComments`) so it behaves the way the rest
 * of the app has taught people to expect.
 *
 * The one thing budget has that the others do not is a **scope**: a figure can
 * be for the whole trip, per person, per adult or per family. Every card shows
 * both what was written and what it comes to for the trip, because two
 * proposals in different units cannot otherwise be compared.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/trip/ScreenHeader";
import ProposalComments from "@/components/ProposalComments";
import FinalisedBy from "@/components/trip/FinalisedBy";
import AddedBy from "@/components/trip/AddedBy";
import VotedCount from "@/components/trip/VotedCount";
import WatcherNotice from "@/components/trip/WatcherNotice";
import VoteScore, { scoreVotes } from "@/components/trip/VoteScore";
import {
  BUDGET_SCOPES,
  BUDGET_SCOPE_LABELS,
  groupShareOf,
  perPersonOf,
  tripTotalOf,
  type BudgetScope,
} from "@shared/budget";
import { useParams, useSearch, useLocation } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Copy,
  DollarSign,
  Heart,
  HelpCircle,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const money = (currency: string, amount: number) =>
  `${currency} ${Math.round(amount).toLocaleString()}`;

export default function TripBudget() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: proposals, isLoading } = trpc.budget.list.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: summary } = trpc.budget.summary.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  const { data: members } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: commentCounts = {} } = trpc.comments.countsByTrip.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );

  const createMutation = trpc.budget.create.useMutation();
  const voteMutation = trpc.budget.vote.useMutation();
  const unvoteMutation = trpc.budget.unvote.useMutation();
  const setLockMutation = trpc.budget.setLock.useMutation();
  const deleteMutation = trpc.budget.delete.useMutation();
  const editMutation = trpc.budget.edit.useMutation();
  const capMutation = trpc.trips.updateMemberBudget.useMutation();
  const utils = trpc.useUtils();

  const currency = trip?.currency || "USD";
  // Voters, not members: the server knows whether this trip counts families or
  // people, and a watcher is never in the denominator.
  const voterCount = (trip as any)?.voterCount ?? 0;

  const {
    canAdminister: isAdmin,
    canContribute,
    isWatcher,
  } = useTripRole(tripId);

  const [addOpen, setAddOpen] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState<BudgetScope>("per_person");
  const [covers, setCovers] = useState("");
  const [cap, setCap] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editScope, setEditScope] = useState<BudgetScope>("per_person");
  const [editCovers, setEditCovers] = useState("");

  /** `?add=1` from the trip page opens the form here — one form per proposal type. */
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(search);
    if (q.get("add") === "1") {
      setAddOpen(true);
      navigate(window.location.pathname, { replace: true });
      return;
    }
    const editId = q.get("edit");
    if (editId && proposals) {
      const row = proposals.find((p: any) => p.id === Number(editId));
      if (row) openEdit(row);
      navigate(window.location.pathname, { replace: true });
    }
  }, [search, navigate, proposals]);

  useEffect(() => {
    if (summary?.myCap != null) setCap(String(summary.myCap));
  }, [summary?.myCap]);

  const sorted = useMemo(
    () =>
      [...(proposals ?? [])].sort(
        (a: any, b: any) => scoreVotes(b.votes) - scoreVotes(a.votes)
      ),
    [proposals]
  );
  const finalised = useMemo(
    () => sorted.find((p: any) => p.selected),
    [sorted]
  );

  function openEdit(row: any) {
    setEditingId(row.id);
    setEditTitle(row.title || "");
    setEditAmount(row.amount ? String(parseFloat(row.amount)) : "");
    setEditScope((row.scope as BudgetScope) || "per_person");
    setEditCovers(row.covers || "");
    setEditOpen(true);
  }

  const handleCreate = async () => {
    if (!title.trim()) return toast.error("Give it a name");
    if (!/^\d+(\.\d{1,2})?$/.test(amount))
      return toast.error("Enter an amount, like 1200 or 1200.50");
    try {
      await createMutation.mutateAsync({
        tripId,
        title: title.trim(),
        amount,
        currency,
        scope,
        covers: covers.trim() || undefined,
      });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      setAddOpen(false);
      setTitle("");
      setAmount("");
      setCovers("");
      toast.success("Budget proposed");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't propose that");
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      await editMutation.mutateAsync({
        id: editingId,
        title: editTitle || undefined,
        amount: editAmount || undefined,
        scope: editScope,
        covers: editCovers || undefined,
      });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      setEditOpen(false);
      toast.success("Budget updated");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't update that");
    }
  };

  const handleVote = (proposalId: number, vote: "love" | "fine" | "veto") => {
    const currentVote = proposals
      ?.find((p: any) => p.id === proposalId)
      ?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.budget.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((p: any) => {
        if (p.id !== proposalId) return p;
        const filtered =
          p.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return {
          ...p,
          votes: isUnvote
            ? filtered
            : [
                ...filtered,
                {
                  userId: user?.id,
                  vote,
                  user: { id: user?.id, name: user?.name },
                },
              ],
        };
      });
    });
    const done = {
      onSettled: () => {
        // A refetch rather than trusting the optimistic row: in group mode the
        // server may have removed a groupmate's vote, and only it knows that.
        utils.budget.list.invalidate({ tripId });
        utils.budget.summary.invalidate({ tripId });
      },
    };
    if (isUnvote) unvoteMutation.mutate({ proposalId }, done);
    else voteMutation.mutate({ proposalId, vote }, done);
  };

  const handleToggleLock = async (proposalId: number, locked: boolean) => {
    try {
      await setLockMutation.mutateAsync({ proposalId, locked });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      toast.success(locked ? "Budget finalised" : "Un-finalised");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.budget.list.invalidate({ tripId });
      utils.budget.summary.invalidate({ tripId });
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't remove that");
    }
  };

  const handleSaveCap = async () => {
    if (!/^\d+(\.\d{1,2})?$/.test(cap))
      return toast.error("Enter an amount, like 1200");
    try {
      await capMutation.mutateAsync({ tripId, budgetMax: cap });
      utils.budget.summary.invalidate({ tripId });
      setCapOpen(false);
      toast.success(
        summary?.myCapIsGroup
          ? "Your group's limit is set"
          : "Your limit is set"
      );
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that");
    }
  };

  const scopeField = (
    value: BudgetScope,
    onChange: (s: BudgetScope) => void
  ) => (
    <div className="space-y-2">
      <Label>What does that amount mean?</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {BUDGET_SCOPES.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
              value === s
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border/60 text-muted-foreground hover:border-border"
            }`}
          >
            {BUDGET_SCOPE_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <AppShell title="Budget" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <ScreenHeader
          subtitle={
            canContribute
              ? "Put a number on the table and vote on it"
              : "What the group is spending"
          }
          highlight={
            summary?.finalised
              ? `Finalised · ${money(summary.finalised.currency, summary.finalised.tripTotal)} for the trip`
              : undefined
          }
          actions={
            <>
              {canContribute && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg gap-1 text-xs h-8"
                  onClick={() => setCapOpen(true)}
                >
                  <Settings className="h-3.5 w-3.5" /> My limit
                </Button>
              )}
              {canContribute && (
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="rounded-lg gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm rounded-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Propose a budget</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          placeholder="e.g. A flat ceiling per family"
                          value={title}
                          onChange={e => setTitle(e.target.value)}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Amount ({currency})</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                          className="rounded-lg"
                        />
                      </div>
                      {scopeField(scope, setScope)}
                      <div className="space-y-2">
                        <Label>What does it cover? (optional)</Label>
                        <Textarea
                          placeholder="Flights, the house and the hire car. Food on top."
                          value={covers}
                          onChange={e => setCovers(e.target.value)}
                          rows={2}
                          className="rounded-lg resize-none"
                        />
                      </div>
                      <Button
                        onClick={handleCreate}
                        className="w-full rounded-lg"
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending
                          ? "Proposing..."
                          : "Propose it"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          }
        />

        {isWatcher && (
          <WatcherNotice>
            You're following this trip. The budgets on the table and the tally
            are here; proposing and voting are for tripmates.
          </WatcherNotice>
        )}

        {/* Who is being charged. Pets are counted and shown, but never divided by. */}
        {summary && (
          <Card className="bg-muted/40">
            <CardContent className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span>
                {summary.headcount.adults}{" "}
                {summary.headcount.adults === 1 ? "adult" : "adults"}
                {summary.headcount.children > 0 &&
                  ` · ${summary.headcount.children} ${summary.headcount.children === 1 ? "child" : "children"}`}
                {summary.headcount.pets > 0 &&
                  ` · ${summary.headcount.pets} ${summary.headcount.pets === 1 ? "pet" : "pets"}`}
                {summary.headcount.groups > 0 &&
                  ` · ${summary.headcount.groups} ${summary.headcount.groups === 1 ? "family" : "families"}`}
              </span>
            </CardContent>
          </Card>
        )}

        {/* A count, never a name: enough to reopen the conversation, without
            publishing anybody's finances to the group. */}
        {summary && summary.votersOverCap ? (
          <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
            <CardContent className="p-3 text-xs">
              {summary.votersOverCap === 1
                ? "One person is above the limit they set."
                : `${summary.votersOverCap} people are above the limit they set.`}{" "}
              {finalised
                ? "It might be worth another look."
                : "Worth knowing before this is finalised."}
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : sorted.length > 0 ? (
          <div className="space-y-4">
            {sorted.map((p: any) => {
              const myVote = p.votes?.find(
                (v: any) => v.userId === user?.id
              )?.vote;
              const loves =
                p.votes?.filter((v: any) => v.vote === "love").length || 0;
              const fines =
                p.votes?.filter((v: any) => v.vote === "fine").length || 0;
              const vetos =
                p.votes?.filter((v: any) => v.vote === "veto").length || 0;
              const commentCount =
                (commentCounts as any)[`budget_${p.id}`] || 0;
              const canManage =
                canContribute && (p.proposedBy === user?.id || isAdmin);
              // Worked out here, for every card, from the two numbers the
              // server sent — a proposal written per family and one written
              // per person are not comparable until both are trip totals, and
              // showing that for only the leading one leaves the reader to do
              // it in their head for the rest.
              const figures = summary
                ? (() => {
                    const amount = parseFloat(p.amount);
                    const scope = p.scope as BudgetScope;
                    const tripTotal = tripTotalOf(
                      amount,
                      scope,
                      summary.headcount
                    );
                    return {
                      currency: p.currency,
                      tripTotal,
                      perPerson: perPersonOf(tripTotal, summary.headcount),
                      yourGroupShare: groupShareOf(
                        amount,
                        scope,
                        summary.headcount,
                        summary.myHeads
                      ),
                    };
                  })()
                : null;

              return (
                <Card
                  key={p.id}
                  className={p.selected ? "border-primary" : undefined}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold leading-tight">
                          {p.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {money(p.currency, parseFloat(p.amount))}{" "}
                          {BUDGET_SCOPE_LABELS[p.scope as BudgetScope]}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {commentCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {commentCount}
                          </span>
                        )}
                        <VoteScore votes={p.votes} />
                        {p.selected && (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        )}
                        {canManage && !p.selected && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                              >
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="text-sm"
                            >
                              <DropdownMenuItem
                                onClick={() => openEdit(p)}
                                className="gap-2"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setTitle(`${p.title} (copy)`);
                                  setAmount(String(parseFloat(p.amount)));
                                  setScope(p.scope as BudgetScope);
                                  setCovers(p.covers || "");
                                  setAddOpen(true);
                                }}
                                className="gap-2"
                              >
                                <Copy className="h-3.5 w-3.5" /> Clone &amp;
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(p.id)}
                                disabled={deleteMutation.isPending}
                                className="gap-2 text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {/* Both figures, always: a per-family number and a
                        per-person number are not comparable until one of them
                        has been converted, and the reader should not have to. */}
                    {figures && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                          {money(figures.currency, figures.tripTotal)} for the
                          trip
                        </span>
                        <span className="text-muted-foreground">
                          {money(figures.currency, figures.perPerson)} per
                          person
                        </span>
                        {summary?.myCapIsGroup && (
                          <span className="text-muted-foreground">
                            {money(figures.currency, figures.yourGroupShare)}{" "}
                            for your family
                          </span>
                        )}
                      </div>
                    )}

                    {p.covers && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {p.covers}
                      </p>
                    )}

                    <div className="flex gap-4 text-xs mb-3 items-center">
                      <span className="text-pink-600 font-medium flex items-center gap-1">
                        <Heart className="h-3 w-3" /> {loves}
                      </span>
                      <span className="text-blue-600 font-medium flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" /> {fines}
                      </span>
                      <span className="text-red-500 font-medium flex items-center gap-1">
                        <Ban className="h-3 w-3" /> {vetos}
                      </span>
                      <VotedCount
                        className="ml-auto"
                        tripId={tripId}
                        proposalType="budget"
                        proposalId={p.id}
                        votedCount={p.votes?.length || 0}
                        voterCount={voterCount}
                        canSeeDetail={canContribute}
                      />
                    </div>

                    {canContribute && !p.selected && (
                      <div className="flex gap-2">
                        {[
                          {
                            vote: "love" as const,
                            icon: Heart,
                            label: "Yes",
                            active:
                              "bg-green-100 text-green-700 border-green-300",
                          },
                          {
                            vote: "fine" as const,
                            icon: HelpCircle,
                            label: "Maybe",
                            active:
                              "bg-yellow-100 text-yellow-700 border-yellow-300",
                          },
                          {
                            vote: "veto" as const,
                            icon: Ban,
                            label: "No",
                            active: "bg-red-100 text-red-600 border-red-300",
                          },
                        ].map(btn => (
                          <Button
                            key={btn.vote}
                            variant="outline"
                            size="sm"
                            className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`}
                            onClick={() => handleVote(p.id, btn.vote)}
                          >
                            <btn.icon className="h-3.5 w-3.5 mr-1" />
                            {btn.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 space-y-0.5">
                      <AddedBy proposal={p} currentUserId={user?.id} />
                      <FinalisedBy
                        proposal={p}
                        members={members}
                        currentUserId={user?.id}
                      />
                    </div>

                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-primary text-xs"
                        onClick={() => handleToggleLock(p.id, !p.selected)}
                        disabled={setLockMutation.isPending}
                      >
                        {p.selected ? (
                          <>
                            <Unlock className="h-3.5 w-3.5 mr-1" /> Un-finalise
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />{" "}
                            Finalise this
                          </>
                        )}
                      </Button>
                    )}

                    <ProposalComments
                      proposalType="budget"
                      proposalId={p.id}
                      tripId={tripId}
                      isOrganizer={isAdmin}
                      canContribute={canContribute}
                      count={commentCount}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {canContribute
                  ? "No budget on the table yet. Put a number on it — it is easier to argue with a figure than without one."
                  : "No budget has been proposed yet."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit dialog — unreachable without the menu that opens it. */}
      <Dialog open={editOpen && canContribute} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Amount ({currency})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            {scopeField(editScope, setEditScope)}
            <div>
              <Label className="text-xs">What does it cover?</Label>
              <Textarea
                value={editCovers}
                onChange={e => setEditCovers(e.target.value)}
                rows={2}
                className="rounded-lg mt-1 resize-none text-sm"
              />
            </div>
            <Button
              onClick={handleEdit}
              className="w-full rounded-lg"
              disabled={editMutation.isPending}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The personal limit. It says which of the two it is setting, because on
          a trip of families the number belongs to the family, not the person. */}
      <Dialog open={capOpen && canContribute} onOpenChange={setCapOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {summary?.myCapIsGroup
                ? "Your family's limit"
                : "Your personal limit"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {summary?.myCapIsGroup
                ? "You're in a group, so this is what your whole family is comfortable spending. Nobody else sees the figure — the group is only told how many people are above their limit."
                : "What you're comfortable spending. Nobody else sees the figure — the group is only told how many people are above their limit."}
            </p>
            <div>
              <Label className="text-xs">Limit ({currency})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={cap}
                onChange={e => setCap(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            <Button
              onClick={handleSaveCap}
              className="w-full rounded-lg"
              disabled={capMutation.isPending}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
