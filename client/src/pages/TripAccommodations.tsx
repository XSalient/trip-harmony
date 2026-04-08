import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import AppShell from "@/components/AppShell";
import ProposalComments from "@/components/ProposalComments";
import { useParams } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Home, Plus, Heart, ThumbsUp, Ban, CheckCircle2, Bed, Bath,
  DollarSign, ExternalLink, Star, Trash2, Sparkles, Link2, Unlock, Car, Loader2,
  MoreVertical, Pencil, Copy, HelpCircle, MessageCircle, Brain, ChevronDown, ChevronUp,
  AlertTriangle, Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type FormState = {
  name: string;
  description: string;
  imageUrl: string;
  pricePerNight: string;
  totalPrice: string;
  bedrooms: string;
  bathrooms: string;
  singleBeds: string;
  doubleBeds: string;
  toilets: string;
  ensuites: string;
  freeParking: boolean;
  camperParking: boolean;
  location: string;
  link: string;
  amenities: string;
};

const emptyForm: FormState = {
  name: "", description: "", imageUrl: "", pricePerNight: "", totalPrice: "",
  bedrooms: "", bathrooms: "", singleBeds: "", doubleBeds: "",
  toilets: "", ensuites: "", freeParking: false, camperParking: false,
  location: "", link: "", amenities: "",
};

export default function TripAccommodations() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: accommodations, isLoading } = trpc.accommodations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: commentCounts = {} } = trpc.comments.countsByTrip.useQuery({ tripId }, { enabled: tripId > 0 });
  const createMutation = trpc.accommodations.create.useMutation();
  const voteMutation = trpc.accommodations.vote.useMutation();
  const unvoteMutation = trpc.accommodations.unvote.useMutation();
  const selectMutation = trpc.accommodations.select.useMutation();
  const deselectMutation = trpc.accommodations.deselect.useMutation();
  const deleteMutation = trpc.accommodations.delete.useMutation();
  const editMutation = trpc.accommodations.edit.useMutation();
  const cloneMutation = trpc.accommodations.clone.useMutation();
  const fetchFromUrlMutation = trpc.accommodations.fetchFromUrl.useMutation();
  const parseAttributesMutation = trpc.accommodations.parseAttributes.useMutation();
  const analyzeMatchMutation = trpc.accommodations.analyzeMatch.useMutation();
  const utils = trpc.useUtils();

  const [matchResults, setMatchResults] = useState<Record<number, any>>({});
  const [matchLoading, setMatchLoading] = useState<Record<number, boolean>>({});
  const [matchExpanded, setMatchExpanded] = useState<Record<number, boolean>>({});

  const handleAnalyzeMatch = async (accId: number) => {
    setMatchLoading(prev => ({ ...prev, [accId]: true }));
    setMatchExpanded(prev => ({ ...prev, [accId]: true }));
    try {
      const result = await analyzeMatchMutation.mutateAsync({ accommodationId: accId, tripId });
      setMatchResults(prev => ({ ...prev, [accId]: result }));
    } catch {
      toast.error("AI analysis failed — try again");
    } finally {
      setMatchLoading(prev => ({ ...prev, [accId]: false }));
    }
  };

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [urlInput, setUrlInput] = useState("");
  const [urlFetching, setUrlFetching] = useState(false);
  const [nlPrefsText, setNlPrefsText] = useState("");
  const [nlParsing, setNlParsing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", location: "", link: "", pricePerNight: "" });

  const isOrganizer = trip?.organizerId === user?.id;
  const selectedAccommodation = useMemo(() => accommodations?.find((a: any) => a.selected), [accommodations]);

  const updateForm = (key: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setForm(emptyForm);
    setUrlInput("");
    setNlPrefsText("");
  };

  const openEdit = (acc: any) => {
    setEditingId(acc.id);
    setEditForm({
      name: acc.name || "",
      description: acc.description || "",
      location: acc.location || "",
      link: acc.link || "",
      pricePerNight: acc.pricePerNight ? String(parseFloat(acc.pricePerNight)) : "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingId) return;
    try {
      await editMutation.mutateAsync({
        id: editingId,
        name: editForm.name || undefined,
        description: editForm.description || undefined,
        location: editForm.location || undefined,
        link: editForm.link || undefined,
        pricePerNight: editForm.pricePerNight || undefined,
      });
      utils.accommodations.list.invalidate({ tripId });
      setEditOpen(false);
      toast.success("Accommodation updated");
    } catch { toast.error("Failed to update"); }
  };

  const handleCloneIntoForm = (acc: any) => {
    setForm({
      name: acc.name || "",
      description: acc.description || "",
      imageUrl: acc.imageUrl || "",
      pricePerNight: acc.pricePerNight ? String(parseFloat(acc.pricePerNight)) : "",
      totalPrice: acc.totalPrice ? String(parseFloat(acc.totalPrice)) : "",
      bedrooms: acc.bedrooms ? String(acc.bedrooms) : "",
      bathrooms: acc.bathrooms ? String(acc.bathrooms) : "",
      singleBeds: acc.singleBeds ? String(acc.singleBeds) : "",
      doubleBeds: acc.doubleBeds ? String(acc.doubleBeds) : "",
      toilets: acc.toilets ? String(acc.toilets) : "",
      ensuites: acc.ensuites ? String(acc.ensuites) : "",
      freeParking: acc.freeParking || false,
      camperParking: acc.camperParking || false,
      location: acc.location || "",
      link: acc.link || "",
      amenities: acc.amenities || "",
    });
    setUrlInput(acc.link || "");
    setAddOpen(true);
  };

  const handleFetchFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlFetching(true);
    try {
      const result = await fetchFromUrlMutation.mutateAsync({ url: urlInput.trim() });
      if (result.success && result.data) {
        const d = result.data as any;
        setForm(prev => ({
          ...prev,
          name: d.name || prev.name,
          description: d.description || prev.description,
          imageUrl: d.imageUrl || prev.imageUrl,
          location: d.location || prev.location,
          link: urlInput.trim(),
          pricePerNight: d.pricePerNight ? String(d.pricePerNight) : prev.pricePerNight,
          totalPrice: d.totalPrice ? String(d.totalPrice) : prev.totalPrice,
          bedrooms: d.bedrooms ? String(d.bedrooms) : prev.bedrooms,
          bathrooms: d.bathrooms ? String(d.bathrooms) : prev.bathrooms,
          singleBeds: d.singleBeds ? String(d.singleBeds) : prev.singleBeds,
          doubleBeds: d.doubleBeds ? String(d.doubleBeds) : prev.doubleBeds,
          freeParking: d.freeParking ?? prev.freeParking,
          amenities: d.amenities?.join(", ") || prev.amenities,
        }));
        toast.success("Details fetched from URL!");
      } else {
        toast.info("Could not extract details — please fill in manually");
      }
    } catch {
      toast.error("Failed to fetch URL");
    } finally {
      setUrlFetching(false);
    }
  };

  const handleParseNlPrefs = async () => {
    if (!nlPrefsText.trim()) return;
    setNlParsing(true);
    try {
      const result = await parseAttributesMutation.mutateAsync({ text: nlPrefsText });
      if (result.success && result.data) {
        const d = result.data as any;
        setForm(prev => ({
          ...prev,
          singleBeds: d.singleBeds ? String(d.singleBeds) : prev.singleBeds,
          doubleBeds: d.doubleBeds ? String(d.doubleBeds) : prev.doubleBeds,
          bedrooms: d.bedrooms ? String(d.bedrooms) : prev.bedrooms,
          bathrooms: d.bathrooms ? String(d.bathrooms) : prev.bathrooms,
          toilets: d.toilets ? String(d.toilets) : prev.toilets,
          ensuites: d.ensuites ? String(d.ensuites) : prev.ensuites,
          freeParking: d.freeParking ?? prev.freeParking,
          camperParking: d.camperParking ?? prev.camperParking,
          amenities: d.amenities?.length
            ? [...(prev.amenities ? prev.amenities.split(",").map((s: string) => s.trim()) : []), ...d.amenities]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .join(", ")
            : prev.amenities,
        }));
        toast.success("Preferences applied!");
      } else {
        toast.info("Could not parse preferences");
      }
    } catch {
      toast.error("Failed to parse preferences");
    } finally {
      setNlParsing(false);
    }
  };

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
        singleBeds: form.singleBeds ? parseInt(form.singleBeds) : undefined,
        doubleBeds: form.doubleBeds ? parseInt(form.doubleBeds) : undefined,
        toilets: form.toilets ? parseInt(form.toilets) : undefined,
        ensuites: form.ensuites ? parseInt(form.ensuites) : undefined,
        freeParking: form.freeParking || undefined,
        camperParking: form.camperParking || undefined,
        location: form.location.trim() || undefined,
        link: form.link.trim() || undefined,
        amenities: form.amenities.trim() || undefined,
      });
      utils.accommodations.list.invalidate({ tripId });
      setAddOpen(false);
      resetForm();
      toast.success("Accommodation added!");
    } catch (e: any) { toast.error(e?.message || "Failed to add"); }
  };

  const handleVote = (accommodationId: number, vote: "love" | "fine" | "veto") => {
    const currentVote = accommodations?.find((a: any) => a.id === accommodationId)?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.accommodations.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((a: any) => {
        if (a.id !== accommodationId) return a;
        const filtered = a.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return { ...a, votes: isUnvote ? filtered : [...filtered, { userId: user?.id, vote, user: { id: user?.id, name: user?.name } }] };
      });
    });
    const onError = () => { utils.accommodations.list.invalidate({ tripId }); toast.error("Failed to vote"); };
    const onSuccess = () => { utils.accommodations.list.invalidate({ tripId }); };
    if (isUnvote) {
      unvoteMutation.mutate({ accommodationId }, { onError, onSuccess });
    } else {
      voteMutation.mutate({ accommodationId, vote }, { onError, onSuccess });
    }
  };

  const handleSelect = async (accommodationId: number) => {
    try {
      await selectMutation.mutateAsync({ tripId, accommodationId });
      utils.accommodations.list.invalidate({ tripId });
      toast.success("Accommodation selected!");
    } catch { toast.error("Failed to select"); }
  };

  const handleDeselect = async () => {
    try {
      await deselectMutation.mutateAsync({ tripId });
      utils.accommodations.list.invalidate({ tripId });
      toast.success("Selection unlocked");
    } catch { toast.error("Failed to unlock"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.accommodations.list.invalidate({ tripId });
      toast.success("Proposal deleted");
    } catch (e: any) {
      toast.error(e?.message?.includes("Not authorized") ? "You can only delete your own proposals" : "Failed to delete");
    }
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
          <div>
            <p className="text-sm text-muted-foreground">Compare stays and vote on your favorites</p>
            {selectedAccommodation && (
              <p className="text-xs text-primary font-medium mt-0.5">{selectedAccommodation.name} selected</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOrganizer && selectedAccommodation && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg gap-1 text-xs h-8"
                onClick={handleDeselect}
                disabled={deselectMutation.isPending}
              >
                <Unlock className="h-3.5 w-3.5" /> Unlock
              </Button>
            )}
            <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-lg gap-1"><Plus className="h-4 w-4" /> Add</Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add Accommodation</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">

                  {/* URL auto-fill */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Listing URL (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://airbnb.com/rooms/..."
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        className="rounded-lg flex-1 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg shrink-0"
                        onClick={handleFetchFromUrl}
                        disabled={!urlInput.trim() || urlFetching}
                      >
                        {urlFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Paste a booking URL and we'll try to fill in the details automatically</p>
                  </div>

                  <div className="border-t pt-3 space-y-3">
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

                    {/* Pricing */}
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

                    {/* Rooms */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Rooms</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Single/Twin Beds</Label>
                          <Input type="number" placeholder="0" value={form.singleBeds} onChange={e => updateForm("singleBeds", e.target.value)} className="rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Double/Queen Beds</Label>
                          <Input type="number" placeholder="0" value={form.doubleBeds} onChange={e => updateForm("doubleBeds", e.target.value)} className="rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Bedrooms total</Label>
                          <Input type="number" placeholder="0" value={form.bedrooms} onChange={e => updateForm("bedrooms", e.target.value)} className="rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Full Bathrooms</Label>
                          <Input type="number" placeholder="0" value={form.bathrooms} onChange={e => updateForm("bathrooms", e.target.value)} className="rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Standalone Toilets</Label>
                          <Input type="number" placeholder="0" value={form.toilets} onChange={e => updateForm("toilets", e.target.value)} className="rounded-lg" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Ensuites</Label>
                          <Input type="number" placeholder="0" value={form.ensuites} onChange={e => updateForm("ensuites", e.target.value)} className="rounded-lg" />
                        </div>
                      </div>
                    </div>

                    {/* Parking */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Parking</p>
                      <div className="flex items-center justify-between py-1">
                        <Label className="text-sm font-normal flex items-center gap-2"><Car className="h-4 w-4" /> Free Parking</Label>
                        <Switch checked={form.freeParking} onCheckedChange={v => updateForm("freeParking", v)} />
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <Label className="text-sm font-normal flex items-center gap-2"><Car className="h-4 w-4" /> Camper/RV Parking</Label>
                        <Switch checked={form.camperParking} onCheckedChange={v => updateForm("camperParking", v)} />
                      </div>
                    </div>

                    {/* Location & Link */}
                    <div className="space-y-1.5">
                      <Label>Location</Label>
                      <Input placeholder="Address or area" value={form.location} onChange={e => updateForm("location", e.target.value)} className="rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Booking Link</Label>
                      <Input placeholder="https://..." value={form.link} onChange={e => updateForm("link", e.target.value)} className="rounded-lg" />
                    </div>

                    {/* Amenities */}
                    <div className="space-y-1.5">
                      <Label>Amenities (comma separated)</Label>
                      <Input placeholder="WiFi, Pool, Kitchen..." value={form.amenities} onChange={e => updateForm("amenities", e.target.value)} className="rounded-lg" />
                    </div>

                    {/* Natural language preferences */}
                    <div className="space-y-2 border-t pt-3">
                      <Label className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Describe preferences in plain language</Label>
                      <Textarea
                        placeholder="e.g., 2 single beds and 1 double bed, 2 separate toilets, ensuite master bedroom, microwave, free parking"
                        value={nlPrefsText}
                        onChange={e => setNlPrefsText(e.target.value)}
                        rows={3}
                        className="rounded-lg resize-none text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-lg gap-2"
                        onClick={handleParseNlPrefs}
                        disabled={!nlPrefsText.trim() || nlParsing}
                      >
                        {nlParsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {nlParsing ? "Parsing..." : "Apply Preferences"}
                      </Button>
                      <p className="text-[11px] text-muted-foreground">AI will map your description to the form fields above</p>
                    </div>
                  </div>

                  <Button onClick={handleCreate} className="w-full rounded-lg" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Adding..." : "Add Accommodation"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
              const isOwner = acc.proposedBy === user?.id;
              const canManage = isOwner || isOrganizer;
              const commentCount = (commentCounts as any)[`accommodation_${acc.id}`] || 0;

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
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {commentCount > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <MessageCircle className="h-3.5 w-3.5" />{commentCount}
                          </span>
                        )}
                        <span className={`text-lg font-bold ${score > 0 ? "text-green-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {score > 0 ? "+" : ""}{score}
                        </span>
                        {acc.selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        {canManage && !acc.selected && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-sm">
                              <DropdownMenuItem onClick={() => openEdit(acc)} className="gap-2">
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCloneIntoForm(acc)} className="gap-2">
                                <Copy className="h-3.5 w-3.5" /> Clone & Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(acc.id)} disabled={deleteMutation.isPending} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    {acc.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{acc.description}</p>}

                    {/* Room stats */}
                    <div className="flex flex-wrap gap-3 mb-3 text-xs">
                      {acc.singleBeds > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bed className="h-3.5 w-3.5" /> {acc.singleBeds} single</span>
                      )}
                      {acc.doubleBeds > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bed className="h-3.5 w-3.5" /> {acc.doubleBeds} double</span>
                      )}
                      {!acc.singleBeds && !acc.doubleBeds && acc.bedrooms > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bed className="h-3.5 w-3.5" /> {acc.bedrooms} bed</span>
                      )}
                      {acc.bathrooms > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bath className="h-3.5 w-3.5" /> {acc.bathrooms} bath</span>
                      )}
                      {acc.toilets > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bath className="h-3.5 w-3.5" /> {acc.toilets} WC</span>
                      )}
                      {acc.ensuites > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground"><Bath className="h-3.5 w-3.5" /> {acc.ensuites} ensuite</span>
                      )}
                      {acc.freeParking && (
                        <span className="flex items-center gap-1 text-green-600"><Car className="h-3.5 w-3.5" /> Free parking</span>
                      )}
                      {acc.camperParking && (
                        <span className="flex items-center gap-1 text-blue-600"><Car className="h-3.5 w-3.5" /> Camper parking</span>
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

                    {/* AI Match Analysis */}
                    {(() => {
                      const match = matchResults[acc.id];
                      const loading = matchLoading[acc.id];
                      const expanded = matchExpanded[acc.id];
                      return (
                        <div className="mb-3">
                          {match ? (
                            <div className="rounded-xl border border-border/60 overflow-hidden">
                              {/* Summary row */}
                              <button
                                className="w-full flex items-center justify-between p-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                onClick={() => setMatchExpanded(prev => ({ ...prev, [acc.id]: !prev[acc.id] }))}
                              >
                                <div className="flex items-center gap-2">
                                  <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="text-xs font-medium">AI Match</span>
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                    match.groupFitScore >= 70 ? "bg-green-100 text-green-700" :
                                    match.groupFitScore >= 45 ? "bg-yellow-100 text-yellow-700" :
                                    "bg-red-100 text-red-700"
                                  }`}>{match.groupFitScore}/100</span>
                                  <span className="text-xs text-yellow-600 flex items-center gap-0.5">
                                    <Star className="h-3 w-3" />{typeof match.comfortScore === 'number' ? match.comfortScore.toFixed(1) : match.comfortScore}
                                  </span>
                                  {match.resentmentRisk === "high" && (
                                    <span className="text-xs text-red-600 flex items-center gap-0.5">
                                      <AlertTriangle className="h-3 w-3" /> High risk
                                    </span>
                                  )}
                                </div>
                                {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                              {expanded && (
                                <div className="p-2.5 space-y-2">
                                  <p className="text-xs text-muted-foreground">{match.summary}</p>
                                  {match.flags?.length > 0 && (
                                    <div className="space-y-1">
                                      {match.flags.map((f: string, i: number) => (
                                        <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{f}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {match.memberMatches?.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-medium flex items-center gap-1"><Users className="h-3 w-3" /> Per-member breakdown</p>
                                      {match.memberMatches.map((m: any, i: number) => (
                                        <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg bg-muted/30">
                                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                            m.score >= 70 ? "bg-green-100 text-green-700" :
                                            m.score >= 45 ? "bg-yellow-100 text-yellow-700" :
                                            "bg-red-100 text-red-700"
                                          }`}>{m.score}</span>
                                          <div>
                                            <p className="text-xs font-medium">{m.name} <span className="font-normal text-muted-foreground">{m.verdict}</span></p>
                                            <p className="text-xs text-muted-foreground">{m.reason}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-xs h-7 text-muted-foreground"
                                    onClick={() => handleAnalyzeMatch(acc.id)}
                                    disabled={loading}
                                  >
                                    {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Brain className="h-3 w-3 mr-1" />}
                                    Re-analyze
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs h-8 border-dashed gap-1.5 text-muted-foreground hover:text-foreground"
                              onClick={() => handleAnalyzeMatch(acc.id)}
                              disabled={loading}
                            >
                              {loading ? (
                                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing preferences…</>
                              ) : (
                                <><Brain className="h-3.5 w-3.5" /> AI Match Analysis</>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Vote counts */}
                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-pink-600 font-medium flex items-center gap-1"><Heart className="h-3 w-3" /> {loves}</span>
                      <span className="text-blue-600 font-medium flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> {fines}</span>
                      <span className="text-red-500 font-medium flex items-center gap-1"><Ban className="h-3 w-3" /> {vetos}</span>
                    </div>

                    {/* Vote buttons */}
                    {!acc.selected && (
                      <div className="flex gap-2">
                        {[
                          { vote: "love" as const, icon: Heart, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                          { vote: "fine" as const, icon: HelpCircle, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                          { vote: "veto" as const, icon: Ban, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                        ].map(btn => (
                          <Button
                            key={btn.vote}
                            variant="outline"
                            size="sm"
                            className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`}
                            onClick={() => handleVote(acc.id, btn.vote)}
                          >
                            <btn.icon className="h-3.5 w-3.5 mr-1" />
                            {btn.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {isOrganizer && !acc.selected && (
                      <Button variant="ghost" size="sm" className="w-full mt-2 text-primary text-xs" onClick={() => handleSelect(acc.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Select this accommodation
                      </Button>
                    )}

                    <ProposalComments proposalType="accommodation" proposalId={acc.id} tripId={tripId} isOrganizer={isOrganizer} />
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
              <p className="text-xs text-muted-foreground mt-1">Paste a booking URL and let AI fill in the details.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Edit Accommodation</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2} className="rounded-lg mt-1 resize-none text-sm" />
            </div>
            <div>
              <Label className="text-xs">Location (optional)</Label>
              <Input value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Booking link (optional)</Label>
              <Input value={editForm.link} onChange={e => setEditForm(p => ({ ...p, link: e.target.value }))} placeholder="https://..." className="rounded-lg mt-1" />
            </div>
            <div>
              <Label className="text-xs">Price/night ({trip?.currency || "USD"}) (optional)</Label>
              <Input type="number" value={editForm.pricePerNight} onChange={e => setEditForm(p => ({ ...p, pricePerNight: e.target.value }))} className="rounded-lg mt-1" />
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
