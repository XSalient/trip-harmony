/**
 * The app-admin screen. Not trip administration — that is a role held per trip,
 * on the members page. This is `users.role === "admin"`, held by a person.
 *
 * It exists so that resetting the demo does not require a terminal. Restoring
 * it used to mean a developer machine with open Postgres egress, a secret
 * manager login and the right branch checked out; the demo is meant to be
 * clicked about before a call, so putting it back should cost one click too.
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import NotFound from "@/pages/NotFound";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

function DemoResetCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const utils = trpc.useUtils();

  const reset = trpc.admin.resetDemo.useMutation({
    onSuccess: async result => {
      // The trip list is the first thing an admin looks at afterwards, and it
      // is now showing trips that no longer exist.
      await utils.trips.invalidate();
      toast.success(
        `Demo rebuilt: ${result.trips.length} trips, ${result.people} people.`
      );
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold">Demo data</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Puts the three demo trips back exactly as they were seeded. Use it
            after a prospect has clicked around, or before recording.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={reset.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <RotateCcw className="h-4 w-4" />
          {reset.isPending ? "Rebuilding…" : "Reset demo data"}
        </Button>

        <p className="text-xs text-muted-foreground">
          Only the demo is touched. Real accounts and real trips are never read
          or written.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the demo?</AlertDialogTitle>
            <AlertDialogDescription>
              Every vote, comment and change made in the demo since it was last
              seeded will be discarded, and the three trips rebuilt from the
              story. It takes a few seconds. Nothing outside the demo is
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reset.mutate()}>
              Reset it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function Admin() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });

  if (loading) {
    return (
      <AppShell title="Admin" showBack backHref="/profile">
        <div className="p-4">
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </AppShell>
    );
  }

  // Renders as though the route does not exist, rather than as a locked door.
  // The server is the actual guard — `adminProcedure` refuses the mutation
  // regardless of what the client chooses to draw.
  if (user?.role !== "admin") return <NotFound />;

  return (
    <AppShell title="Admin" showBack backHref="/profile">
      <div className="px-4 py-4 space-y-6">
        <DemoResetCard />
      </div>
    </AppShell>
  );
}
