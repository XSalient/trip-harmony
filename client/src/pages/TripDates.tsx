import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useParams } from "wouter";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar, Plus, Check, X, HelpCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const utils = trpc.useUtils();

  const [addOpen, setAddOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");

  const isOrganizer = trip?.organizerId === user?.id;
  const memberCount = useMemo(() => members?.filter((m: any) => m.status === "accepted").length || 0, [members]);

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
      toast.success("Date selected!");
    } catch { toast.error("Failed to select date"); }
  };

  return (
    <AppShell title="Dates" showBack backHref={`/trips/${tripId}`}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Propose dates and vote on availability</p>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-lg gap-1">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm mx-4 rounded-2xl">
              <DialogHeader><DialogTitle>Propose Dates</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="e.g., Spring Break" value={label} onChange={e => setLabel(e.target.value)} className="rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="rounded-lg" />
                  </div>
                </div>
                <Button onClick={handlePropose} className="w-full rounded-lg" disabled={proposeMutation.isPending}>
                  {proposeMutation.isPending ? "Proposing..." : "Propose Dates"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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

              return (
                <Card key={p.id} className={`border ${p.selected ? "border-primary bg-primary/5" : "border-border/50"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        {p.label && <p className="text-sm font-medium mb-0.5">{p.label}</p>}
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{format(new Date(p.startDate), "MMM d")} - {format(new Date(p.endDate), "MMM d, yyyy")}</span>
                        </div>
                      </div>
                      {p.selected && <Badge className="bg-primary text-primary-foreground text-xs">Selected</Badge>}
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
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
