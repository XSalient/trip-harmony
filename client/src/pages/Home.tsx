import { useState } from "react";
import { useAuth, useSessionSwitch } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { AuthDialog } from "@/components/AuthDialog";
import { Link, useLocation } from "wouter";
import {
  ClipboardList,
  MapPin,
  Plus,
  LogOut,
  ChevronRight,
  Eye,
  Sparkles,
  Shield,
  DollarSign,
  Vote,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEMO_PERSONAS, DEMO_TOUR_INVITE_CODE } from "@shared/demo";

/**
 * Pick a seat in the demo and be inside the app, with nothing typed.
 *
 * The three seats are the permission model made visible: the same trip seen as
 * the person who runs it, as someone who only votes, and as someone who is
 * merely watching. It is a better explanation than the pricing page's would be.
 */
function DemoSeatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const demoSignIn = trpc.auth.demoSignIn.useMutation();
  const switchSession = useSessionSwitch();

  const take = async (persona: string) => {
    setPending(persona);
    try {
      await demoSignIn.mutateAsync({ persona });
      // The seats are meant to be tried one after another, so this is the one
      // screen where a stale cache is guaranteed rather than unlikely: without
      // the clear, Nina's first paint is whatever Ava was looking at.
      await switchSession();
      onOpenChange(false);
      navigate("/");
    } catch {
      toast.error("The demo isn't available on this deployment.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Look around as…</DialogTitle>
          <DialogDescription>
            A real group trip, mid-argument. Pick a seat — nothing to sign up
            for, and you can switch later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {DEMO_PERSONAS.map(persona => (
            <button
              key={persona.key}
              onClick={() => take(persona.key)}
              disabled={pending !== null}
              className="w-full text-left rounded-xl border border-border/70 p-4 transition hover:border-primary hover:bg-accent/40 disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{persona.name}</span>
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {persona.role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pending === persona.key ? "Opening…" : persona.blurb}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Everyone in the demo is invented. Nothing you do here reaches a real
          person.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  // Public query: it answers for a signed-out visitor, which is the whole point.
  const { data: demoTrip } = trpc.trips.getByInviteCode.useQuery({
    code: DEMO_TOUR_INVITE_CODE,
  });

  // Whether this host is the demo's. The product site and the demo are one
  // deployment behind two domains, so the server has to say which one answered.
  const { data: capabilities } = trpc.auth.capabilities.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        // `AuthDialog` has already reset the session cache by the time this runs.
        onSuccess={() => setAuthOpen(false)}
      />
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10" />
        <div className="relative px-6 pt-16 pb-12 max-w-lg mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            AI-Powered Group Travel
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
            Plan trips
            <br />
            <span className="text-primary">without the drama</span>
          </h1>
          <p className="text-muted-foreground text-base mb-8 max-w-sm mx-auto leading-relaxed">
            Back To Travelling resolves group conflicts, finds consensus, and
            keeps everyone's budget in check — so you can focus on the
            adventure.
          </p>
          <Button
            size="lg"
            className="w-full max-w-xs h-12 text-base font-semibold rounded-xl shadow-lg"
            onClick={() => setAuthOpen(true)}
          >
            Get Started
          </Button>

          {/* Both have to hold. `demoTour` keeps it off the product site, which
              serves the same build from a different domain. And a demo has to
              have been seeded — a button leading to "Trip not found" is worse
              than no button. Presentation only: `auth.demoSignIn` applies the
              host rule itself. */}
          {capabilities?.demoTour && demoTrip && (
            <div className="mt-4">
              <Button
                variant="outline"
                size="lg"
                className="w-full max-w-xs h-12 text-base rounded-xl"
                onClick={() => setDemoOpen(true)}
              >
                <Eye className="h-4 w-4" />
                See a real trip
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Seven people, mid-argument. No sign-up.
              </p>
            </div>
          )}
        </div>
      </div>

      <DemoSeatDialog open={demoOpen} onOpenChange={setDemoOpen} />

      {/* Features */}
      <div className="px-6 pb-16 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              icon: ClipboardList,
              title: "Trip Preferences",
              desc: "Your must-haves and dealbreakers, per trip",
              color: "text-primary bg-primary/10",
            },
            {
              icon: Vote,
              title: "Smart Voting",
              desc: "Love, Fine, or Veto on every option",
              color: "text-chart-2 bg-accent",
            },
            {
              icon: Shield,
              title: "AI Referee",
              desc: "Detects conflicts, suggests compromises",
              color: "text-chart-3 bg-chart-3/10",
            },
            {
              icon: DollarSign,
              title: "Budget Guard",
              desc: "Per-person tracking with alerts",
              color: "text-chart-4 bg-chart-4/10",
            },
          ].map(f => (
            <Card key={f.title} className="border-0 shadow-sm bg-card">
              <CardContent className="p-4">
                <div
                  className={`h-10 w-10 rounded-xl ${f.color} flex items-center justify-center mb-3`}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
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
    destination: "Choosing Suggestions",
    accommodation: "Finding Accommodations",
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
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                  {trip.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge
                  variant="secondary"
                  className={`text-xs ${phaseColors[trip.phase] || ""}`}
                >
                  {phaseLabels[trip.phase] || trip.phase}
                </Badge>
                {trip.memberRole === "organizer" && (
                  <Badge variant="outline" className="text-xs">
                    Organizer
                  </Badge>
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
  const [, navigate] = useLocation();

  return (
    <AppShell
      title={`Hi, ${user?.name?.split(" ")[0] || "Traveler"}`}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      }
    >
      <div className="px-4 py-4 space-y-5">
        {/* Quick Actions */}
        <Button
          variant="default"
          className="h-auto w-full py-4 flex-col gap-2 rounded-xl shadow-sm"
          onClick={() => navigate("/trips/new")}
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">New Trip</span>
        </Button>

        {/* Trips */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Your Trips
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : trips && trips.length > 0 ? (
            <div className="space-y-3">
              {trips.map((trip: any) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No trips yet. Create one to get started!
                </p>
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
