import { useAuth } from "@/_core/hooks/useAuth";
import { useTripRole } from "@/_core/hooks/useTripRole";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { AuthDialog } from "@/components/AuthDialog";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import { Users, MapPin, LogIn, Clock, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import { INVITE_LINK_CLOSED_MESSAGE } from "@shared/inviteLink";

/** What the screen is showing once the join has been answered. */
type Outcome =
  | { kind: "declined" }
  | { kind: "pending"; reason: "link" | "wrong-address" | null };

export default function JoinTrip() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams<{ code: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [autoJoinPending, setAutoJoinPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // An emailed invite carries a token on top of the trip's shared code. It is
  // what sets the invited role and records that they came by email rather than
  // by following a link someone forwarded.
  const inviteToken = new URLSearchParams(search).get("invite") || undefined;

  const { data: trip, isLoading } = trpc.trips.getByInviteCode.useQuery(
    { code: params.code || "" },
    { enabled: !!params.code }
  );
  // Where this person already stands with the trip, so somebody coming back to
  // the link is told what happened rather than being offered the button again.
  //
  // Only once signed in: this screen answers for a visitor who is not, and a
  // protected query from here comes back unauthorised — which the global error
  // subscriber reads as a session that has ended and bounces to the landing
  // page, taking the invitation with it.
  const { status: membership } = useTripRole(user ? (trip?.id ?? 0) : 0);
  const joinMutation = trpc.trips.join.useMutation();
  const declineMutation = trpc.trips.declineInvite.useMutation();

  const handleJoin = async () => {
    if (!params.code) return;
    try {
      const result = await joinMutation.mutateAsync({
        inviteCode: params.code,
        inviteToken,
      });
      if (result.status === "accepted") {
        toast.success("You've joined the trip!");
        navigate(`/trips/${result.tripId}`);
        return;
      }
      // A shared link is a request now, so there is nowhere to navigate to —
      // the trip refuses every screen until an admin says yes.
      setOutcome({ kind: "pending", reason: result.reason ?? "link" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to join trip");
    }
  };

  const handleDecline = async () => {
    if (!inviteToken) return;
    try {
      await declineMutation.mutateAsync({ inviteToken });
      setOutcome({ kind: "declined" });
    } catch (e: any) {
      toast.error(e?.message || "Couldn't record that.");
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
        <div className="p-4">
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell title="Join Trip" showBack backHref="/">
        <div className="p-8 text-center">
          <MapPin className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">
            Trip not found or invite link is invalid.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/")}
          >
            Go Home
          </Button>
        </div>
      </AppShell>
    );
  }

  /** Waiting on an admin — just asked, or asked on an earlier visit. */
  const waiting =
    outcome?.kind === "pending" || (!outcome && membership === "pending");

  /**
   * A link that is switched off, used up or past its date. The trip says so
   * before the button rather than after it: offering a control that cannot
   * work, and explaining afterwards, reads as a broken app rather than a
   * closed link. An emailed invitation is a different door and is not affected
   * by the trip's link settings, so it keeps its button.
   */
  const linkClosed = !trip.linkOpen && !inviteToken;

  return (
    <AppShell title="Join Trip" showBack backHref="/">
      <div className="px-4 py-6 space-y-6">
        <Card className="border-primary/20">
          <CardContent className="p-6 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold">{trip.name}</h2>
            {trip.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {trip.description}
              </p>
            )}
          </CardContent>
        </Card>

        {outcome?.kind === "declined" ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              You've declined this invite. Nothing was shared with the group
              beyond letting them know.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </div>
        ) : waiting ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Clock className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">
              Your request is with the trip's admins.
            </p>
            <p className="text-sm text-muted-foreground">
              {outcome?.kind === "pending" && outcome.reason === "wrong-address"
                ? "This invitation was sent to a different email address, so it couldn't let you straight in. An admin can still add you."
                : "An invite link asks to join rather than joining outright, so somebody on the trip has to say yes. You'll be notified either way."}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </div>
        ) : membership === "accepted" ? (
          <Button
            className="w-full h-12 rounded-xl text-base font-semibold"
            onClick={() => navigate(`/trips/${trip.id}`)}
          >
            You're already on this trip — open it
          </Button>
        ) : linkClosed ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground">
              {INVITE_LINK_CLOSED_MESSAGE}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </div>
        ) : user ? (
          <div className="space-y-3">
            <Button
              onClick={handleJoin}
              className="w-full h-12 rounded-xl text-base font-semibold"
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending
                ? "Joining…"
                : inviteToken || trip.openToAnyone
                  ? "Accept invitation"
                  : "Ask to join"}
            </Button>
            {/* Declining only means something for a personal invite; a shared
                link has nobody waiting on an answer. */}
            {inviteToken && (
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleDecline}
                disabled={declineMutation.isPending}
              >
                No thanks
              </Button>
            )}
            {!inviteToken && !trip.openToAnyone && (
              <p className="text-center text-xs text-muted-foreground">
                An admin approves everyone who arrives by link.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Sign in to join this trip
            </p>
            <Button
              onClick={() => setAuthOpen(true)}
              className="w-full h-12 rounded-xl text-base font-semibold gap-2"
            >
              <LogIn className="h-5 w-5" /> Sign In & Join Trip
            </Button>
          </div>
        )}
      </div>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={handleAuthSuccess}
      />
    </AppShell>
  );
}
