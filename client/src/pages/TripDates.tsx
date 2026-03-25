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
import { format, differenceInDays } from "date-fns";
import { Calendar, Plus, Check, X, HelpCircle, CheckCircle2, Trash2, Sparkles, Lock, Unlock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function getDayName(dateStr: string) {
  return format(new Date(dateStr), "EEEE");
}

function getNightsCount(start: Date, end: Date) {
  return differenceInDays(end, start);
}

function formatDateRange(startDate: Date, endDate: Date) {
  const nights = getNightsCount(startDate, endDate);
  const startDay = format(startDate, "EEE, MMM d");
  const endDay = format(endDate, "EEE, MMM d, yyyy");
  return { startDay, endDay, nights };
}

export default function TripDates() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");

  const { data: proposals, isLoading } = trpc.dates.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: trip } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery({ tripId }, { enabled: tripId > 0 });
  const proposeMutation = trpc.dates.propose.useMutation();
  const voteMutation = trpc.dates.vote.useMutation();
  const selectMutation = trpc.dates.select.useMutation();
  const deselectMutation = trpc.dates.deselect.useMutation();
  const deleteMutation = trpc.dates.delete.useMutation();
  const parseNaturalMutation = trpc.dates.parseNatural.useMutation();
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");

  // Natural language state
  const [nlText, setNlText] = useState("");
  const [nlProposals, setNlProposals] = useState<Array<{ startDate: string; endDate: string; label: string }>>([]);
  const [nlParsing, setNlParsing] = useState(false);

  const isOrganizer = trip?.organizerId === user?.id;
  const memberCount = useMemo(() => members?.filter((m: any) => m.status === "accepted").length || 0, [members]);
  const selectedProposal = useMemo(() => proposals?.find((p: any) => p.selected), [proposals]);

  const handlePropose = async () => {
    if (!startDate || !endDate) { toast.error("Both dates are required"); return; }
    try {
      await proposeMutation.mutateAsync({ tripId, startDate, endDate, label: label || undefined });
      utils.dates.list.invalidate({ tripId });
      setAddOpen(false);
      setStartDate(""); setEndDate(""); setLabel("");
      toast.success("Date proposed!");
    } catch { toast.error("Failed to propose dates"); }
  };

  const handleVote = async (proposalId: number, vote: "available" | "maybe" | "unavailable") => {
    try {
      await voteMutation.mutateAsync({ proposalId, vote });
      utils.dates.list.invalidate({ tripId });
    } catch { toast.error("Failed to vote"); }
  };

  const handleSelect = async (proposalId: number) => {
    try {
      await selectMutation.mutateAsync({ tripId, proposalId });
      utils.dates.list.invalidate({ tripId });
      toast.success("Date locked in!");
    } catch { toast.error("Failed to select date"); }
  };

  const handleDeselect = async () => {
    try {
      await deselectMutation.mutateAsync({ tripId });
      utils.dates.list.invalidate({ tripId });
      toast.success("Date unlocked");
    } catch { toast.error("Failed to unlock"); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      utils.dates.list.invalidate({ tripId });
      toast.success("Proposal deleted");
    } catch (e: any) {
      toast.error(e?.message?.includes("Not authorized") ? "You can only delete your own proposals" : "Failed to delete");
    }
  };

  const handleParseNatural = async () => {
    if (!nlText.trim()) { toast.error("Please enter a description"); return; }
    setNlParsing(true);
    try {
      const result = await parseNaturalMutation.mutateAsync({
        text: nlText,
        referenceYear: new Date().getFullYear(),
      });
      if (result.proposals.length === 0) {
        toast.error("Could not parse dates. Try being more specific (e.g., 'weekends in July 2025')");
      } else {
        setNlProposals(result.proposals);
        toast.success(`Found ${result.proposals.length} date option${result.proposals.length > 1 ? "s" : ""}`);
      }
    } catch {
      toast.error("Failed to parse dates");
    } finally {
      setNlParsing(false);
    }
  };

  const handleAddNlProposal = async (proposal: { startDate: string; endDate: string; label: string }) => {
    try {
      await proposeMutation.mutateAsync({ tripId, startDate: proposal.startDate, endDate: proposal.endDate, label: proposal.label });
      utils.dates.list.invalidate({ tripId });
      toast.success("Date added!");
    } catch { toast.error("Failed to add"); }
  };

  const handleAddAllNlProposals = async () => {
    let added = 0;
    for (const p of nlProposals) {
      try {
        await proposeMutation.mutateAsync({ tripId, startDate: p.startDate, endDate: p.endDate, label: p.label });
        added++;
      } catch {}
    }
    utils.dates.list.invalidate({ tripId });
    toast.success(`Added ${added} date proposals!`);
    setNlProposals([]);
    setNlText("");
    setAddOpen(false);
  };

  return (
    <AppShell title="Dates" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Propose dates and vote on availability</p>
            {selectedProposal && (
              <p className="text-xs text-primary font-medium mt-0.5">
                {format(new Date(selectedProposal.startDate), "EEE, MMM d")} – {format(new Date(selectedProposal.endDate), "EEE, MMM d, yyyy")} locked
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOrganizer && selectedProposal && (
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
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-lg gap-1">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm mx-4 rounded-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Propose Dates</DialogTitle></DialogHeader>
                <Tabs defaultValue="manual" className="w-full">
                  <TabsList className="w-full rounded-lg">
                    <TabsTrigger value="manual" className="flex-1 text-xs">Manual</TabsTrigger>
                    <TabsTrigger value="natural" className="flex-1 text-xs gap-1">
                      <Sparkles className="h-3 w-3" /> Natural Language
                    </TabsTrigger>
                  </TabsList>

                  {/* Manual entry */}
                  <TabsContent value="manual" className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Label (optional)</Label>
                      <Input placeholder="e.g., Spring Break" value={label} onChange={e => setLabel(e.target.value)} className="rounded-lg" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Start</Label>
                        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg" />
                        {startDate && <p className="text-xs text-muted-foreground">{getDayName(startDate)}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>End</Label>
                        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg" />
                        {endDate && <p className="text-xs text-muted-foreground">{getDayName(endDate)}</p>}
                      </div>
                    </div>
                    {startDate && endDate && new Date(endDate) > new Date(startDate) && (
                      <p className="text-xs text-muted-foreground text-center">
                        {getNightsCount(new Date(startDate), new Date(endDate))} night{getNightsCount(new Date(startDate), new Date(endDate)) !== 1 ? "s" : ""}
                      </p>
                    )}
                    <Button onClick={handlePropose} className="w-full rounded-lg" disabled={proposeMutation.isPending}>
                      {proposeMutation.isPending ? "Proposing..." : "Propose Dates"}
                    </Button>
                  </TabsContent>

                  {/* Natural language entry */}
                  <TabsContent value="natural" className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Describe your availability</Label>
                      <Textarea
                        placeholder="e.g., any weekends in July 2025, or Tuesdays to Thursdays in June, or first two weeks of August"
                        value={nlText}
                        onChange={e => setNlText(e.target.value)}
                        rows={3}
                        className="rounded-lg resize-none text-sm"
                      />
                    </div>
                    <Button
                      onClick={handleParseNatural}
                      variant="outline"
                      className="w-full rounded-lg gap-2"
                      disabled={nlParsing}
                    >
                      <Sparkles className="h-4 w-4" />
                      {nlParsing ? "Parsing..." : "Parse Dates"}
                    </Button>

                    {nlProposals.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{nlProposals.length} date{nlProposals.length > 1 ? "s" : ""} found:</p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {nlProposals.map((p, i) => {
                            const nights = getNightsCount(new Date(p.startDate), new Date(p.endDate));
                            const { startDay, endDay } = formatDateRange(new Date(p.startDate), new Date(p.endDate));
                            return (
                              <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-xs">
                                <div>
                                  <p className="font-medium">{p.label}</p>
                                  <p className="text-muted-foreground">{startDay} → {endDay} · {nights} night{nights !== 1 ? "s" : ""}</p>
                                </div>
                                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg px-2" onClick={() => handleAddNlProposal(p)} disabled={proposeMutation.isPending}>
                                  Add
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                        <Button onClick={handleAddAllNlProposals} className="w-full rounded-lg" disabled={proposeMutation.isPending}>
                          Add All {nlProposals.length} Proposals
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
        ) : proposals && proposals.length > 0 ? (
          <div className="space-y-3">
            {proposals.map((p: any) => {
              const myVote = p.votes?.find((v: any) => v.userId === user?.id)?.vote;
              const available = p.votes?.filter((v: any) => v.vote === "available").length || 0;
              const maybe = p.votes?.filter((v: any) => v.vote === "maybe").length || 0;
              const unavailable = p.votes?.filter((v: any) => v.vote === "unavailable").length || 0;
              const totalVotes = p.votes?.length || 0;
              const isOwner = p.proposedBy === user?.id;
              const nights = getNightsCount(new Date(p.startDate), new Date(p.endDate));
              const { startDay, endDay } = formatDateRange(new Date(p.startDate), new Date(p.endDate));

              return (
                <Card key={p.id} className={`border ${p.selected ? "border-primary bg-primary/5" : "border-border/50"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        {p.label && <p className="text-sm font-medium mb-0.5">{p.label}</p>}
                        <div className="flex items-start gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p>{startDay}</p>
                            <p className="text-muted-foreground text-xs">to {endDay}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {nights} night{nights !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {p.selected && <Badge className="bg-primary text-primary-foreground text-xs flex items-center gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
                        {isOwner && !p.selected && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(p.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Vote counts */}
                    <div className="flex gap-4 text-xs mb-3">
                      <span className="text-green-600 font-medium">{available} available</span>
                      <span className="text-yellow-600 font-medium">{maybe} maybe</span>
                      <span className="text-red-500 font-medium">{unavailable} can't</span>
                      <span className="text-muted-foreground ml-auto">{totalVotes}/{memberCount} voted</span>
                    </div>

                    {/* Availability bar */}
                    {totalVotes > 0 && (
                      <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-muted">
                        {available > 0 && <div className="bg-green-500" style={{ width: `${(available / memberCount) * 100}%` }} />}
                        {maybe > 0 && <div className="bg-yellow-400" style={{ width: `${(maybe / memberCount) * 100}%` }} />}
                        {unavailable > 0 && <div className="bg-red-400" style={{ width: `${(unavailable / memberCount) * 100}%` }} />}
                      </div>
                    )}

                    {/* Vote buttons */}
                    {!p.selected && (
                      <div className="flex gap-2">
                        {[
                          { vote: "available" as const, icon: Check, label: "Available", active: "bg-green-100 text-green-700 border-green-300" },
                          { vote: "maybe" as const, icon: HelpCircle, label: "Maybe", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
                          { vote: "unavailable" as const, icon: X, label: "Can't", active: "bg-red-100 text-red-600 border-red-300" },
                        ].map(btn => (
                          <Button
                            key={btn.vote}
                            variant="outline"
                            size="sm"
                            className={`flex-1 rounded-lg text-xs h-9 ${myVote === btn.vote ? btn.active : ""}`}
                            onClick={() => handleVote(p.id, btn.vote)}
                            disabled={voteMutation.isPending}
                          >
                            <btn.icon className="h-3.5 w-3.5 mr-1" />
                            {btn.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {/* Select button for organizer */}
                    {isOrganizer && !p.selected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 text-primary text-xs"
                        onClick={() => handleSelect(p.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Lock this date
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
              <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No dates proposed yet. Add the first one!</p>
              <p className="text-xs text-muted-foreground mt-1">Try the Natural Language tab — just describe when you're free!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
