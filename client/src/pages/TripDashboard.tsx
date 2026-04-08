import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useParams, Link } from "wouter";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import {
  Calendar, MapPin, Home as HomeIcon, DollarSign, Users,
  ChevronRight, CheckCircle2, Circle, Bot, Copy, UserPlus,
  Send, Plus, Lock, Check, HelpCircle, X, Sparkles, AlertCircle,
  MessageCircle, MoreVertical, Pencil, Trash2, ClipboardList,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format, differenceInDays } from "date-fns";

function QuickAddDates({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"natural" | "manual">("natural");
  const [nlText, setNlText] = useState("");
  const [nlProposals, setNlProposals] = useState<Array<{ startDate: string; endDate: string; label: string }>>([]);
  const [nlParsing, setNlParsing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");
  const parseNatural = trpc.dates.parseNatural.useMutation();
  const propose = trpc.dates.propose.useMutation();

  const handleParse = async () => {
    if (!nlText.trim()) return;
    setNlParsing(true);
    try {
      const result = await parseNatural.mutateAsync({ text: nlText, referenceYear: new Date().getFullYear() });
      if (result.proposals.length === 0) toast.error("Could not parse — try 'last 2 weekends in September 2026'");
      else setNlProposals(result.proposals);
    } catch { toast.error("Failed to parse"); }
    finally { setNlParsing(false); }
  };

  const handleAddNl = async (p: { startDate: string; endDate: string; label: string }) => {
    try {
      await propose.mutateAsync({ tripId, startDate: p.startDate, endDate: p.endDate, label: p.label });
      toast.success("Date added!"); onAdded();
    } catch { toast.error("Failed to add"); }
  };

  const handleAddAll = async () => {
    let added = 0;
    for (const p of nlProposals) {
      try { await propose.mutateAsync({ tripId, startDate: p.startDate, endDate: p.endDate, label: p.label }); added++; } catch {}
    }
    toast.success(`${added} dates added!`); setNlProposals([]); setNlText(""); setOpen(false); onAdded();
  };

  const handleManual = async () => {
    if (!startDate || !endDate) { toast.error("Both dates required"); return; }
    try {
      await propose.mutateAsync({ tripId, startDate, endDate, label: label || undefined });
      toast.success("Date added!"); setOpen(false); setStartDate(""); setEndDate(""); setLabel(""); onAdded();
    } catch { toast.error("Failed to add"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs rounded-lg shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Date Proposal</DialogTitle></DialogHeader>
        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-2">
          <button onClick={() => setTab("natural")} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${tab === "natural" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
            <span className="flex items-center justify-center gap-1"><Sparkles className="h-3 w-3" /> Smart</span>
          </button>
          <button onClick={() => setTab("manual")} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${tab === "manual" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>
            Manual
          </button>
        </div>
        {tab === "natural" ? (
          <div className="space-y-3">
            <Textarea
              placeholder="e.g. any of the last 2 weekends in September 2026"
              value={nlText}
              onChange={e => setNlText(e.target.value)}
              rows={3}
              className="rounded-lg resize-none text-sm"
            />
            <Button onClick={handleParse} variant="outline" className="w-full rounded-lg gap-2" disabled={nlParsing}>
              <Sparkles className="h-4 w-4" />{nlParsing ? "Parsing..." : "Parse Dates"}
            </Button>
            {nlProposals.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">{nlProposals.length} date{nlProposals.length > 1 ? "s" : ""} found:</p>
                {nlProposals.map((p, i) => {
                  const nights = differenceInDays(new Date(p.endDate), new Date(p.startDate));
                  return (
                    <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs">
                      <div>
                        <p className="font-medium">{p.label}</p>
                        <p className="text-muted-foreground">{format(new Date(p.startDate), "EEE, MMM d")} → {format(new Date(p.endDate), "EEE, MMM d, yyyy")} · {nights}n</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg px-2 shrink-0 ml-2" onClick={() => handleAddNl(p)} disabled={propose.isPending}>Add</Button>
                    </div>
                  );
                })}
                <Button onClick={handleAddAll} className="w-full rounded-lg" disabled={propose.isPending}>Add All {nlProposals.length}</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Label (optional)</Label>
              <Input placeholder="e.g. Spring Break" value={label} onChange={e => setLabel(e.target.value)} className="rounded-lg mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Start</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg mt-1" /></div>
              <div><Label className="text-xs">End</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg mt-1" /></div>
            </div>
            {startDate && endDate && new Date(endDate) > new Date(startDate) && (
              <p className="text-xs text-muted-foreground text-center">{differenceInDays(new Date(endDate), new Date(startDate))} nights</p>
            )}
            <Button onClick={handleManual} className="w-full rounded-lg" disabled={propose.isPending}>Propose Dates</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddDestination({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = trpc.destinations.create.useMutation();

  const handle = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    try {
      await create.mutateAsync({ tripId, name, description: description || undefined });
      toast.success("Destination added!"); setOpen(false); setName(""); setDescription(""); onAdded();
    } catch { toast.error("Failed to add"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs rounded-lg shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader><DialogTitle>Add Destination</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Destination name</Label>
            <Input placeholder="e.g. Barcelona, Spain" value={name} onChange={e => setName(e.target.value)} className="rounded-lg mt-1" />
          </div>
          <div>
            <Label className="text-xs">Why this place? (optional)</Label>
            <Textarea placeholder="Vibes, highlights, reasons..." value={description} onChange={e => setDescription(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" />
          </div>
          <Button onClick={handle} className="w-full rounded-lg" disabled={create.isPending}>Add Destination</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddStay({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [price, setPrice] = useState("");
  const create = trpc.accommodations.create.useMutation();

  const handle = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    try {
      await create.mutateAsync({ tripId, name, link: link || undefined, pricePerNight: price || undefined });
      toast.success("Stay added!"); setOpen(false); setName(""); setLink(""); setPrice(""); onAdded();
    } catch { toast.error("Failed to add"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs rounded-lg shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-4 rounded-2xl">
        <DialogHeader><DialogTitle>Add Accommodation</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">Name</Label>
            <Input placeholder="e.g. Airbnb Eixample" value={name} onChange={e => setName(e.target.value)} className="rounded-lg mt-1" />
          </div>
          <div>
            <Label className="text-xs">Listing link (optional)</Label>
            <Input placeholder="https://airbnb.com/..." value={link} onChange={e => setLink(e.target.value)} className="rounded-lg mt-1" />
          </div>
          <div>
            <Label className="text-xs">Price per night (optional)</Label>
            <Input placeholder="120" value={price} onChange={e => setPrice(e.target.value)} type="number" className="rounded-lg mt-1" />
          </div>
          <Button onClick={handle} className="w-full rounded-lg" disabled={create.isPending}>Add Stay</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({
  title, icon: Icon, href, locked, pendingCount, addSlot, children, emptyText,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  locked?: boolean;
  pendingCount?: number;
  addSlot: React.ReactNode;
  children?: React.ReactNode;
  emptyText: string;
}) {
  return (
    <Card className={`border ${locked ? "border-green-200 bg-green-50/40 dark:bg-green-950/10" : "border-border/50"}`}>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 px-3 pt-3 pb-2">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${locked ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"}`}>
            {locked ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{title}</span>
            {locked && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 px-1.5">Decided</Badge>}
            {!locked && pendingCount && pendingCount > 0 ? (
              <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 px-1.5">{pendingCount} to vote</Badge>
            ) : null}
          </div>
          {addSlot}
        </div>
        {children ? (
          <div className="px-3 pb-2 space-y-1.5">{children}</div>
        ) : (
          <p className="px-3 pb-3 text-xs text-muted-foreground">{emptyText}</p>
        )}
        <Link href={href}>
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer rounded-b-xl">
            <span>View all details</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function TripDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: trip, isLoading } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: budgetSummary } = trpc.budget.summary.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: destinations, refetch: refetchDest } = trpc.destinations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: accommodations, refetch: refetchAcc } = trpc.accommodations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: dateProposals, refetch: refetchDates } = trpc.dates.list.useQuery({ tripId }, { enabled: tripId > 0 });
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
  const createDestMutation = trpc.destinations.create.useMutation();
  const createAccMutation = trpc.accommodations.create.useMutation();
  const { data: commentCounts = {} } = trpc.comments.countsByTrip.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: myPrefs } = trpc.preferences.getMy.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: prefCount } = trpc.preferences.countForTrip.useQuery({ tripId }, { enabled: tripId > 0 });

  const isOrganizer = trip?.organizerId === user?.id;

  const [inviteOpen, setInviteOpen] = useState(false);

  const [cloneDateOpen, setCloneDateOpen] = useState(false);
  const [cloneDestOpen, setCloneDestOpen] = useState(false);
  const [cloneAccOpen, setCloneAccOpen] = useState(false);
  const [cloningDate, setCloningDate] = useState<any>(null);
  const [cloningDest, setCloningDest] = useState<any>(null);
  const [cloningAcc, setCloningAcc] = useState<any>(null);

  const [editDateOpen, setEditDateOpen] = useState(false);
  const [editDestOpen, setEditDestOpen] = useState(false);
  const [editAccOpen, setEditAccOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<any>(null);
  const [editingDest, setEditingDest] = useState<any>(null);
  const [editingAcc, setEditingAcc] = useState<any>(null);
  const [editDateLabel, setEditDateLabel] = useState("");
  const [editDateStart, setEditDateStart] = useState("");
  const [editDateEnd, setEditDateEnd] = useState("");
  const [editDestName, setEditDestName] = useState("");
  const [editDestDesc, setEditDestDesc] = useState("");
  const [editAccName, setEditAccName] = useState("");
  const [editAccPrice, setEditAccPrice] = useState("");

  const [cloneDateLabel, setCloneDateLabel] = useState("");
  const [cloneDateStart, setCloneDateStart] = useState("");
  const [cloneDateEnd, setCloneDateEnd] = useState("");
  const [cloneDestName, setCloneDestName] = useState("");
  const [cloneDestDesc, setCloneDestDesc] = useState("");
  const [cloneAccName, setCloneAccName] = useState("");
  const [cloneAccLink, setCloneAccLink] = useState("");
  const [cloneAccPrice, setCloneAccPrice] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const sendInviteEmail = trpc.trips.sendInviteEmail.useMutation();

  const utils = trpc.useUtils();

  const inviteUrl = useMemo(() => {
    if (!trip?.inviteCode) return "";
    return `${window.location.origin}/join/${trip.inviteCode}`;
  }, [trip?.inviteCode]);

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  if (isLoading) {
    return (
      <AppShell title="Trip" showBack backHref="/">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
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

  const acceptedMembers = members?.filter((m: any) => m.status === "accepted") || [];
  const memberCount = acceptedMembers.length || 1;

  const pendingVotes = {
    dates: dateProposals?.filter((d: any) => !d.selected && !d.votes?.some((v: any) => v.userId === user?.id)).length || 0,
    destinations: destinations?.filter((d: any) => !d.selected && !d.votes?.some((v: any) => v.userId === user?.id)).length || 0,
    accommodations: accommodations?.filter((a: any) => !a.selected && !a.votes?.some((v: any) => v.userId === user?.id)).length || 0,
  };
  const totalPending = pendingVotes.dates + pendingVotes.destinations + pendingVotes.accommodations;

  const lockedDate = dateProposals?.find((d: any) => d.selected);
  const lockedDest = destinations?.find((d: any) => d.selected);
  const lockedAcc = accommodations?.find((a: any) => a.selected);

  const handleDateVote = (proposalId: number, vote: "available" | "maybe" | "unavailable") => {
    const currentVote = dateProposals?.find((p: any) => p.id === proposalId)?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.dates.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((p: any) => {
        if (p.id !== proposalId) return p;
        const filtered = p.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return { ...p, votes: isUnvote ? filtered : [...filtered, { userId: user?.id, vote }] };
      });
    });
    if (isUnvote) {
      unvoteDateMutation.mutate({ proposalId }, { onError: () => refetchDates(), onSuccess: () => refetchDates() });
    } else {
      voteDateMutation.mutate({ proposalId, vote }, { onError: () => { toast.error("Vote failed"); refetchDates(); }, onSuccess: () => refetchDates() });
    }
  };

  const handleDestVote = (destinationId: number, vote: "love" | "fine" | "veto") => {
    const currentVote = destinations?.find((d: any) => d.id === destinationId)?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.destinations.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((d: any) => {
        if (d.id !== destinationId) return d;
        const filtered = d.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return { ...d, votes: isUnvote ? filtered : [...filtered, { userId: user?.id, vote }] };
      });
    });
    if (isUnvote) {
      unvoteDestMutation.mutate({ destinationId }, { onError: () => refetchDest(), onSuccess: () => refetchDest() });
    } else {
      voteDestMutation.mutate({ destinationId, vote }, { onError: () => { toast.error("Vote failed"); refetchDest(); }, onSuccess: () => refetchDest() });
    }
  };

  const handleAccVote = (accommodationId: number, vote: "love" | "fine" | "veto") => {
    const currentVote = accommodations?.find((a: any) => a.id === accommodationId)?.votes?.find((v: any) => v.userId === user?.id)?.vote;
    const isUnvote = currentVote === vote;
    utils.accommodations.list.setData({ tripId }, (old: any) => {
      if (!old) return old;
      return old.map((a: any) => {
        if (a.id !== accommodationId) return a;
        const filtered = a.votes?.filter((v: any) => v.userId !== user?.id) || [];
        return { ...a, votes: isUnvote ? filtered : [...filtered, { userId: user?.id, vote }] };
      });
    });
    if (isUnvote) {
      unvoteAccMutation.mutate({ accommodationId }, { onError: () => refetchAcc(), onSuccess: () => refetchAcc() });
    } else {
      voteAccMutation.mutate({ accommodationId, vote }, { onError: () => { toast.error("Vote failed"); refetchAcc(); }, onSuccess: () => refetchAcc() });
    }
  };

  const openEditDate = (p: any) => {
    setEditingDate(p);
    setEditDateLabel(p.label || "");
    setEditDateStart(format(new Date(p.startDate), "yyyy-MM-dd"));
    setEditDateEnd(format(new Date(p.endDate), "yyyy-MM-dd"));
    setEditDateOpen(true);
  };
  const openEditDest = (d: any) => {
    setEditingDest(d);
    setEditDestName(d.name || "");
    setEditDestDesc(d.description || "");
    setEditDestOpen(true);
  };
  const openEditAcc = (a: any) => {
    setEditingAcc(a);
    setEditAccName(a.name || "");
    setEditAccPrice(a.pricePerNight ? String(parseFloat(a.pricePerNight)) : "");
    setEditAccOpen(true);
  };

  const openCloneDate = (p: any) => {
    setCloningDate(p);
    setCloneDateLabel(p.label || "");
    setCloneDateStart(format(new Date(p.startDate), "yyyy-MM-dd"));
    setCloneDateEnd(format(new Date(p.endDate), "yyyy-MM-dd"));
    setCloneDateOpen(true);
  };
  const openCloneDest = (d: any) => {
    setCloningDest(d);
    setCloneDestName((d.name || "") + " (copy)");
    setCloneDestDesc(d.description || "");
    setCloneDestOpen(true);
  };
  const openCloneAcc = (a: any) => {
    setCloningAcc(a);
    setCloneAccName(a.name || "");
    setCloneAccLink(a.link || "");
    setCloneAccPrice(a.pricePerNight ? String(parseFloat(a.pricePerNight)) : "");
    setCloneAccOpen(true);
  };

  const handleDeleteDate = async (id: number) => {
    try { await deleteDateMutation.mutateAsync({ id }); refetchDates(); toast.success("Removed"); }
    catch (e: any) { toast.error(e?.message || "Failed to delete"); }
  };
  const handleDeleteDest = async (id: number) => {
    try { await deleteDestMutation.mutateAsync({ id }); refetchDest(); toast.success("Removed"); }
    catch (e: any) { toast.error(e?.message || "Failed to delete"); }
  };
  const handleDeleteAcc = async (id: number) => {
    try { await deleteAccMutation.mutateAsync({ id }); refetchAcc(); toast.success("Removed"); }
    catch (e: any) { toast.error(e?.message || "Failed to delete"); }
  };

  const handleSaveEditDate = async () => {
    if (!editingDate) return;
    try {
      await editDateMutation.mutateAsync({ id: editingDate.id, label: editDateLabel || undefined, startDate: editDateStart || undefined, endDate: editDateEnd || undefined });
      refetchDates(); setEditDateOpen(false); toast.success("Updated");
    } catch { toast.error("Failed to update"); }
  };
  const handleSaveEditDest = async () => {
    if (!editingDest) return;
    try {
      await editDestMutation.mutateAsync({ id: editingDest.id, name: editDestName || undefined, description: editDestDesc || undefined });
      refetchDest(); setEditDestOpen(false); toast.success("Updated");
    } catch { toast.error("Failed to update"); }
  };
  const handleSaveEditAcc = async () => {
    if (!editingAcc) return;
    try {
      await editAccMutation.mutateAsync({ id: editingAcc.id, name: editAccName || undefined, pricePerNight: editAccPrice || undefined });
      refetchAcc(); setEditAccOpen(false); toast.success("Updated");
    } catch { toast.error("Failed to update"); }
  };

  const handleSaveCloneDate = async () => {
    if (!cloneDateStart || !cloneDateEnd) { toast.error("Both dates are required"); return; }
    try {
      await proposeDateMutation.mutateAsync({ tripId, startDate: cloneDateStart, endDate: cloneDateEnd, label: cloneDateLabel || undefined });
      refetchDates(); setCloneDateOpen(false); toast.success("Cloned!");
    } catch (e: any) { toast.error(e?.message || "Failed to clone"); }
  };
  const handleSaveCloneDest = async () => {
    if (!cloneDestName.trim()) { toast.error("Name is required"); return; }
    try {
      await createDestMutation.mutateAsync({ tripId, name: cloneDestName, description: cloneDestDesc || undefined });
      refetchDest(); setCloneDestOpen(false); toast.success("Cloned!");
    } catch (e: any) { toast.error(e?.message || "Failed to clone"); }
  };
  const handleSaveCloneAcc = async () => {
    if (!cloneAccName.trim()) { toast.error("Name is required"); return; }
    try {
      await createAccMutation.mutateAsync({ tripId, name: cloneAccName, link: cloneAccLink || undefined, pricePerNight: cloneAccPrice || undefined });
      refetchAcc(); setCloneAccOpen(false); toast.success("Cloned!");
    } catch (e: any) { toast.error(e?.message || "Failed to clone"); }
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
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <UserPlus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm mx-4 rounded-2xl">
            <DialogHeader>
              <DialogTitle>Invite Members</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Share this link with your group:</p>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all">{inviteUrl}</code>
                  <Button variant="outline" size="icon" onClick={copyInvite}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or send via email</span></div>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  disabled={!inviteEmail || sendInviteEmail.isPending}
                  onClick={async () => {
                    try {
                      await sendInviteEmail.mutateAsync({ tripId, email: inviteEmail });
                      toast.success(`Invite sent to ${inviteEmail}`);
                      setInviteEmail("");
                    } catch { toast.error("Failed to send invite"); }
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="px-4 py-4 space-y-4">

        {/* Members + decisions row */}
        <Card className="border-border/50">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex -space-x-2">
              {acceptedMembers.slice(0, 6).map((m: any) => (
                <div
                  key={m.id}
                  className="h-8 w-8 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center text-xs font-semibold text-primary"
                  title={m.user?.name || "Member"}
                >
                  {(m.user?.name || "?")[0].toUpperCase()}
                </div>
              ))}
              {acceptedMembers.length > 6 && (
                <div className="h-8 w-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{acceptedMembers.length - 6}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{acceptedMembers.length} member{acceptedMembers.length !== 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">
                {[lockedDate && "dates", lockedDest && "destination", lockedAcc && "stay"].filter(Boolean).join(", ") || "Planning in progress"}
                {[lockedDate, lockedDest, lockedAcc].filter(Boolean).length > 0 ? " decided" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {[lockedDate, lockedDest, lockedAcc].map((locked, i) => (
                <div key={i} className={`h-2 w-2 rounded-full ${locked ? "bg-green-500" : "bg-muted-foreground/30"}`} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending votes alert */}
        {totalPending > 0 && (
          <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                  You have {totalPending} unvoted proposal{totalPending > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Scroll down to vote in each section</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trip Preferences CTA */}
        <Link href={`/trips/${tripId}/preferences`}>
          <Card className={`cursor-pointer transition-shadow hover:shadow-sm ${!myPrefs ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${myPrefs ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-primary/10 text-primary"}`}>
                {myPrefs ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {myPrefs ? "My Trip Preferences" : "Add My Trip Preferences"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {myPrefs
                    ? `Your preferences saved · ${prefCount?.count || 0}/${memberCount} members submitted`
                    : "Set must-haves & dealbreakers — AI uses these to score proposals for you"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* Budget snapshot */}
        {budgetSummary && budgetSummary.total > 0 && (
          <Link href={`/trips/${tripId}/budget`}>
            <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Budget</p>
                  <p className="text-xs text-muted-foreground">
                    {trip.currency} {budgetSummary.total.toFixed(0)} total · ~{trip.currency} {budgetSummary.perPerson.toFixed(0)} per person
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        )}

        {/* ── Dates ── */}
        <SectionCard
          title="Dates"
          icon={Calendar}
          href={`/trips/${tripId}/dates`}
          locked={!!lockedDate}
          pendingCount={pendingVotes.dates}
          addSlot={<QuickAddDates tripId={tripId} onAdded={() => refetchDates()} />}
          emptyText="No dates proposed yet — add the first one above!"
        >
          {topDates.length > 0 ? topDates.map((p: any) => {
            const myVote = p.votes?.find((v: any) => v.userId === user?.id)?.vote;
            const available = p.votes?.filter((v: any) => v.vote === "available").length || 0;
            const maybe = p.votes?.filter((v: any) => v.vote === "maybe").length || 0;
            const unavailable = p.votes?.filter((v: any) => v.vote === "unavailable").length || 0;
            const nights = differenceInDays(new Date(p.endDate), new Date(p.startDate));
            const commentCount = (commentCounts as any)[`date_${p.id}`] || 0;
            const canManage = p.proposedBy === user?.id || isOrganizer;
            return (
              <div key={p.id} className={`rounded-lg border p-2.5 text-xs ${p.selected ? "border-green-300 bg-green-50/60 dark:bg-green-950/20" : "border-border/40 bg-background"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    {p.label && <span className="font-medium mr-1">{p.label} · </span>}
                    <span className="text-muted-foreground">{format(new Date(p.startDate), "MMM d")} – {format(new Date(p.endDate), "MMM d, yyyy")} · {nights}n</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {p.selected && <Lock className="h-3.5 w-3.5 text-green-600" />}
                    {commentCount > 0 && <span className="flex items-center gap-0.5 text-muted-foreground"><MessageCircle className="h-3 w-3" />{commentCount}</span>}
                    {canManage && !p.selected && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => openEditDate(p)} className="gap-2 text-xs"><Pencil className="h-3 w-3" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCloneDate(p)} className="gap-2 text-xs"><Copy className="h-3 w-3" /> Clone & Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteDate(p.id)} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-green-600">{available}✓</span>
                  <span className="text-yellow-600">{maybe}?</span>
                  <span className="text-red-500">{unavailable}✗</span>
                  <span className="text-muted-foreground ml-auto">{p.votes?.length || 0}/{memberCount} voted</span>
                </div>
                {!p.selected && (
                  <div className="flex gap-1.5">
                    {([
                      { vote: "available" as const, icon: Check, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                      { vote: "maybe" as const, icon: HelpCircle, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                      { vote: "unavailable" as const, icon: X, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                    ] as const).map(btn => (
                      <button
                        key={btn.vote}
                        onClick={() => handleDateVote(p.id, btn.vote)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1 rounded border text-[11px] transition-colors ${myVote === btn.vote ? btn.active : "border-border/60 text-muted-foreground hover:border-border"}`}
                      >
                        <btn.icon className="h-3 w-3" />{btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }) : null}
        </SectionCard>

        {/* ── Destinations ── */}
        <SectionCard
          title="Destinations"
          icon={MapPin}
          href={`/trips/${tripId}/destinations`}
          locked={!!lockedDest}
          pendingCount={pendingVotes.destinations}
          addSlot={<QuickAddDestination tripId={tripId} onAdded={() => refetchDest()} />}
          emptyText="No destinations yet — suggest the first one!"
        >
          {topDests.length > 0 ? topDests.map((d: any) => {
            const myVote = d.votes?.find((v: any) => v.userId === user?.id)?.vote;
            const loves = d.votes?.filter((v: any) => v.vote === "love").length || 0;
            const fines = d.votes?.filter((v: any) => v.vote === "fine").length || 0;
            const vetos = d.votes?.filter((v: any) => v.vote === "veto").length || 0;
            const commentCount = (commentCounts as any)[`destination_${d.id}`] || 0;
            const canManage = d.proposedBy === user?.id || isOrganizer;
            return (
              <div key={d.id} className={`rounded-lg border p-2.5 text-xs ${d.selected ? "border-green-300 bg-green-50/60 dark:bg-green-950/20" : "border-border/40 bg-background"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium truncate flex-1">{d.name}</span>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {d.selected && <Lock className="h-3.5 w-3.5 text-green-600" />}
                    {commentCount > 0 && <span className="flex items-center gap-0.5 text-muted-foreground"><MessageCircle className="h-3 w-3" />{commentCount}</span>}
                    {canManage && !d.selected && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => openEditDest(d)} className="gap-2 text-xs"><Pencil className="h-3 w-3" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCloneDest(d)} className="gap-2 text-xs"><Copy className="h-3 w-3" /> Clone & Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteDest(d.id)} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-pink-600">{loves}❤</span>
                  <span className="text-blue-600">{fines}✓</span>
                  <span className="text-red-500">{vetos}✗</span>
                  <span className="text-muted-foreground ml-auto">{d.votes?.length || 0}/{memberCount} voted</span>
                </div>
                {!d.selected && (
                  <div className="flex gap-1.5">
                    {([
                      { vote: "love" as const, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                      { vote: "fine" as const, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                      { vote: "veto" as const, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                    ] as const).map(btn => (
                      <button
                        key={btn.vote}
                        onClick={() => handleDestVote(d.id, btn.vote)}
                        className={`flex-1 py-1 rounded border text-[11px] transition-colors ${myVote === btn.vote ? btn.active : "border-border/60 text-muted-foreground hover:border-border"}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }) : null}
        </SectionCard>

        {/* ── Accommodations ── */}
        <SectionCard
          title="Stays"
          icon={HomeIcon}
          href={`/trips/${tripId}/accommodations`}
          locked={!!lockedAcc}
          pendingCount={pendingVotes.accommodations}
          addSlot={<QuickAddStay tripId={tripId} onAdded={() => refetchAcc()} />}
          emptyText="No stays suggested yet — add an option!"
        >
          {topAccs.length > 0 ? topAccs.map((a: any) => {
            const myVote = a.votes?.find((v: any) => v.userId === user?.id)?.vote;
            const loves = a.votes?.filter((v: any) => v.vote === "love").length || 0;
            const fines = a.votes?.filter((v: any) => v.vote === "fine").length || 0;
            const vetos = a.votes?.filter((v: any) => v.vote === "veto").length || 0;
            const commentCount = (commentCounts as any)[`accommodation_${a.id}`] || 0;
            const canManage = a.proposedBy === user?.id || isOrganizer;
            return (
              <div key={a.id} className={`rounded-lg border p-2.5 text-xs ${a.selected ? "border-green-300 bg-green-50/60 dark:bg-green-950/20" : "border-border/40 bg-background"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{a.name}</span>
                    {a.pricePerNight && <span className="text-muted-foreground">{trip.currency}{a.pricePerNight}/night</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {a.selected && <Lock className="h-3.5 w-3.5 text-green-600" />}
                    {commentCount > 0 && <span className="flex items-center gap-0.5 text-muted-foreground"><MessageCircle className="h-3 w-3" />{commentCount}</span>}
                    {canManage && !a.selected && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><MoreVertical className="h-3.5 w-3.5" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem onClick={() => openEditAcc(a)} className="gap-2 text-xs"><Pencil className="h-3 w-3" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCloneAcc(a)} className="gap-2 text-xs"><Copy className="h-3 w-3" /> Clone & Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteAcc(a.id)} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="h-3 w-3" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-pink-600">{loves}❤</span>
                  <span className="text-blue-600">{fines}✓</span>
                  <span className="text-red-500">{vetos}✗</span>
                  <span className="text-muted-foreground ml-auto">{a.votes?.length || 0}/{memberCount} voted</span>
                </div>
                {!a.selected && (
                  <div className="flex gap-1.5">
                    {([
                      { vote: "love" as const, label: "Yes", active: "bg-green-100 text-green-700 border-green-300" },
                      { vote: "fine" as const, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                      { vote: "veto" as const, label: "No", active: "bg-red-100 text-red-600 border-red-300" },
                    ] as const).map(btn => (
                      <button
                        key={btn.vote}
                        onClick={() => handleAccVote(a.id, btn.vote)}
                        className={`flex-1 py-1 rounded border text-[11px] transition-colors ${myVote === btn.vote ? btn.active : "border-border/60 text-muted-foreground hover:border-border"}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }) : null}
        </SectionCard>

        {/* ── Budget (no proposals needed, just a link) ── */}
        {(!budgetSummary || budgetSummary.total === 0) && (
          <Link href={`/trips/${tripId}/budget`}>
            <Card className="border-dashed border-border/50 cursor-pointer hover:bg-muted/20 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Budget</p>
                  <p className="text-xs text-muted-foreground">Track expenses and set limits</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        )}

        {/* ── Vibe Board ── */}
        <Link href={`/trips/${tripId}/vibe`}>
          <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-pink-100 dark:bg-pink-900/30 text-pink-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Vibe Board</p>
                <p className="text-xs text-muted-foreground">Share inspiration — links, photos, ideas</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* ── Itinerary ── */}
        <Link href={`/trips/${tripId}/itinerary`}>
          <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Itinerary</p>
                <p className="text-xs text-muted-foreground">Plan your days with activities & logistics</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

        {/* ── AI Referee ── */}
        <Link href={`/trips/${tripId}/referee`}>
          <Card className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">AI Referee</p>
                <p className="text-xs text-muted-foreground">Get mediation &amp; suggestions</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
        </Link>

      </div>

      {/* ── Edit Dialogs ── */}
      <Dialog open={editDateOpen} onOpenChange={setEditDateOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Edit Date Proposal</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Label (optional)</Label><Input value={editDateLabel} onChange={e => setEditDateLabel(e.target.value)} className="rounded-lg mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Start</Label><Input type="date" value={editDateStart} onChange={e => setEditDateStart(e.target.value)} className="rounded-lg mt-1" /></div>
              <div><Label className="text-xs">End</Label><Input type="date" value={editDateEnd} onChange={e => setEditDateEnd(e.target.value)} className="rounded-lg mt-1" /></div>
            </div>
            <Button onClick={handleSaveEditDate} className="w-full rounded-lg" disabled={editDateMutation.isPending}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDestOpen} onOpenChange={setEditDestOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Edit Destination</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Name</Label><Input value={editDestName} onChange={e => setEditDestName(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Description (optional)</Label><Textarea value={editDestDesc} onChange={e => setEditDestDesc(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" /></div>
            <Button onClick={handleSaveEditDest} className="w-full rounded-lg" disabled={editDestMutation.isPending}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editAccOpen} onOpenChange={setEditAccOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Edit Accommodation</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Name</Label><Input value={editAccName} onChange={e => setEditAccName(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Price/night (optional)</Label><Input type="number" value={editAccPrice} onChange={e => setEditAccPrice(e.target.value)} className="rounded-lg mt-1" /></div>
            <Button onClick={handleSaveEditAcc} className="w-full rounded-lg" disabled={editAccMutation.isPending}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Clone & Edit Dialogs ── */}
      <Dialog open={cloneDateOpen} onOpenChange={setCloneDateOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Clone Date Proposal</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Label (optional)</Label><Input value={cloneDateLabel} onChange={e => setCloneDateLabel(e.target.value)} className="rounded-lg mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Start</Label><Input type="date" value={cloneDateStart} onChange={e => setCloneDateStart(e.target.value)} className="rounded-lg mt-1" /></div>
              <div><Label className="text-xs">End</Label><Input type="date" value={cloneDateEnd} onChange={e => setCloneDateEnd(e.target.value)} className="rounded-lg mt-1" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">Change at least one field to avoid duplicates.</p>
            <Button onClick={handleSaveCloneDate} className="w-full rounded-lg" disabled={proposeDateMutation.isPending}>Save as New Proposal</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneDestOpen} onOpenChange={setCloneDestOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Clone Destination</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Name</Label><Input value={cloneDestName} onChange={e => setCloneDestName(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Description (optional)</Label><Textarea value={cloneDestDesc} onChange={e => setCloneDestDesc(e.target.value)} rows={2} className="rounded-lg mt-1 resize-none text-sm" /></div>
            <p className="text-[11px] text-muted-foreground">Change the name to avoid duplicates.</p>
            <Button onClick={handleSaveCloneDest} className="w-full rounded-lg" disabled={createDestMutation.isPending}>Save as New Proposal</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cloneAccOpen} onOpenChange={setCloneAccOpen}>
        <DialogContent className="max-w-sm mx-4 rounded-2xl">
          <DialogHeader><DialogTitle>Clone Accommodation</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Name</Label><Input value={cloneAccName} onChange={e => setCloneAccName(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Booking link (optional)</Label><Input value={cloneAccLink} onChange={e => setCloneAccLink(e.target.value)} className="rounded-lg mt-1" /></div>
            <div><Label className="text-xs">Price/night (optional)</Label><Input type="number" value={cloneAccPrice} onChange={e => setCloneAccPrice(e.target.value)} className="rounded-lg mt-1" /></div>
            <p className="text-[11px] text-muted-foreground">Change at least one field to avoid duplicates.</p>
            <Button onClick={handleSaveCloneAcc} className="w-full rounded-lg" disabled={createAccMutation.isPending}>Save as New Proposal</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
