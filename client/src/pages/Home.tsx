import { useState } from "react";
import { useAuth, useSessionSwitch } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { rememberSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import {
  EmptyState,
  IconTile,
  Meta,
  ProgressRing,
  StaggerItem,
  StaggerList,
  StatusPill,
  Surface,
  TONES,
} from "@/components/harmony";
import type { Tone } from "@/lib/taxonomy";
import Landing from "./Landing";
import { PaywallDialog } from "@/components/PaywallDialog";
import { AuthDialog } from "@/components/AuthDialog";
import { Link, useLocation } from "wouter";
import {
  UserRound,
  Users,
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

/** Phase order, so a trip's progress can be shown as a proportion. */
const PHASE_ORDER = [
  "setup",
  "dates",
  "destination",
  "accommodation",
  "activities",
  "finalized",
];

function TripCard({ trip }: { trip: any }) {
  const phaseLabels: Record<string, string> = {
    setup: "Getting Started",
    dates: "Picking Dates",
    destination: "Choosing Suggestions",
    accommodation: "Finding Accommodations",
    activities: "Planning Activities",
    finalized: "All Set!",
  };
  const phaseTone: Record<string, Tone> = {
    setup: "neutral",
    dates: "cat-1",
    destination: "cat-5",
    accommodation: "cat-2",
    activities: "cat-4",
    finalized: "success",
  };

  const tone: Tone = phaseTone[trip.phase] ?? "neutral";
  const step = Math.max(0, PHASE_ORDER.indexOf(trip.phase));
  const progress = ((step + 1) / PHASE_ORDER.length) * 100;

  return (
    <Link href={`/trips/${trip.id}`} className="block">
      <Surface interactive className="overflow-hidden">
        {/* The spine carries the trip's phase, in the same tone as the pill
            below it. It used to be the brand gradient on every card, which
            looked deliberate and said nothing — and a spine means status
            everywhere else in the app, so a decorative one here spent a
            vocabulary the rest of the design relies on. */}
        <span
          aria-hidden
          className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${TONES[tone].solid}`}
        />
        <div className="flex items-center gap-3 p-4 pl-5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-[17px] font-bold tracking-tight">
              {trip.name}
            </h3>
            {trip.description && (
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                {trip.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={tone}>
                {phaseLabels[trip.phase] || trip.phase}
              </StatusPill>
              {trip.memberRole === "organizer" && (
                <Meta icon={Users}>You organise this</Meta>
              )}
            </div>
          </div>

          <ProgressRing value={progress} label={`${trip.name} progress`} />
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>
      </Surface>
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

  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = `${
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  }, ${firstName}`;
  const tripCount = trips?.length ?? 0;

  return (
    <AppShell
      title={greeting}
      largeTitle
      headerBelow={
        <p className="mt-1 text-sm text-muted-foreground">
          {tripCount > 0
            ? `${tripCount} ${tripCount === 1 ? "trip" : "trips"} in motion`
            : "Nothing planned yet"}
        </p>
      }
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6 px-4 py-4">
        {/* Two action tiles: the primary one carries the brand gradient, the
            secondary sits on a plain surface so the hierarchy is unambiguous. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              billing?.atLimit ? setPaywallOpen(true) : navigate("/trips/new")
            }
            className="grad-brand glow flex min-h-[8.5rem] flex-col items-start justify-between rounded-2xl p-4 text-left text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:active:scale-100"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-foreground/20">
              <Plus className="size-5" />
            </span>
            <span>
              <span className="block font-display text-[17px] font-bold">
                New trip
              </span>
              <span className="block text-sm opacity-80">Start planning</span>
            </span>
          </button>

          <Link href="/profile" className="block">
            <Surface
              interactive
              className="flex min-h-[8.5rem] flex-col items-start justify-between p-4"
            >
              <IconTile icon={UserRound} tone="cat-1" size="lg" />
              <span>
                <span className="block font-display text-[17px] font-bold tracking-tight">
                  Your profile
                </span>
                <span className="block text-sm text-muted-foreground">
                  Account &amp; plan
                </span>
              </span>
            </Surface>
          </Link>
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-[17px] font-bold tracking-tight">
              Your trips
            </h2>
            {tripCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  billing?.atLimit
                    ? setPaywallOpen(true)
                    : navigate("/trips/new")
                }
                className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-primary touch-target"
              >
                <Plus className="size-4" />
                New
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <Skeleton key={i} className="h-[104px] rounded-2xl" />
              ))}
            </div>
          ) : trips && trips.length > 0 ? (
            <StaggerList className="space-y-3">
              {trips.map((trip: any) => (
                <StaggerItem key={trip.id}>
                  <TripCard trip={trip} />
                </StaggerItem>
              ))}
            </StaggerList>
          ) : (
            <EmptyState
              icon={MapPin}
              title="No trips yet"
              description="Start one, share the link, and let everyone weigh in."
              action={
                <Button
                  onClick={() =>
                    billing?.atLimit
                      ? setPaywallOpen(true)
                      : navigate("/trips/new")
                  }
                >
                  <Plus />
                  New trip
                </Button>
              }
            />
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
