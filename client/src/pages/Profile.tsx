/**
 * The account screen: who you are and how you sign in.
 *
 * Until this existed there was nowhere to set a password on an account created
 * by magic link.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import { PasskeySection } from "@/components/PasskeySection";
import { SetPasswordDialog } from "@/components/SetPasswordDialog";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { BlockedSection } from "@/components/BlockedSection";
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
  const { user, logout, loading } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const [, navigate] = useLocation();
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    </AppShell>
  );
}
