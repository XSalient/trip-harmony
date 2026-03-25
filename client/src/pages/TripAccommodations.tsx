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
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Home, Plus, Heart, ThumbsUp, Ban, CheckCircle2, Bed, Bath, DollarSign, ExternalLink, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function TripAccommodations() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: accommodations, isLoading } = trpc.accommodations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const createMutation = trpc.accommodations.create.useMutation();
  const voteMutation = trpc.accommodations.vote.useMutation();
  const selectMutation = trpc.accommodations.select.useMutation();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", imageUrl: "", pricePerNight: "", totalPrice: "",
    bedrooms: "", bathrooms: "", location: "", link: "", amenities: "",
  });

  const isOrganizer = trip?.organizerId === user?.id;

  const updateForm = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      await createMutation.mutateAsync({
        tripId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        pricePerNight: form.pricePerNight || undefined,
        totalPrice: form.totalPrice || undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
        location: form.location.trim() || undefined,
        link: form.link.trim() || undefined,
        amenities: form.amenities.trim() || undefined,
      });
      utils.accommodations.list.invalidate({ tripId });
      setAddOpen(false);
      setForm({ name: "", description: "", imageUrl: "", pricePerNight: "", totalPrice: "", bedrooms: "", bathrooms: "", location: "", link: "", amenities: "" });
      toast.success("Accommodation added!");
    } catch { toast.error("Failed to add"); }
  };

  const handleVote = async (accommodationId: number, vote: "love" | "fine" | "veto") => {
    try {
      await voteMutation.mutateAsync({ accommodationId, vote });
      utils.accommodations.list.invalidate({ tripId });
    } catch { toast.error("Failed to vote"); }
  };

  const handleSelect = async (accommodationId: number) => {
    try {
      await selectMutation.mutateAsync({ tripId, accommodationId });
      utils.accommodations.list.invalidate({ tripId });
      toast.success("Accommodation selected!");
    } catch { toast.error("Failed to select"); }
  };

  const getScore = (acc: any) => {
    const votes = acc.votes || [];
    return votes.reduce((s: number, v: any) => s + (v.vote === "love" ? 2 : v.vote === "fine" ? 1 : -3), 0);
  };

  const sorted = useMemo(() => {
    if (!accommodations) return [];
    return [...accommodations].sort((a: any, b: any) => getScore(b) - getScore(a));
  }, [accommodations]);

  const currency = trip?.currency || "USD";

  return (
    <AppShell title="Accommodations" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Compare stays and vote on your favorites</p>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-lg gap-1"><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Accommodation</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input placeholder="e.g., Beachfront Villa" value={form.name} onChange={e => updateForm("name", e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea placeholder="What makes this special?" value={form.description} onChange={e => updateForm("description", e.target.value)} rows={2} className="rounded-lg resize-none" />
                </div>
                <div className="space-y-1.5">
                  <Label>Image URL</Label>
                  <Input placeholder="https://..." value={form.imageUrl} onChange={e => updateForm("imageUrl", e.target.value)} className="rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price/Night ({currency})</Label>
                    <Input type="number" placeholder="0" value={form.pricePerNight} onChange={e => updateForm("pricePerNight", e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total Price ({currency})</Label>
                    <Input type="number" placeholder="0" value={form.totalPrice} onChange={e => updateForm("totalPrice", e.target.value)} className="rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Bedrooms</Label>
                    <Input type="number" placeholder="0" value={form.bedrooms} onChange={e => updateForm("bedrooms", e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bathrooms</Label>
                    <Input type="number" placeholder="0" value={form.bathrooms} onChange={e => updateForm("bathrooms", e.target.value)} className="rounded-lg" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input placeholder="Address or area" value={form.location} onChange={e => updateForm("location", e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Booking Link</Label>
                  <Input placeholder="https://..." value={form.link} onChange={e => updateForm("link", e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Amenities (comma separated)</Label>
                  <Input placeholder="WiFi, Pool, Kitchen..." value={form.amenities} onChange={e => updateForm("amenities", e.target.value)} className="rounded-lg" />
                </div>
                <Button onClick={handleCreate} className="w-full rounded-lg" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add Accommodation"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
        ) : sorted.length > 0 ? (
          <div className="space-y-4">
            {sorted.map((acc: any) => {
              const myVote = acc.votes?.find((v: any) => v.userId === user?.id)?.vote;
              const loves = acc.votes?.filter((v: any) => v.vote === "love").length || 0;
              const fines = acc.votes?.filter((v: any) => v.vote === "fine").length || 0;
              const vetos = acc.votes?.filter((v: any) => v.vote === "veto").length || 0;
              const score = getScore(acc);
              const amenities = acc.amenities ? acc.amenities.split(",").map((a: string) => a.trim()).filter(Boolean) : [];

              return (
                <Card key={acc.id} className={`overflow-hidden ${acc.selected ? "border-primary ring-1 ring-primary" : "border-border/50"}`}>
                  {acc.imageUrl && (
                    <div className="h-40 bg-muted overflow-hidden">
                      <img src={acc.imageUrl} alt={acc.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base">{acc.name}</h3>
                        {acc.location && <p className="text-xs text-muted-foreground mt-0.5">{acc.location}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <span className={`text-lg font-bold ${score > 0 ? "text-green-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                        {acc.selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </div>
                    </div>

                    {acc.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{acc.description}</p>}

                    {/* Stats */}
                    <div className="flex flex-wrap gap-3 mb-3 text-xs">
                      {acc.bedrooms && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bed className="h-3.5 w-3.5" /> {acc.bedrooms} bed</span>
                      )}
                      {acc.bathrooms && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bath className="h-3.5 w-3.5" /> {acc.bathrooms} bath</span>
                      )}
                      {acc.comfortScore && (
                        <span className="flex items-center gap-1 text-yellow-600"><Star className="h-3.5 w-3.5" /> {parseFloat(acc.comfortScore).toFixed(1)}</span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-3 mb-3">
                      {acc.pricePerNight && (
                        <div>
                          <span className="text-lg font-bold">{currency} {parseFloat(acc.pricePerNight).toFixed(0)}</span>
                          <span className="text-xs text-muted-foreground">/night</span>
                        </div>
                      )}
                      {acc.perPersonCost && (
                        <span className="text-sm text-muted-foreground">~{currency} {parseFloat(acc.perPersonCost).toFixed(0)}/person total</span>
                      )}
                    </div>

                    {/* Amenities */}
                    {amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {amenities.slice(0, 6).map((a: string) => (
                          <Badge key={a} variant="secondary" className="text-[10px] rounded-full">{a}</Badge>
                        ))}
                        {amenities.length > 6 && <Badge variant="outline" className="text-[10px] rounded-full">+{amenities.length - 6}</Badge>}
                      </div>
                    )}

                    {acc.link && (
                      <a href={acc.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 mb-3 hover:underline">
                        <ExternalLink className="h-3 w-3" /> View listing
                      </a>
                    )}

                    {/* Vote counts */}
                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-pink-600 font-medium flex items-center gap-1"><Heart className="h-3 w-3" /> {loves}</span>
                      <span className="text-blue-600 font-medium flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {fines}</span>
                      <span className="text-red-500 font-medium flex items-center gap-1"><Ban className="h-3 w-3" /> {vetos}</span>
                    </div>

                    {/* Vote buttons */}
                    <div className="flex gap-2">
                      {[
                        { vote: "love" as const, icon: Heart, label: "Love", active: "bg-pink-100 text-pink-700 border-pink-300" },
                        { vote: "fine" as const, icon: ThumbsUp, label: "Fine", active: "bg-blue-100 text-blue-700 border-blue-300" },
                        { vote: "veto" as const, icon: Ban, label: "Veto", active: "bg-red-100 text-red-600 border-red-300" },
                      ].map(btn => (
                        <Button
                          key={btn.vote}
                          variant="outline"
                          size="sm"
                          className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`}
                          onClick={() => handleVote(acc.id, btn.vote)}
                          disabled={voteMutation.isPending}
                        >
                          <btn.icon className="h-3.5 w-3.5 mr-1" />
                          {btn.label}
                        </Button>
                      ))}
                    </div>

                    {isOrganizer && !acc.selected && (
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-primary text-xs" onClick={() => handleSelect(acc.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Select this accommodation
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Home className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No accommodations yet. Add the first option!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
