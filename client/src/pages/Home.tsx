import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { AuthDialog } from "@/components/AuthDialog";
import { Link, useLocation } from "wouter";
import {
  Compass, MapPin, Plus, LogOut,
  ChevronRight, Sparkles, Shield, DollarSign, Vote
} from "lucide-react";

function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const { refresh } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onSuccess={() => { setAuthOpen(false); refresh(); }} />
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10" />
        <div className="relative px-6 pt-16 pb-12 max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            AI-Powered Group Travel
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
            Plan trips<br />
            <span className="text-primary">without the drama</span>
          </h1>
          <p className="text-muted-foreground text-base mb-8 max-w-sm mx-auto leading-relaxed">
            Harmony resolves group conflicts, finds consensus, and keeps everyone's budget in check — so you can focus on the adventure.
          </p>
          <Button size="lg" className="w-full max-w-xs h-12 text-base font-semibold rounded-xl shadow-lg" onClick={() => setAuthOpen(true)}>
            Get Started
          </Button>
        </div>
      </div>

      {/* Features */}
      <div className="px-6 pb-16 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Compass, title: "Travel DNA", desc: "Personality quiz for smart matching", color: "text-primary bg-primary/10" },
            { icon: Vote, title: "Smart Voting", desc: "Love, Fine, or Veto on every option", color: "text-chart-2 bg-accent" },
            { icon: Shield, title: "AI Referee", desc: "Detects conflicts, suggests compromises", color: "text-chart-3 bg-chart-3/10" },
            { icon: DollarSign, title: "Budget Guard", desc: "Per-person tracking with alerts", color: "text-chart-4 bg-chart-4/10" },
          ].map((f) => (
            <Card key={f.title} className="border-0 shadow-sm bg-card">
              <CardContent className="p-4">
                <div className={`h-10 w-10 rounded-xl ${f.color} flex items-center justify-center mb-3`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: any }) {
  const phaseLabels: Record<string, string> = {
    setup: "Getting Started",
    dates: "Picking Dates",
    destination: "Choosing Destination",
    accommodation: "Finding Stays",
    activities: "Planning Activities",
    finalized: "All Set!",
  };
  const phaseColors: Record<string, string> = {
    setup: "bg-muted text-muted-foreground",
    dates: "bg-chart-4/10 text-chart-4",
    destination: "bg-chart-3/10 text-chart-3",
    accommodation: "bg-chart-2/10 text-chart-2",
    activities: "bg-primary/10 text-primary",
    finalized: "bg-green-100 text-green-700",
  };

  return (
    <Link href={`/trips/${trip.id}`}>
      <Card className="border border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate">{trip.name}</h3>
              {trip.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{trip.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className={`text-xs ${phaseColors[trip.phase] || ""}`}>
                  {phaseLabels[trip.phase] || trip.phase}
                </Badge>
                {trip.memberRole === "organizer" && (
                  <Badge variant="outline" className="text-xs">Organizer</Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const { data: trips, isLoading } = trpc.trips.list.useQuery();
  const { data: dna } = trpc.travelDna.get.useQuery();
  const [, navigate] = useLocation();

  return (
    <AppShell
      title={`Hi, ${user?.name?.split(" ")[0] || "Traveler"}`}
      headerRight={
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
        </Button>
      }
    >
      <div className="px-4 py-4 space-y-5">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="default"
            className="h-auto py-4 flex-col gap-2 rounded-xl shadow-sm"
            onClick={() => navigate("/trips/new")}
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">New Trip</span>
          </Button>
          <Button
            variant={dna ? "outline" : "secondary"}
            className={`h-auto py-4 flex-col gap-2 rounded-xl ${!dna ? "border-primary/30 bg-primary/5" : ""}`}
            onClick={() => navigate("/quiz")}
          >
            <Compass className="h-5 w-5" />
            <span className="text-sm font-medium">{dna ? "Edit DNA" : "Take Quiz"}</span>
          </Button>
        </div>

        {!dna && (
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Complete your Travel DNA</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Take a quick quiz so Harmony can match you with the right trips and resolve conflicts smarter.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trips */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Trips</h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : trips && trips.length > 0 ? (
            <div className="space-y-3">
              {trips.map((trip: any) => <TripCard key={trip.id} trip={trip} />)}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No trips yet. Create one to get started!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <LandingPage />;
}
