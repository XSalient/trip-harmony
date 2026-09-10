import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSessionSwitch } from "@/_core/hooks/useAuth";
import { rememberSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEMO_PERSONAS } from "@shared/demo";

/**
 * Pick a seat in the demo and be inside the app, with nothing typed.
 *
 * The three seats are the permission model made visible: the same trip seen as
 * the person who runs it, as someone who only votes, and as someone who is
 * merely watching. It is a better explanation than the pricing page's would be.
 */
export default function DemoSeatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState<string | null>(null);
  const demoSignIn = trpc.auth.demoSignIn.useMutation();
  const switchSession = useSessionSwitch();

  const take = async (persona: string) => {
    setPending(persona);
    try {
      const result = await demoSignIn.mutateAsync({ persona });
      await rememberSession(result);
      // The seats are meant to be tried one after another, so this is the one
      // screen where a stale cache is guaranteed rather than unlikely: without
      // the clear, Nina's first paint is whatever Ava was looking at.
      await switchSession();
      onOpenChange(false);
      navigate("/");
    } catch {
      toast.error("The demo isn't available on this deployment.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Look around as…</DialogTitle>
          <DialogDescription>
            A real group trip, mid-argument. Pick a seat — nothing to sign up
            for, and you can switch later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {DEMO_PERSONAS.map(persona => (
            <button
              key={persona.key}
              onClick={() => take(persona.key)}
              disabled={pending !== null}
              className="w-full text-left rounded-xl border border-border/70 p-4 transition hover:border-primary hover:bg-accent/40 disabled:opacity-60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{persona.name}</span>
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {persona.role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pending === persona.key ? "Opening…" : persona.blurb}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Everyone in the demo is invented. Nothing you do here reaches a real
          person.
        </p>
      </DialogContent>
    </Dialog>
  );
}
