/**
 * The account screen: who you are, your saved Travel DNA, and how you sign in.
 *
 * Until this existed there was nowhere to see an answered quiz or to set a
 * password on an account created by magic link.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { travelDnaTraits, summariseTravelDna } from "@/lib/travelDna";
import AppShell from "@/components/AppShell";
import { PasskeySection } from "@/components/PasskeySection";
import { SetPasswordDialog } from "@/components/SetPasswordDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Compass,
  KeyRound,
  LogOut,
  Pencil,
  Sparkles,
  UtensilsCrossed,
  Accessibility,
} from "lucide-react";

function ProfileHeader() {
  const { user } = useAuth();
  const initial = user?.name?.charAt(0).toUpperCase() ?? "?";
  const joined = user?.createdAt ? new Date(user.createdAt) : null;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardContent className="p-4 flex items-center gap-4">
        <Avatar className="h-14 w-14 border">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          <AvatarFallback className="text-lg font-semibold">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="font-semibold text-lg truncate">
            {user?.name || "Traveler"}
          </h2>
          <p className="text-sm text-muted-foreground truncate">
            {user?.email || "No email on file"}
          </p>
          {joined && (
            <p className="text-xs text-muted-foreground mt-1">
              Member since{" "}
              {joined.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TravelDnaCard() {
  const [, navigate] = useLocation();
  const { data: dna, isLoading } = trpc.travelDna.get.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!dna) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-5 text-center space-y-3">
          <Sparkles className="h-8 w-8 text-primary mx-auto" />
          <div>
            <p className="text-sm font-medium">No Travel DNA yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Answer eight quick questions so Back To Travelling can match you
              with the right stays and settle group disagreements in your
              favour.
            </p>
          </div>
          <Button className="w-full gap-2" onClick={() => navigate("/quiz")}>
            <Compass className="h-4 w-4" /> Take the quiz
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = summariseTravelDna(dna as Record<string, unknown>);
  const updated = dna.updatedAt ? new Date(dna.updatedAt) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Travel DNA
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-primary"
          onClick={() => navigate("/quiz")}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      {summary && (
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{summary}</p>
              {updated && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Updated {updated.toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          {travelDnaTraits.map(trait => {
            const value = (dna as Record<string, unknown>)[trait.key];
            const score = typeof value === "number" ? value : 5;
            return (
              <div key={trait.key}>
                <div className="flex items-center gap-3 mb-1.5">
                  <trait.icon className={`h-4 w-4 ${trait.color}`} />
                  <span className="text-sm font-medium">{trait.title}</span>
                  <span className="ml-auto text-sm font-bold text-primary">
                    {score}/10
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(score / 10) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                  <span>{trait.low}</span>
                  <span>{trait.high}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {(dna.dietaryNeeds || dna.accessibilityNeeds) && (
        <Card className="border-border/50">
          <CardContent className="p-4 space-y-3">
            {dna.dietaryNeeds && (
              <div className="flex items-start gap-3">
                <UtensilsCrossed className="h-4 w-4 text-chart-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Dietary needs
                  </p>
                  <p className="text-sm mt-0.5">{dna.dietaryNeeds}</p>
                </div>
              </div>
            )}
            {dna.accessibilityNeeds && (
              <div className="flex items-start gap-3">
                <Accessibility className="h-4 w-4 text-chart-2 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Accessibility needs
                  </p>
                  <p className="text-sm mt-0.5">{dna.accessibilityNeeds}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SignInMethods() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { data } = trpc.auth.hasPassword.useQuery();
  const hasPassword = data?.hasPassword ?? false;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Sign-in &amp; security
      </h2>

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Password</h3>
                <Badge
                  variant="secondary"
                  className={
                    hasPassword
                      ? "text-[10px]"
                      : "text-[10px] bg-chart-4/10 text-chart-4"
                  }
                >
                  {hasPassword ? "Set" : "Not set"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {hasPassword
                  ? "You can sign in with your email and password on any device."
                  : "Your account signs in by emailed link. Set a password so you can always get in, even if that email is slow to arrive."}
              </p>
            </div>
          </div>
          <Button
            variant={hasPassword ? "outline" : "default"}
            className="w-full"
            onClick={() => setPasswordOpen(true)}
          >
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        </CardContent>
      </Card>

      <PasskeySection />

      <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

export default function Profile() {
  const { logout, loading } = useAuth({ redirectOnUnauthenticated: true });

  if (loading) {
    return (
      <AppShell title="Profile" showBack backHref="/">
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile" showBack backHref="/">
      <div className="px-4 py-4 space-y-6">
        <ProfileHeader />
        <TravelDnaCard />
        <SignInMethods />

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </AppShell>
  );
}
