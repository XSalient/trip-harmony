import { useAuth } from "@/_core/hooks/useAuth";
import { VoteTally, VoteSegments, CHOICE_OPTIONS } from "@/components/trip/ProposalRow";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { EmptyState } from "@/components/harmony";
import SectionOffNotice from "@/components/trip/SectionOffNotice";
import ScreenHeader from "@/components/trip/ScreenHeader";
import ProposalComments from "@/components/ProposalComments";
import FinalisedBy from "@/components/trip/FinalisedBy";
import AddedBy from "@/components/trip/AddedBy";
import VotedCount from "@/components/trip/VotedCount";
import WatcherNotice from "@/components/trip/WatcherNotice";
import VoteScore, { scoreVotes } from "@/components/trip/VoteScore";
import {
  MAJORITY_VOTE,
  finaliseBlockReason,
  type PreferenceVote,
} from "@shared/votes";
import { useParams, useSearch, useLocation } from "wouter";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Lightbulb,
  Plus,
  Heart,
  ThumbsUp,
  Ban,
  CheckCircle2,
  DollarSign,
  Trash2,
  Unlock,
  MoreVertical,
  Pencil,
  Copy,
  HelpCircle,
  MessageCircle,
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

export default function TripDestinations() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: destinations, isLoading } = trpc.destinations.list.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: trip } = trpc.trips.get.useQuery(
    { id: tripId },
    { enabled: tripId > 0 }
  );
  // Resolves `lockedBy` to a name for the "Finalised by …" line.
  const { data: members } = trpc.trips.members.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const { data: commentCounts = {} } = trpc.comments.countsByTrip.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );
  const createMutation = trpc.destinations.create.useMutation();
  const voteMutation = trpc.destinations.vote.useMutation();
  const unvoteMutation = trpc.destinations.unvote.useMutation();
  const setLockMutation = trpc.destinations.setLock.useMutation();
  const unlockAllMutation = trpc.destinations.unlockAll.useMutation();
  const deleteMutation = trpc.destinations.delete.useMutation();
  const editMutation = trpc.destinations.edit.useMutation();
  const cloneMutation = trpc.destinations.clone.useMutation();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);

  /**
   * `?add=1` opens this screen's add dialog straight away.
   *
   * The trip page used to carry its own thinner copy of each add form; now its
   * Add buttons come here instead, so there is one form per proposal type. The
   * parameter is cleared once consumed, or going back would reopen the dialog.
   */
  const search = useSearch();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (new URLSearchParams(search).get("add") !== "1") return;
    setAddOpen(true);
    navigate(window.location.pathname, { replace: true });
  }, [search, navigate]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editEstimatedCost, setEditEstimatedCost] = useState("");

  // Role, not authorship: `organizerId` names whoever created the trip and
  // cannot see a second admin, so gating on it hid these controls from admins
  // who had them and showed them to a creator who had been demoted.
  const {
    canAdminister: isAdmin,
    canContribute,
    isWatcher,
  } = useTripRole(tripId);

  const openEdit = (dest: any) => {
    setEditingId(dest.id);
    setEditName(dest.name || "");
    setEditDescription(dest.description || "");
    setEditImageUrl(dest.imageUrl || "");
    setEditEstimatedCost(
      dest.estimatedCost ? String(parseFloat(dest.estimatedCost)) : ""
    );
    setEditOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("A name is required");
      return;
    }
    try {
      await createMutation.mutateAsync({
        tripId,
        name: name.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        estimatedCost: estimatedCost || undefined,
      });
      utils.destinations.list.invalidate({ tripId });
      setAddOpen(false);
      setName("");
      setDescription("");
      setImageUrl("");
      setEstimatedCost("");
      toast.success("Suggestion added!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add the suggestion");
    }
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      await editMutation.mutateAsync({
        id: editingId,
        name: editName || undefined,
        description: editDescription || undefined,
        imageUrl: editImageUrl || undefined,
        estimatedCost: editEstimatedCost || undefined,
      });
      utils.destinations.list.invalidate({ tripId });
      setEditOpen(false);
      toast.success("Suggestion updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleVote = (destinationId: number, vote: PreferenceVote) => {
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
    const onError = () => {
      utils.destinations.list.invalidate({ tripId });
      toast.error("Failed to vote");
    };
    const onSuccess = () => {
      utils.destinations.list.invalidate({ tripId });
    };
    if (isUnvote) {
      unvoteMutation.mutate({ destinationId }, { onError, onSuccess });
    } else {
      voteMutation.mutate({ destinationId, vote }, { onError, onSuccess });
    }
  };

  /**
   * Finalise or un-finalise one suggestion. Several can be finalised at once,
   * so this toggles a single row and leaves the rest.
   */
  const handleToggleLock = async (destinationId: number, locked: boolean) => {
    try {
      await setLockMutation.mutateAsync({ destinationId, locked });
      utils.destinations.list.invalidate({ tripId });
      toast.success(locked ? "Finalised" : "Un-finalised");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't change that");
    }
  };

  const handleDeselect = async () => {
    try {
      await unlockAllMutation.mutateAsync({ tripId });
      utils.destinations.list.invalidate({ tripId });
      toast.success("Selection unlocked");
    } catch {
      toast.error("Failed to unlock");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.destinations.list.invalidate({ tripId });
      toast.success("Suggestion removed");
    } catch (e: any) {
      toast.error(
        e?.message?.includes("Not authorized")
          ? "Not authorized to delete"
          : "Failed to delete"
      );
    }
  };

  const handleCloneIntoForm = (dest: any) => {
    setName(dest.name ? dest.name + " (copy)" : "");
    setDescription(dest.description || "");
    setImageUrl(dest.imageUrl || "");
    setEstimatedCost(
      dest.estimatedCost ? String(parseFloat(dest.estimatedCost)) : ""
    );
    setAddOpen(true);
  };

  const sortedDestinations = useMemo(() => {
    if (!destinations) return [];
    return [...destinations].sort(
      (a: any, b: any) => scoreVotes(b.votes) - scoreVotes(a.votes)
    );
  }, [destinations]);

  // See `VotedCount`: voters, not members, and derived server-side.
  const voterCount = (trip as any)?.voterCount ?? 0;

  // A trip can finalise several suggestions at once. This was a `find()` back
  // when the database cleared every other row before setting one, which made
  // every finalised suggestion but one invisible.
  const lockedDestinations = useMemo(
    () => sortedDestinations.filter((d: any) => d.selected),
    [sortedDestinations]
  );

  // Switched off for this trip. The data behind this screen is untouched and
  // its procedures still work — this is a display decision, not a permission.
  if ((trip as any)?.hiddenSections?.includes("suggestions"))
    return <SectionOffNotice tripId={tripId} section="suggestions" />;

  return (
    <AppShell title="Suggestions" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <ScreenHeader
          subtitle={
            canContribute
              ? "Suggest anything and vote on it"
              : "What the group is considering"
          }
          highlight={
            lockedDestinations.length > 0
              ? `${lockedDestinations.length} finalised · ${lockedDestinations
                  .map((d: any) => d.name)
                  .join(", ")}`
              : undefined
          }
          actions={
            <>
              {isAdmin && lockedDestinations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg gap-1 text-xs h-8"
                  onClick={handleDeselect}
                  disabled={unlockAllMutation.isPending}
                >
                  <Unlock className="h-3.5 w-3.5" /> Unlock all
                </Button>
              )}
              {canContribute && (
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="rounded-lg gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Add a Suggestion</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          placeholder="What are you suggesting?"
                          value={name}
                          onChange={e => setName(e.target.value)}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Textarea
                          placeholder="Why this one?"
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          rows={2}
                          className="rounded-lg resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Image URL (optional)</Label>
                        <Input
                          placeholder="https://..."
                          value={imageUrl}
                          onChange={e => setImageUrl(e.target.value)}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>
                          Estimated Cost per Person ({trip?.currency || "USD"})
                        </Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={estimatedCost}
                          onChange={e => setEstimatedCost(e.target.value)}
                          className="rounded-lg"
                        />
                      </div>
                      <Button
                        onClick={handleCreate}
                        className="w-full rounded-lg"
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? "Adding..." : "Add Place"}
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
            You're following this trip. The suggestions and the tally are here;
            voting and suggesting are for tripmates.
          </WatcherNotice>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : sortedDestinations.length > 0 ? (
          <div className="space-y-4">
            {sortedDestinations.map((dest: any) => {
              // Null unless everybody who voted abstained. The server
              // refuses it either way; this only says why.
              const blockReason = finaliseBlockReason(dest.votes);
              const myVote = dest.votes?.find(
                (v: any) => v.userId === user?.id
              )?.vote;
              const loves =
                dest.votes?.filter((v: any) => v.vote === "love").length || 0;
              const fines =
                dest.votes?.filter((v: any) => v.vote === "fine").length || 0;
              const vetos =
                dest.votes?.filter((v: any) => v.vote === "veto").length || 0;
              const isOwner = dest.proposedBy === user?.id;
              const canManage = canContribute && (isOwner || isAdmin);
              const commentCount =
                (commentCounts as any)[`destination_${dest.id}`] || 0;

              return (
                <Card
                  key={dest.id}
                  // Finalised is the success tone here as it is everywhere else. The
                  // brand ring said "important", which every card on a page of
                  // proposals already is — the one the group settled on is a
                  // different statement.
                  className={`relative overflow-hidden rounded-2xl shadow-e1 ${dest.selected ? "border-success/40" : "border-border/70"}`}
                >
                  {dest.selected && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 z-10 w-[3px] rounded-r-full bg-success"
                    />
                  )}
                  {dest.imageUrl && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <img
                        src={dest.imageUrl}
                        alt={dest.name}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base">{dest.name}</h3>
                        {dest.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                            {dest.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {commentCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />
                            {commentCount}
                          </span>
                        )}
                        <VoteScore votes={dest.votes} />
                        {dest.selected && (
                          <CheckCircle2 className="size-5 text-success" />
                        )}
                        {canManage && !dest.selected && (
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
                                onClick={() => openEdit(dest)}
                                className="gap-2"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCloneIntoForm(dest)}
                                className="gap-2"
                              >
                                <Copy className="h-3.5 w-3.5" /> Clone & Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(dest.id)}
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

                    {/* No dollar glyph: the currency code is already in the
                        string, and "$ GBP220" is two currencies. */}
                    {dest.estimatedCost && (
                      <div className="tabular mb-3 text-[13px] text-muted-foreground">
                        ~{trip?.currency || "$"}
                        {parseFloat(dest.estimatedCost).toFixed(0)} per person
                      </div>
                    )}

                    <div className="flex gap-4 text-xs mb-3 items-center">
                      <VoteTally options={CHOICE_OPTIONS} votes={dest.votes} />
                      <VotedCount
                        className="ml-auto"
                        tripId={tripId}
                        proposalType="destination"
                        proposalId={dest.id}
                        votedCount={dest.votes?.length || 0}
                        voterCount={voterCount}
                        votes={dest.votes}
                        canSeeDetail={canContribute}
                      />
                    </div>

                    {canContribute && !dest.selected && (
                      <VoteSegments
                        options={CHOICE_OPTIONS}
                        myVote={myVote}
                        onVote={v => handleVote(dest.id, v)}
                      />
                    )}

                    {/* Attribution and the finalise action share one row. They were four
                        stacked full-width rows — "Added by", "Finalised by", the button,
                        then comments — which is 140px of footer under every proposal. */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                      <AddedBy proposal={dest} currentUserId={user?.id} />
                      <FinalisedBy
                        proposal={dest}
                        members={members}
                        currentUserId={user?.id}
                      />
                      {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto rounded-full text-xs text-primary"
                        onClick={() =>
                          handleToggleLock(dest.id, !dest.selected)
                        }
                        disabled={
                          setLockMutation.isPending ||
                          (!dest.selected && blockReason !== null)
                        }
                        title={
                          dest.selected ? undefined : (blockReason ?? undefined)
                        }
                      >
                        {dest.selected ? (
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
                  </div>

                    <ProposalComments
                      proposalType="destination"
                      proposalId={dest.id}
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
          <EmptyState
            icon={Lightbulb}
            title="Nothing suggested yet"
            description={
              canContribute
                ? "Throw the first idea in and see what the group thinks."
                : "Nobody has suggested anything so far."
            }
          />
        )}
      </div>

      {/* Edit dialog — unreachable without the menu that opens it. */}
      <Dialog open={editOpen && canContribute} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Suggestion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={2}
                className="rounded-lg mt-1 resize-none text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Image URL (optional)</Label>
              <Input
                value={editImageUrl}
                onChange={e => setEditImageUrl(e.target.value)}
                placeholder="https://..."
                className="rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">
                Estimated cost per person ({trip?.currency || "USD"})
              </Label>
              <Input
                type="number"
                value={editEstimatedCost}
                onChange={e => setEditEstimatedCost(e.target.value)}
                className="rounded-lg mt-1"
              />
            </div>
            <Button
              onClick={handleEdit}
              className="w-full rounded-lg"
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
