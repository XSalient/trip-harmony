import { ReactNode } from "react";
import { useLocation, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoBack } from "@/lib/navigationDepth";
import MobileNav from "./MobileNav";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backHref?: string;
  headerRight?: ReactNode;
  hideNav?: boolean;
}

export default function AppShell({
  children,
  title,
  showBack,
  backHref,
  headerRight,
  hideNav,
}: AppShellProps) {
  const [, navigate] = useLocation();

  /**
   * Unwind history where there is history to unwind; fall back to `backHref`
   * where there is not.
   *
   * This used to be `navigate(backHref)` unconditionally, which pushes — so
   * backing out of a screen left the screen you backed out of sitting in front
   * of you in the history stack, and the browser's back button walked into it.
   * `backHref` is passed on every screen, so the fallback was unreachable and
   * the stack only ever grew.
   *
   * The fallback replaces rather than pushes for the same reason: arriving by
   * deep link and pressing back should not leave the trip page behind you.
   */
  const goBack = () => {
    if (canGoBack()) {
      window.history.back();
      return;
    }
    if (backHref) navigate(backHref, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {title && (
        /* The brand gradient, on every screen that has a header. Its contents
           sit on violet rather than on card white, so the controls inside it —
           including whatever `headerRight` passes — are forced to white here
           rather than each caller having to remember. */
        <header className="sticky top-0 z-40 bg-gradient-to-br from-brand-from to-brand-to text-white shadow-sm">
          <div className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-5">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 -ml-1 h-9 w-9 rounded-xl bg-white/15 text-white hover:bg-white/25 hover:text-white"
                onClick={goBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-semibold truncate flex-1">{title}</h1>
            {headerRight && (
              <div className="ml-2 [&_button]:text-white [&_button:hover]:bg-white/20 [&_button:hover]:text-white">
                {headerRight}
              </div>
            )}
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-2xl flex-1 pb-24">{children}</main>
      {!hideNav && <MobileNav />}
    </div>
  );
}
