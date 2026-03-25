import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import AppShell from "@/components/AppShell";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import {
  Calendar, MapPin, Home as HomeIcon, DollarSign, Users, Share2,
  ChevronRight, CheckCircle2, Circle, Bot, Copy, UserPlus
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

const phases = [
  { key: "setup", label: "Setup", icon: Users },
  { key: "dates", label: "Dates", icon: Calendar },
  { key: "destination", label: "Destination", icon: MapPin },
  { key: "accommodation", label: "Stays", icon: HomeIcon },
  { key: "activities", label: "Activities", icon: Calendar },
  { key: "finalized", label: "Done", icon: CheckCircle2 },
];

export default function TripDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ id: string }>();
  const tripId = parseInt(params.id || "0");
  const [, navigate] = useLocation();

  const { data: trip, isLoading } = trpc.trips.get.useQuery({ id: tripId }, { enabled: tripId > 0 });
  const { data: members } = trpc.trips.members.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: budgetSummary } = trpc.budget.summary.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: destinations } = trpc.destinations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: accommodations } = trpc.accommodations.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const { data: dateProposals } = trpc.dates.list.useQuery({ tripId }, { enabled: tripId > 0 });
  const updateTrip = trpc.trips.update.useMutation();
  const utils = trpc.useUtils();

  const [inviteOpen, setInviteOpen] = useState(false);

  const phaseIndex = useMemo(() => phases.findIndex(p => p.key === trip?.phase), [trip?.phase]);
  const progress = useMemo(() => ((phaseIndex + 1) / phases.length) * 100, [phaseIndex]);

  const inviteUrl = useMemo(() => {
    if (!trip?.inviteCode) return "";
    return `${window.location.origin}/join/${trip.inviteCode}`;
  }, [trip?.inviteCode]);

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied!");
  };

  const advancePhase = async () => {
    if (!trip) return;
    const nextIndex = phaseIndex + 1;
    if (nextIndex >= phases.length) return;
    try {
      await updateTrip.mutateAsync({ id: tripId, phase: phases[nextIndex].key as any });
      utils.trips.get.invalidate({ id: tripId });
      toast.success(`Advanced to ${phases[nextIndex].label} phase!`);
    } catch {
      toast.error("Failed to advance phase");
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Trip" showBack backHref="/">
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
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

  const isOrganizer = trip.organizerId === user?.id;
  const acceptedMembers = members?.filter((m: any) => m.status === "accepted") || [];
  const pendingVotes = {
    dates: dateProposals?.filter((d: any) => !d.votes?.some((v: any) => v.userId === user?.id)).length || 0,
    destinations: destinations?.filter((d: any) => !d.votes?.some((v: any) => v.userId === user?.id)).length || 0,
    accommodations: accommodations?.filter((a: any) => !a.votes?.some((v: any) => v.userId === user?.id)).length || 0,
  };
  const totalPending = pendingVotes.dates + pendingVotes.destinations + pendingVotes.accommodations;

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
              <p className="text-sm text-muted-foreground">Share this link with your group:</p>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted p-3 rounded-lg break-all">{inviteUrl}</code>
                <Button variant="outline" size="icon" onClick={copyInvite}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="px-4 py-4 space-y-4">
        {/* Phase Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Trip Progress</span>
              <span className="text-xs text-muted-foreground">{phaseIndex + 1}/{phases.length}</span>
            </div>
            <Progress value={progress} className="h-2 mb-3" />
            <div className="flex justify-between">
              {phases.map((p, i) => (
                <div key={p.key} className="flex flex-col items-center gap-1">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs ${
                    i < phaseIndex ? "bg-primary text-primary-foreground" :
                    i === phaseIndex ? "bg-primary/20 text-primary ring-2 ring-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i < phaseIndex ? <CheckCircle2 className="h-4 w-4" /> : <p.icon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-[9px] ${i === phaseIndex ? "font-semibold text-primary" : "text-muted-foreground"}`}>{p.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Votes Alert */}
        {totalPending > 0 && (
          <Card className="border-chart-2/30 bg-accent/50">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-chart-2/20 text-chart-2 flex items-center justify-center shrink-0">
                <Circle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">You have {totalPending} pending vote{totalPending > 1 ? "s" : ""}</p>
                <p className="text-xs text-muted-foreground">Your input helps the group decide!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Members */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Members</span>
              </div>
              <Badge variant="secondary" className="text-xs">{acceptedMembers.length}</Badge>
            </div>
            <div className="flex -space-x-2">
              {acceptedMembers.slice(0, 8).map((m: any, i: number) => (
                <div
                  key={m.id}
                  className="h-8 w-8 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center text-xs font-semibold text-primary"
                  title={m.user?.name || "Member"}
                >
                  {(m.user?.name || "?")[0].toUpperCase()}
                </div>
              ))}
              {acceptedMembers.length > 8 && (
                <div className="h-8 w-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs font-medium text-muted-foreground">
                  +{acceptedMembers.length - 8}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget Summary */}
        {budgetSummary && budgetSummary.total > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Budget</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">{trip.currency} {budgetSummary.total.toFixed(0)}</span>
                <span className="text-sm text-muted-foreground">total</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ~{trip.currency} {budgetSummary.perPerson.toFixed(0)} per person ({budgetSummary.memberCount} members)
              </p>
              {budgetSummary.memberBudgets.some((b: any) => b.overBudget) && (
                <Badge variant="destructive" className="mt-2 text-xs">Some members over budget</Badge>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Navigation */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Planning Phases</h3>
          {[
            { href: `/trips/${tripId}/dates`, icon: Calendar, label: "Dates", desc: `${dateProposals?.length || 0} proposals`, pending: pendingVotes.dates },
            { href: `/trips/${tripId}/destinations`, icon: MapPin, label: "Destinations", desc: `${destinations?.length || 0} options`, pending: pendingVotes.destinations },
            { href: `/trips/${tripId}/accommodations`, icon: HomeIcon, label: "Accommodations", desc: `${accommodations?.length || 0} options`, pending: pendingVotes.accommodations },
            { href: `/trips/${tripId}/budget`, icon: DollarSign, label: "Budget", desc: `${budgetSummary?.itemCount || 0} items` },
            { href: `/trips/${tripId}/referee`, icon: Bot, label: "AI Referee", desc: "Get mediation advice" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="border-border/50 hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.pending && item.pending > 0 ? (
                        <Badge variant="secondary" className="text-[10px] bg-chart-2/10 text-chart-2">{item.pending} to vote</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Advance Phase (organizer only) */}
        {isOrganizer && phaseIndex < phases.length - 1 && (
          <Button
            variant="outline"
            className="w-full h-12 rounded-xl border-primary/30 text-primary"
            onClick={advancePhase}
            disabled={updateTrip.isPending}
          >
            Advance to {phases[phaseIndex + 1]?.label} Phase
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </AppShell>
  );
}
