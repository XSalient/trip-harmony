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
import { Badge } from "@/components/ui/badge";
import { Flag, RotateCcw } from "lucide-react";

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

/**
 * The moderation queue.
 *
 * Apple's guideline 1.2 wants reported content to reach somebody. This is that
 * somebody's screen — app admins only, enforced by `adminProcedure` on every
 * procedure it calls, not by this page choosing what to draw.
 *
 * Resolving a report closes the report, not the content: deleting a comment or
 * removing a member stays with the endpoints that already authorise those, so
 * this screen cannot become a second way to do them with different rules.
 */
function ReportQueueCard() {
  const utils = trpc.useUtils();
  const { data: reports, isLoading } = trpc.moderation.queue.useQuery();

  const resolve = trpc.moderation.resolve.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.moderation.queue.invalidate(),
        utils.moderation.openCount.invalidate(),
      ]);
    },
    onError: err => toast.error(err.message),
  });

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Reports</h3>
          </div>
          {reports && reports.length > 0 && (
            <Badge variant="secondary">{reports.length} open</Badge>
          )}
        </div>

        {isLoading ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : !reports || reports.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing reported. This is the good state.
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {r.reason}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.contentType} #{r.contentId}
                    {r.tripId ? ` · trip ${r.tripId}` : ""}
                  </span>
                </div>
                {r.note && (
                  <p className="text-xs text-foreground/80 break-words">
                    “{r.note}”
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Reported by {r.reporter?.name || `user ${r.reporterUserId}`} ·{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={resolve.isPending}
                    onClick={() =>
                      resolve.mutate({ id: r.id, status: "dismissed" })
                    }
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    disabled={resolve.isPending}
                    onClick={() =>
                      resolve.mutate({ id: r.id, status: "actioned" })
                    }
                  >
                    Mark actioned
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
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
        <ReportQueueCard />
        <DemoResetCard />
      </div>
    </AppShell>
  );
}
