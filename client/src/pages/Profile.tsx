/**
 * The account screen: who you are and how you sign in.
 *
 * Until this existed there was nowhere to set a password on an account created
 * by magic link.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import { SectionHead } from "@/components/harmony";
import { PasskeySection } from "@/components/PasskeySection";
import { SetPasswordDialog } from "@/components/SetPasswordDialog";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { BlockedSection } from "@/components/BlockedSection";
import { PlanSection } from "@/components/PlanSection";
import { PaywallDialog } from "@/components/PaywallDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound, LogOut, Shield, Trash2 } from "lucide-react";

function ProfileHeader() {
  const { user } = useAuth();
  const initial = user?.name?.charAt(0).toUpperCase() ?? "?";
  const joined = user?.createdAt ? new Date(user.createdAt) : null;

  return (
    <Card className="rounded-2xl border-primary/20 bg-gradient-to-br from-primary/8 to-accent/8 shadow-e1">
      <CardContent className="flex items-center gap-4 p-4">
        <Avatar className="size-14 border-0">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
          {/* The same medallion the member roster uses, so a person looks like
              a person on both screens rather than a grey disc on one. */}
          <AvatarFallback className="bg-primary/12 text-xl font-semibold text-primary">
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

function SignInMethods() {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { data } = trpc.auth.hasPassword.useQuery();
  const hasPassword = data?.hasPassword ?? false;

  return (
    <div className="space-y-3">
      <SectionHead title="Sign-in & security" />

      <Card className="border-border/70">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-cat-1-soft text-cat-1-on-soft">
              <KeyRound className="size-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Password</h3>
                <Badge
                  className={`rounded-md border-0 px-1.5 text-[11px] font-semibold ${
                    hasPassword
                      ? "bg-success-soft text-success-on-soft"
                      : "bg-muted text-muted-foreground"
                  }`}
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
  const { user, logout, loading } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const [, navigate] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

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
        <PlanSection onUpgrade={() => setPaywallOpen(true)} />
        <SignInMethods />
        <BlockedSection />

        {/* App admins only, and only a way in — the destructive part lives on
            its own screen rather than on a page every user visits. */}
        {user?.role === "admin" && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => navigate("/admin")}
          >
            <Shield className="h-4 w-4" /> Admin
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>

        <div className="flex justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>

        {/* Last, and visually quietest — reachable without hunting for it,
            which is what review checks, but not sitting next to "Sign out"
            waiting to be hit by mistake. */}
        <div className="pt-2 border-t">
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors py-2 inline-flex items-center justify-center gap-1.5"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete my account
          </button>
        </div>
      </div>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
      <PaywallDialog open={paywallOpen} onOpenChange={setPaywallOpen} />
    </AppShell>
  );
}
