/**
 * What this account is on, and where to change it.
 *
 * Apple requires an app selling a subscription to show what somebody has bought
 * and to link them somewhere they can manage it — and the only place a
 * subscription can actually be cancelled is the store that sold it, not here.
 * Pretending otherwise is how apps end up accused of making cancellation hard.
 *
 * Hidden entirely on a deployment that is not charging anybody, because a "Free
 * plan" card on an app with nothing to buy is just noise.
 */
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

/** Where each store lets somebody manage what they bought. */
const MANAGE_URL: Record<string, string | undefined> = {
  app_store: "https://apps.apple.com/account/subscriptions",
  play_store: "https://play.google.com/store/account/subscriptions",
};

export function PlanSection({ onUpgrade }: { onUpgrade: () => void }) {
  const { data, isLoading } = trpc.billing.status.useQuery();

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  // Nothing is being charged for on this deployment; there is no plan to show.
  if (!data?.enforced) return null;

  const sub = data.subscription;
  const manageUrl = sub ? MANAGE_URL[sub.store] : undefined;

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Plan</h3>
          </div>
          <Badge variant={data.entitled ? "default" : "secondary"}>
            {data.entitled ? "Subscribed" : "Free"}
          </Badge>
        </div>

        {sub ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {/* The store's own word for the state, softened into English. A
                billing issue still entitles, so it must not read as "cut off". */}
            {sub.status === "billing_issue" && (
              <p className="text-destructive">
                Your last payment didn't go through. You still have access while
                the store retries.
              </p>
            )}
            {sub.cancelledAt && (
              <p>
                Set not to renew. Access continues until it expires — you have
                not lost anything yet.
              </p>
            )}
            {sub.expiresAt && (
              <p>
                {sub.cancelledAt ? "Ends" : "Renews"}{" "}
                {new Date(sub.expiresAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            You're organising {data.activeTrips} of {data.freeLimit}{" "}
            {data.freeLimit === 1 ? "trip" : "trips"}. Being invited to someone
            else's is always free.
          </p>
        )}

        {data.entitled ? (
          manageUrl && (
            <Button variant="outline" size="sm" className="w-full" asChild>
              {/* The store is the only place this can be cancelled. Linking
                  there is the honest thing and Apple requires it. */}
              <a href={manageUrl} target="_blank" rel="noreferrer">
                Manage in the{" "}
                {sub?.store === "app_store" ? "App Store" : "Play Store"}
              </a>
            </Button>
          )
        ) : (
          <Button size="sm" className="w-full" onClick={onUpgrade}>
            See what's included
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
