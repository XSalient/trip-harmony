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
import { useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Plus, Heart, HelpCircle, Ban, Trash2, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const TAG_OPTIONS = ["Beach", "Mountains", "City", "Cultural", "Adventure", "Relaxation", "Foodie", "Nightlife", "Nature", "Historical", "Romantic", "Family"];

export default function TripVibeBoard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: items, isLoading, refetch } = trpc.vibeBoard.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const addMutation = trpc.vibeBoard.add.useMutation();
  const deleteMutation = trpc.vibeBoard.delete.useMutation();
  const voteMutation = trpc.vibeBoard.vote.useMutation();
  const unvoteMutation = trpc.vibeBoard.unvote.useMutation();
  const utils = trpc.useUtils();

  const isOrganizer = trip?.organizerId === user?.id;

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleAdd = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    try {
      await addMutation.mutateAsync({
        tripId,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        tags: selectedTags.length > 0 ? JSON.stringify(selectedTags) : undefined,
      });
      refetch();
      setAddOpen(false);
      setTitle(""); setDescription(""); setUrl(""); setImageUrl(""); setSelectedTags([]);
      toast.success("Added to vibe board!");
    } catch { toast.error("Failed to add"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      refetch();
      toast.success("Removed");
    } catch { toast.error("Failed to remove"); }
  };

  const handleVote = (vibeItemId: number, vote: "love" | "fine" | "veto") => {
    const currentVote = items?.find((i: any) => i.id === vibeItemId)?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.vibeBoard.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((i: any) => {
        if (i.id !== vibeItemId) return i;
        const filtered = i.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return { ...i, votes: isUnvote ? filtered : [...filtered, { userId: user?.id, vote }] };
      });
    });
    if (isUnvote) {
      unvoteMutation.mutate({ vibeItemId }, { onError: () => refetch(), onSuccess: () => refetch() });
    } else {
      voteMutation.mutate({ vibeItemId, vote }, { onError: () => { toast.error("Vote failed"); refetch(); }, onSuccess: () => refetch() });
    }
  };

  const getScore = (item: any) => {
    const loves = item.votes?.filter((v: any) => v.vote === "love").length || 0;
    const fines = item.votes?.filter((v: any) => v.vote === "fine").length || 0;
    const vetos = item.votes?.filter((v: any) => v.vote === "veto").length || 0;
    return loves * 2 + fines - vetos * 2;
  };

  return (
    <AppShell title="Vibe Board" backHref={`/trips/${tripId}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Vibe Board</h1>
            <p className="text-sm text-muted-foreground">Share inspiration — photos, links, vibes. Vote on what resonates.</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5">
                <Plus className="h-4 w-4" /> Add Vibe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm mx-4 rounded-2xl">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Add Inspiration</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-1">
                <div>
                  <Label className="text-xs">Title *</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cozy mountain cabin" className="rounded-lg mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Why does this excite you?" rows={2} className="rounded-lg mt-1 resize-none text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Link (Airbnb, Instagram, etc.)</Label>
                  <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="rounded-lg mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Image URL (optional)</Label>
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="rounded-lg mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Vibes</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {TAG_OPTIONS.map(tag => (
                      <button key={tag} onClick={() => toggleTag(tag)} className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${selectedTags.includes(tag) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"}`}>{tag}</button>
                    ))}
                  </div>
                </div>
                <Button onClick={handleAdd} className="w-full rounded-lg" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Adding..." : "Add to Board"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
        ) : items && items.length > 0 ? (
          <div className="space-y-3">
            {[...items].sort((a: any, b: any) => getScore(b) - getScore(a)).map((item: any) => {
              const myVote = item.votes?.find((v: any) => v.userId === user?.id)?.vote;
              const loves = item.votes?.filter((v: any) => v.vote === "love").length || 0;
              const fines = item.votes?.filter((v: any) => v.vote === "fine").length || 0;
              const vetos = item.votes?.filter((v: any) => v.vote === "veto").length || 0;
              const score = getScore(item);
              const tags = item.tags ? JSON.parse(item.tags) : [];
              const canDelete = item.proposedBy === user?.id || isOrganizer;

              return (
                <Card key={item.id} className="overflow-hidden border-border/50">
                  {item.imageUrl && (
                    <div className="h-36 bg-muted overflow-hidden">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base">{item.title}</h3>
                        {item.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>}
                        <p className="text-[11px] text-muted-foreground mt-1">by {item.proposedByUser?.name || "Unknown"}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className={`text-lg font-bold ${score > 0 ? "text-green-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                        {canDelete && (
                          <button onClick={() => handleDelete(item.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px] rounded-full">{t}</Badge>)}
                      </div>
                    )}

                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 mb-3 hover:underline">
                        <ExternalLink className="h-3 w-3" /> View link
                      </a>
                    )}

                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-pink-600 font-medium flex items-center gap-1"><Heart className="h-3 w-3" /> {loves}</span>
                      <span className="text-blue-600 font-medium flex items-center gap-1"><HelpCircle className="h-3 w-3" /> {fines}</span>
                      <span className="text-red-500 font-medium flex items-center gap-1"><Ban className="h-3 w-3" /> {vetos}</span>
                    </div>

                    <div className="flex gap-2">
                      {[
                        { vote: "love" as const, icon: Heart, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                        { vote: "fine" as const, icon: HelpCircle, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                        { vote: "veto" as const, icon: Ban, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                      ].map(btn => (
                        <Button key={btn.vote} variant="outline" size="sm" className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`} onClick={() => handleVote(item.id, btn.vote)}>
                          <btn.icon className="h-3.5 w-3.5 mr-1" />{btn.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No vibes yet</p>
              <p className="text-xs text-muted-foreground mt-1">Be the first to share inspiration — a photo, a link, an idea.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
