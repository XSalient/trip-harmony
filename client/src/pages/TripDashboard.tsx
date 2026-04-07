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
  ChevronRight, CheckCircle2, Circle, Bot, Copy, UserPlus,
  TrendingUp, AlertCircle, ThumbsUp, Heart, Ban, Send
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format, differenceInDays } from "date-fns";

const phases = [
  { key: "setup", label: "Setup", icon: Users },
  { key: "dates", label: "Dates", icon: Calendar },
  { key: "destination", label: "Destination", icon: MapPin },
  { key: "accommodation", label: "Stays", icon: HomeIcon },
  { key: "activities", label: "Activities", icon: Calendar },
  { key: "finalized", label: "Done", icon: CheckCircle2 },
];

function RequirementsDashboard({ tripId, members, dateProposals, destinations, accommodations, userId }: {
  tripId: number;
  members: any[];
  dateProposals: any[];
  destinations: any[];
  accommodations: any[];
  userId: number;
}) {
  const memberCount = members.filter((m: any) => m.status === "accepted").length || 1;

  // Compute stats for each category
  const dateStats = useMemo(() => {
    const total = dateProposals.length;
    const selected = dateProposals.filter(p => p.selected).length;
    const fullyVoted = dateProposals.filter(p => (p.votes?.length || 0) >= memberCount).length;
    const myPending = dateProposals.filter(p => !p.votes?.some((v: any) => v.userId === userId)).length;
    const selectedProposal = dateProposals.find(p => p.selected);
    let consensus = 0;
    if (selectedProposal) {
      const avail = selectedProposal.votes?.filter((v: any) => v.vote === "available" || v.vote === "maybe").length || 0;
      consensus = Math.round((avail / memberCount) * 100);
    } else {
      // Best performing proposal
      const best = dateProposals.reduce((best: any, p: any) => {
        const avail = p.votes?.filter((v: any) => v.vote === "available" || v.vote === "maybe").length || 0;
        const bestAvail = best?.votes?.filter((v: any) => v.vote === "available" || v.vote === "maybe").length || 0;
        return avail > bestAvail ? p : best;
      }, null);
      if (best) {
        const avail = best.votes?.filter((v: any) => v.vote === "available" || v.vote === "maybe").length || 0;
        consensus = Math.round((avail / memberCount) * 100);
      }
    }
    return { total, selected, fullyVoted, myPending, consensus, isLocked: selected > 0 };
  }, [dateProposals, memberCount, userId]);

  const destStats = useMemo(() => {
    const total = destinations.length;
    const selected = destinations.filter(d => d.selected).length;
    const vetoed = destinations.filter(d => {
      const vetos = d.votes?.filter((v: any) => v.vote === "veto").length || 0;
      return vetos > 0;
    }).length;
    const loved = destinations.filter(d => {
      const loves = d.votes?.filter((v: any) => v.vote === "love").length || 0;
      return loves >= Math.ceil(memberCount / 2);
    }).length;
    const myPending = destinations.filter(d => !d.votes?.some((v: any) => v.userId === userId)).length;
    const topScore = destinations.reduce((max: number, d: any) => {
      const score = d.votes?.reduce((s: number, v: any) => s + (v.vote === "love" ? 2 : v.vote === "fine" ? 1 : -3), 0) || 0;
      return Math.max(max, score);
    }, 0);
    return { total, selected, vetoed, loved, myPending, topScore, isLocked: selected > 0 };
  }, [destinations, memberCount, userId]);

  const accStats = useMemo(() => {
    const total = accommodations.length;
    const selected = accommodations.filter(a => a.selected).length;
    const vetoed = accommodations.filter(a => {
      const vetos = a.votes?.filter((v: any) => v.vote === "veto").length || 0;
      return vetos > 0;
    }).length;
    const loved = accommodations.filter(a => {
      const loves = a.votes?.filter((v: any) => v.vote === "love").length || 0;
      return loves >= Math.ceil(memberCount / 2);
    }).length;
    const myPending = accommodations.filter(a => !a.votes?.some((v: any) => v.userId === userId)).length;
    return { total, selected, vetoed, loved, myPending, isLocked: selected > 0 };
  }, [accommodations, memberCount, userId]);

  // Overall score: count "met" requirements
  const metCount = [dateStats.isLocked, destStats.isLocked, accStats.isLocked].filter(Boolean).length;
  const totalReqs = 3;

  const sections = [
    {
      label: "Dates",
      icon: Calendar,
      stats: dateStats,
      items: [
        { label: "Proposals", value: dateStats.total, suffix: "total" },
        { label: "Best consensus", value: `${dateStats.consensus}%`, color: dateStats.consensus >= 75 ? "text-green-600" : dateStats.consensus >= 50 ? "text-yellow-600" : "text-red-500" },
        { label: "Your pending votes", value: dateStats.myPending, color: dateStats.myPending > 0 ? "text-orange-500" : "text-green-600" },
      ],
      status: dateStats.isLocked ? "locked" : dateStats.total === 0 ? "empty" : "in-progress",
    },
    {
      label: "Destination",
      icon: MapPin,
      stats: destStats,
      items: [
        { label: "Options", value: destStats.total, suffix: "total" },
        { label: "Majority loves", value: destStats.loved, color: destStats.loved > 0 ? "text-green-600" : "text-muted-foreground" },
        { label: "Have vetoes", value: destStats.vetoed, color: destStats.vetoed > 0 ? "text-red-500" : "text-green-600" },
        { label: "Your pending votes", value: destStats.myPending, color: destStats.myPending > 0 ? "text-orange-500" : "text-green-600" },
      ],
      status: destStats.isLocked ? "locked" : destStats.total === 0 ? "empty" : "in-progress",
    },
    {
      label: "Accommodation",
      icon: HomeIcon,
      stats: accStats,
      items: [
        { label: "Options", value: accStats.total, suffix: "total" },
        { label: "Majority loves", value: accStats.loved, color: accStats.loved > 0 ? "text-green-600" : "text-muted-foreground" },
        { label: "Have vetoes", value: accStats.vetoed, color: accStats.vetoed > 0 ? "text-red-500" : "text-green-600" },
        { label: "Your pending votes", value: accStats.myPending, color: accStats.myPending > 0 ? "text-orange-500" : "text-green-600" },
      ],
      status: accStats.isLocked ? "locked" : accStats.total === 0 ? "empty" : "in-progress",
    },
  ];

  return (
    <div className="space-y-3">
      {/* Overall summary */}
      <Card className={`${metCount === totalReqs ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-border/50"}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${metCount === totalReqs ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"}`}>
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Requirements Progress</p>
              <p className="text-xs text-muted-foreground">{metCount}/{totalReqs} categories agreed</p>
            </div>
            <div className="ml-auto text-2xl font-bold text-primary">{Math.round((metCount / totalReqs) * 100)}%</div>
          </div>
          <Progress value={(metCount / totalReqs) * 100} className="h-2" />
          <div className="flex justify-between mt-2">
            {sections.map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center ${
                  s.status === "locked" ? "bg-green-100 text-green-600" :
                  s.status === "empty" ? "bg-muted text-muted-foreground" :
                  "bg-yellow-100 text-yellow-600"
                }`}>
                  {s.status === "locked" ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                   s.status === "empty" ? <Circle className="h-3.5 w-3.5" /> :
                   <AlertCircle className="h-3.5 w-3.5" />}
                </div>
                <span className="text-[9px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-category breakdown */}
      {sections.map(section => (
        <Card key={section.label} className={`border ${section.status === "locked" ? "border-green-200 bg-green-50/50 dark:bg-green-950/10" : "border-border/50"}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <section.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{section.label}</span>
              <div className="ml-auto">
                {section.status === "locked" && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">Agreed</Badge>}
                {section.status === "empty" && <Badge variant="outline" className="text-[10px]">No proposals</Badge>}
                {section.status === "in-progress" && <Badge variant="secondary" className="text-[10px]">In progress</Badge>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {section.items.map(item => (
                <div key={item.label} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground truncate">{item.label}</span>
                  <span className={`font-medium ml-2 ${item.color || ""}`}>
                    {item.value}{item.suffix ? ` ${item.suffix}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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
  const [showRequirements, setShowRequirements] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const sendInviteEmail = trpc.trips.sendInviteEmail.useMutation();

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

  // Count agreed items
  const agreedCount = [
    dateProposals?.some((d: any) => d.selected),
    destinations?.some((d: any) => d.selected),
    accommodations?.some((a: any) => a.selected),
  ].filter(Boolean).length;

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
                    } catch {
                      toast.error("Failed to send invite");
                    }
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

        {/* Requirements Dashboard Summary Card */}
        <Card
          className="border-border/50 cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => setShowRequirements(v => !v)}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              agreedCount === 3 ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
            }`}>
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Requirements</span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${agreedCount === 3 ? "bg-green-100 text-green-700" : ""}`}
                >
                  {agreedCount}/3 agreed
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {agreedCount === 3 ? "All key decisions made!" :
                 totalPending > 0 ? `${totalPending} vote${totalPending > 1 ? "s" : ""} needed` :
                 "Tap to see details"}
              </p>
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${showRequirements ? "rotate-90" : ""}`} />
          </CardContent>
        </Card>

        {/* Expanded requirements */}
        {showRequirements && user && (
          <RequirementsDashboard
            tripId={tripId}
            members={acceptedMembers}
            dateProposals={dateProposals || []}
            destinations={destinations || []}
            accommodations={accommodations || []}
            userId={user.id}
          />
        )}

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
            { href: `/trips/${tripId}/dates`, icon: Calendar, label: "Dates", desc: `${dateProposals?.length || 0} proposals`, pending: pendingVotes.dates, agreed: dateProposals?.some((d: any) => d.selected) },
            { href: `/trips/${tripId}/destinations`, icon: MapPin, label: "Destinations", desc: `${destinations?.length || 0} options`, pending: pendingVotes.destinations, agreed: destinations?.some((d: any) => d.selected) },
            { href: `/trips/${tripId}/accommodations`, icon: HomeIcon, label: "Accommodations", desc: `${accommodations?.length || 0} options`, pending: pendingVotes.accommodations, agreed: accommodations?.some((a: any) => a.selected) },
            { href: `/trips/${tripId}/budget`, icon: DollarSign, label: "Budget", desc: `${budgetSummary?.itemCount || 0} items` },
            { href: `/trips/${tripId}/referee`, icon: Bot, label: "AI Referee", desc: "Get mediation advice" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="border-border/50 hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    item.agreed ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary"
                  }`}>
                    {item.agreed ? <CheckCircle2 className="h-5 w-5" /> : <item.icon className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      {item.pending && item.pending > 0 ? (
                        <Badge variant="secondary" className="text-[10px] bg-chart-2/10 text-chart-2">{item.pending} to vote</Badge>
                      ) : item.agreed ? (
                        <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">Agreed</Badge>
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
