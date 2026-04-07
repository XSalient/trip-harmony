import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MagicLinkVerify() {
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const calledRef = useRef(false);
  const utils = trpc.useUtils();

  const verifyMutation = trpc.auth.verifyMagicLink.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      setTimeout(() => navigate("/"), 1500);
    },
  });

  useEffect(() => {
    if (params.token && !calledRef.current) {
      calledRef.current = true;
      verifyMutation.mutate({ token: params.token });
    }
  }, [params.token]);

  const isPending = verifyMutation.isPending;
  const isSuccess = verifyMutation.isSuccess;
  const isError = verifyMutation.isError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-sm w-full">
        {isPending && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Signing you in…</h2>
            <p className="text-muted-foreground text-sm">Just a moment while we verify your link.</p>
          </>
        )}
        {isSuccess && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold">You're in!</h2>
            <p className="text-muted-foreground text-sm">Redirecting you to your dashboard…</p>
          </>
        )}
        {isError && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Link expired or invalid</h2>
            <p className="text-muted-foreground text-sm">{verifyMutation.error?.message ?? "This magic link may have already been used or expired."}</p>
            <Button onClick={() => navigate("/")} className="mt-2">Back to Home</Button>
          </>
        )}
      </div>
    </div>
  );
}
