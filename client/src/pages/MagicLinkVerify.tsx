import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { CheckCircle2, Home, Loader2, MailWarning } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { rememberSession } from "@/lib/session";
import { useSessionSwitch } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/AuthDialog";
import { StatusScreen } from "@/components/harmony";

const REDIRECT_MS = 1500;

/**
 * One of only two screens that bypass AppShell, which makes it the check that
 * tokens and safe areas reach the shell-less code path too.
 *
 * The three states now share one shape — the same StatusScreen the 404 uses —
 * rather than three ad-hoc stacks. Behaviour is unchanged: the same mutation,
 * the same session switch, and the same two routes out of an expired link.
 */
export default function MagicLinkVerify() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const calledRef = useRef(false);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [authOpen, setAuthOpen] = useState(false);
  const [startWithPassword, setStartWithPassword] = useState(false);
  const switchSession = useSessionSwitch();

  const verifyMutation = trpc.auth.verifyMagicLink.useMutation({
    onSuccess: async result => {
      await rememberSession(result);
      // A magic link can land in a tab that is already signed in as somebody
      // else — it is the likeliest place for that to happen, in fact.
      await switchSession();
      redirectRef.current = setTimeout(() => navigate("/"), REDIRECT_MS);
    },
  });

  useEffect(() => {
    if (params.token && !calledRef.current) {
      calledRef.current = true;
      verifyMutation.mutate({ token: params.token });
    }
  }, [params.token]);

  // Leaving before the redirect fires must not navigate afterwards.
  useEffect(() => () => clearTimeout(redirectRef.current), []);

  const goHomeNow = () => {
    clearTimeout(redirectRef.current);
    navigate("/");
  };

  const dialog = (
    <AuthDialog
      open={authOpen}
      onOpenChange={setAuthOpen}
      onSuccess={() => {
        setAuthOpen(false);
        navigate("/");
      }}
      startWithPassword={startWithPassword}
    />
  );

  if (verifyMutation.isError) {
    return (
      <>
        <StatusScreen
          icon={MailWarning}
          tone="danger"
          title="This magic link has expired"
          description="Magic links expire after 15 minutes for your security, and each one can only be used once."
          action={
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setStartWithPassword(false);
                setAuthOpen(true);
              }}
            >
              Request a new link
            </Button>
          }
          secondaryAction={
            <>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => {
                  setStartWithPassword(true);
                  setAuthOpen(true);
                }}
              >
                Enter password to log in
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                Back to home
              </Button>
            </>
          }
        />
        {dialog}
      </>
    );
  }

  if (verifyMutation.isSuccess) {
    return (
      <>
        <StatusScreen
          icon={CheckCircle2}
          tone="success"
          title="You're signed in"
          description="Taking you to your trips…"
          action={
            <Button size="lg" className="w-full" onClick={goHomeNow}>
              <Home />
              Continue
            </Button>
          }
        />
        {dialog}
      </>
    );
  }

  return (
    <StatusScreen
      icon={Loader2}
      spinning
      tone="info"
      title="Signing you in…"
      description="Just a moment while we verify your link."
    />
  );
}
