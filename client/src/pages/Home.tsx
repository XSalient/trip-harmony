import { useState } from "react";
import { useAuth, useSessionSwitch } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { rememberSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import Landing from "./Landing";
import { PaywallDialog } from "@/components/PaywallDialog";
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
    finalized: "bg-success-soft text-success-on-soft",
  };

  return (
    <Link href={`/trips/${trip.id}`} className="block">
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
  // Asked before the button is pressed, so somebody at the limit meets the
  // paywall instead of the create form and a refusal at the end of it.
  const { data: billing } = trpc.billing.status.useQuery();
  const [paywallOpen, setPaywallOpen] = useState(false);

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
          onClick={() =>
            billing?.atLimit ? setPaywallOpen(true) : navigate("/trips/new")
          }
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

      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </AppShell>
  );
}

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Landing />;
}
