import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { AuthDialog } from "@/components/AuthDialog";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Users, MapPin, LogIn } from "lucide-react";
import { useState, useEffect } from "react";

export default function JoinTrip() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [autoJoinPending, setAutoJoinPending] = useState(false);

  const { data: trip, isLoading } = trpc.trips.getByInviteCode.useQuery(
    { code: params.code || "" },
    { enabled: !!params.code }
  );
  const joinMutation = trpc.trips.join.useMutation();

  const handleJoin = async () => {
    if (!params.code) return;
    try {
      const result = await joinMutation.mutateAsync({ inviteCode: params.code });
      toast.success("You've joined the trip!");
      navigate(`/trips/${result.tripId}`);
    } catch {
      toast.error("Failed to join trip");
    }
  };

  useEffect(() => {
    if (autoJoinPending && user && !authLoading) {
      setAutoJoinPending(false);
      handleJoin();
    }
  }, [user, authLoading, autoJoinPending]);

  const handleAuthSuccess = () => {
    setAuthOpen(false);
    setAutoJoinPending(true);
  };

  if (isLoading || authLoading) {
    return (
      <AppShell title="Join Trip" showBack backHref="/">
        <div className="p-4"><Skeleton className="h-40 rounded-xl" /></div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell title="Join Trip" showBack backHref="/">
        <div className="p-8 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Trip not found or invite link is invalid.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Join Trip" showBack backHref="/">
      <div className="px-4 py-6 space-y-6">
        <Card className="border-primary/20">
          <CardContent className="p-6 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">{trip.name}</h2>
            {trip.description && <p className="text-sm text-muted-foreground mt-2">{trip.description}</p>}
          </CardContent>
        </Card>

        {user ? (
          <Button
            onClick={handleJoin}
            className="w-full h-12 rounded-xl text-base font-semibold"
            disabled={joinMutation.isPending}
          >
            {joinMutation.isPending ? "Joining…" : "Join This Trip"}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">Sign in to join this trip</p>
            <Button
              onClick={() => setAuthOpen(true)}
              className="w-full h-12 rounded-xl text-base font-semibold gap-2"
            >
              <LogIn className="h-5 w-5" /> Sign In & Join Trip
            </Button>
          </div>
        )}
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onSuccess={handleAuthSuccess} />
    </AppShell>
  );
}
