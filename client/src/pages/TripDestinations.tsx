import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import ProposalComments from "@/components/ProposalComments";
import { useParams } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { MapPin, Plus, Heart, ThumbsUp, Ban, CheckCircle2, DollarSign, Trash2, Unlock, MoreVertical, Pencil, Copy, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const vibeOptions = ["Beach", "Mountains", "City", "Cultural", "Adventure", "Relaxation", "Foodie", "Nightlife", "Nature", "Historical", "Romantic", "Family-friendly"];

export default function TripDestinations() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: destinations, isLoading } = trpc.destinations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const createMutation = trpc.destinations.create.useMutation();
  const voteMutation = trpc.destinations.vote.useMutation();
  const selectMutation = trpc.destinations.select.useMutation();
  const deselectMutation = trpc.destinations.deselect.useMutation();
  const deleteMutation = trpc.destinations.delete.useMutation();
  const editMutation = trpc.destinations.edit.useMutation();
  const cloneMutation = trpc.destinations.clone.useMutation();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editEstimatedCost, setEditEstimatedCost] = useState("");
  const [editVibes, setEditVibes] = useState<string[]>([]);

  const isOrganizer = trip?.organizerId === user?.id;

  const toggleVibe = (vibe: string) => setSelectedVibes(prev => prev.includes(vibe) ? prev.filter(v => v !== vibe) : [...prev, vibe]);
  const toggleEditVibe = (vibe: string) => setEditVibes(prev => prev.includes(vibe) ? prev.filter(v => v !== vibe) : [...prev, vibe]);

  const openEdit = (dest: any) => {
    setEditingId(dest.id);
    setEditName(dest.name || "");
    setEditDescription(dest.description || "");
    setEditImageUrl(dest.imageUrl || "");
    setEditEstimatedCost(dest.estimatedCost ? String(parseFloat(dest.estimatedCost)) : "");
    setEditVibes(dest.vibes ? JSON.parse(dest.vibes) : []);
    setEditOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast.error("Destination name is required"); return; }
    try {
      await createMutation.mutateAsync({
        tripId,
        name: name.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        vibes: selectedVibes.length > 0 ? JSON.stringify(selectedVibes) : undefined,
        estimatedCost: estimatedCost || undefined,
      });
      utils.destinations.list.invalidate({ tripId });
      setAddOpen(false);
      setName(""); setDescription(""); setImageUrl(""); setEstimatedCost(""); setSelectedVibes([]);
      toast.success("Destination added!");
    } catch (e: any) { toast.error(e?.message || "Failed to add destination"); }
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
        vibes: editVibes.length > 0 ? JSON.stringify(editVibes) : undefined,
      });
      utils.destinations.list.invalidate({ tripId });
      setEditOpen(false);
      toast.success("Destination updated");
    } catch { toast.error("Failed to update"); }
  };

  const handleVote = async (destinationId: number, vote: "love" | "fine" | "veto") => {
    try {
      await voteMutation.mutateAsync({ destinationId, vote });
      utils.destinations.list.invalidate({ tripId });
    } catch { toast.error("Failed to vote"); }
  };

  const handleSelect = async (destinationId: number) => {
    try {
      await selectMutation.mutateAsync({ tripId, destinationId });
      utils.destinations.list.invalidate({ tripId });
      toast.success("Destination selected!");
    } catch { toast.error("Failed to select"); }
  };

  const handleDeselect = async () => {
    try {
      await deselectMutation.mutateAsync({ tripId });
      utils.destinations.list.invalidate({ tripId });
      toast.success("Selection unlocked");
    } catch { toast.error("Failed to unlock"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.destinations.list.invalidate({ tripId });
      toast.success("Destination removed");
    } catch (e: any) {
      toast.error(e?.message?.includes("Not authorized") ? "Not authorized to delete" : "Failed to delete");
    }
  };

  const handleCloneIntoForm = (dest: any) => {
    setName(dest.name ? dest.name + " (copy)" : "");
    setDescription(dest.description || "");
    setImageUrl(dest.imageUrl || "");
    setEstimatedCost(dest.estimatedCost ? String(parseFloat(dest.estimatedCost)) : "");
    setSelectedVibes(dest.vibes ? JSON.parse(dest.vibes) : []);
    setAddOpen(true);
  };

  const getScore = (dest: any) => {
    const votes = dest.votes || [];
    return votes.reduce((s: number, v: any) => s + (v.vote === "love" ? 2 : v.vote === "fine" ? 1 : -3), 0);
  };

  const sortedDestinations = useMemo(() => {
    if (!destinations) return [];
    return [...destinations].sort((a: any, b: any) => getScore(b) - getScore(a));
  }, [destinations]);

  const selectedDestination = useMemo(() => sortedDestinations.find((d: any) => d.selected), [sortedDestinations]);

  return (
    <AppShell title="Destinations" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Suggest destinations and vote on vibes</p>
            {selectedDestination && <p className="text-xs text-primary font-medium mt-0.5">{selectedDestination.name} selected</p>}
          </div>
          <div className="flex items-center gap-2">
            {isOrganizer && selectedDestination && (
              <Button variant="outline" size="sm" className="rounded-lg gap-1 text-xs h-8" onClick={handleDeselect} disabled={deselectMutation.isPending}>
                <Unlock className="h-3.5 w-3.5" /> Unlock
              </Button>
            )}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-lg gap-1"><Plus className="h-4 w-4" /> Add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Suggest Destination</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Destination Name</Label>
                    <Input placeholder="e.g., Bali, Indonesia" value={name} onChange={e => setName(e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea placeholder="Why this place?" value={description} onChange={e => setDescription(e.target.value)} rows={2} className="rounded-lg resize-none" />
                  </div>
                  <div className="space-y-2">
                    <Label>Image URL (optional)</Label>
                    <Input placeholder="https://..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>Estimated Cost per Person ({trip?.currency || "USD"})</Label>
                    <Input type="number" placeholder="0" value={estimatedCost} onChange={e => setEstimatedCost(e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vibes</Label>
                    <div className="flex flex-wrap gap-2">
                      {vibeOptions.map(v => (
                        <Badge key={v} variant={selectedVibes.includes(v) ? "default" : "outline"} className="cursor-pointer rounded-full px-3 py-1 text-xs" onClick={() => toggleVibe(v)}>
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleCreate} className="w-full rounded-lg" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Adding..." : "Add Destination"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
        ) : sortedDestinations.length > 0 ? (
          <div className="space-y-4">
            {sortedDestinations.map((dest: any) => {
              const myVote = dest.votes?.find((v: any) => v.userId === user?.id)?.vote;
              const loves = dest.votes?.filter((v: any) => v.vote === "love").length || 0;
              const fines = dest.votes?.filter((v: any) => v.vote === "fine").length || 0;
              const vetos = dest.votes?.filter((v: any) => v.vote === "veto").length || 0;
              const vibes = dest.vibes ? JSON.parse(dest.vibes) : [];
              const score = getScore(dest);
              const isOwner = dest.proposedBy === user?.id;
              const canManage = isOwner || isOrganizer;

              return (
                <Card key={dest.id} className={`overflow-hidden ${dest.selected ? "border-primary ring-1 ring-primary" : "border-border/50"}`}>
                  {dest.imageUrl && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <img src={dest.imageUrl} alt={dest.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base">{dest.name}</h3>
                        {dest.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{dest.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className={`text-lg font-bold ${score > 0 ? "text-green-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                        {dest.selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        {canManage && !dest.selected && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-sm">
                              <DropdownMenuItem onClick={() => openEdit(dest)} className="gap-2">
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCloneIntoForm(dest)} className="gap-2">
                                <Copy className="h-3.5 w-3.5" /> Clone & Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(dest.id)} disabled={deleteMutation.isPending} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {vibes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {vibes.map((v: string) => <Badge key={v} variant="secondary" className="text-[10px] rounded-full">{v}</Badge>)}
                      </div>
                    )}

                    {dest.estimatedCost && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                        <DollarSign className="h-3.5 w-3.5" />
                        <span>~{trip?.currency || "$"}{parseFloat(dest.estimatedCost).toFixed(0)}/person</span>
                      </div>
                    )}

                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-pink-600 font-medium flex items-center gap-1"><Heart className="h-3 w-3" /> {loves}</span>
                      <span className="text-blue-600 font-medium flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {fines}</span>
                      <span className="text-red-500 font-medium flex items-center gap-1"><Ban className="h-3 w-3" /> {vetos}</span>
                    </div>

                    {!dest.selected && (
                      <div className="flex gap-2">
                        {[
                          { vote: "love" as const, icon: Heart, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                          { vote: "fine" as const, icon: HelpCircle, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                          { vote: "veto" as const, icon: Ban, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                        ].map(btn => (
                          <Button key={btn.vote} variant="outline" size="sm" className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`} onClick={() => handleVote(dest.id, btn.vote)} disabled={voteMutation.isPending}>
                            <btn.icon className="h-3.5 w-3.5 mr-1" />{btn.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {isOrganizer && !dest.selected && (
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-primary text-xs" onClick={() => handleSelect(dest.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Select this destination
                      </Button>
                    )}

                    <ProposalComments proposalType="destination" proposalId={dest.id} tripId={tripId} isOrganizer={isOrganizer} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No destinations yet. Suggest the first one!</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Destination</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" />
            </div>
            <div>
              <Label className="text-xs">Image URL (optional)</Label>
              <Input value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} placeholder="https://..." className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Estimated cost per person ({trip?.currency || "USD"})</Label>
              <Input type="number" value={editEstimatedCost} onChange={e => setEditEstimatedCost(e.target.value)} className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Vibes</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {vibeOptions.map(v => (
                  <Badge key={v} variant={editVibes.includes(v) ? "default" : "outline"} className="cursor-pointer rounded-full px-3 py-1 text-xs" onClick={() => toggleEditVibe(v)}>
                    {v}
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={handleEdit} className="w-full rounded-lg" disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
