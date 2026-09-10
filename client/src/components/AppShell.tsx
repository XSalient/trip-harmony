import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoBack } from "@/lib/navigationDepth";
import { cn } from "@/lib/utils";
import MobileNav from "./MobileNav";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backHref?: string;
  headerRight?: ReactNode;
  hideNav?: boolean;
  /**
   * Opt-in large title that collapses into the bar on scroll. Additive — a
   * screen that does not pass it renders exactly as before.
   */
  largeTitle?: boolean;
  /** Subtitle/meta rendered under the large title while it is expanded. */
  headerBelow?: ReactNode;
}

/** Scroll distance after which the compact bar takes over. */
const COLLAPSE_AT = 28;

export default function AppShell({
  children,
  title,
  showBack,
  backHref,
  headerRight,
  hideNav,
  largeTitle,
  headerBelow,
}: AppShellProps) {
  const [, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!largeTitle) return;
    const onScroll = () => setCollapsed(window.scrollY > COLLAPSE_AT);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [largeTitle]);

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
    <div className="min-h-dvh bg-background flex flex-col">
      {/* `safe-area-top` keeps the title clear of the notch: the WebView draws
          under the status bar, so without it the header sits behind the clock.
          Zero on the web and on a phone without one.

          Glass rather than a flat bar: there is content scrolling behind this,
          which is the one thing blur is allowed to signal. */}
      {title && (
        <header
          className={cn(
            "glass-flat safe-area-top sticky top-0 z-40",
            "border-b transition-colors duration-200",
            largeTitle && !collapsed ? "border-transparent" : "border-border/60"
          )}
        >
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-4 sm:px-5">
            {showBack && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Go back"
                className="-ml-2 shrink-0"
                onClick={goBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <h1
              className={cn(
                "flex-1 truncate font-display text-lg font-bold tracking-tight transition-opacity duration-200",
                // The same words are never shown twice: while the large title
                // is on screen, the bar's copy is hidden.
                largeTitle && !collapsed && "opacity-0"
              )}
            >
              {title}
            </h1>
            {headerRight && <div className="ml-1 shrink-0">{headerRight}</div>}
          </div>
        </header>
      )}

      {/* pb-nav resolves to the nav height plus the safe-area inset from one
          token, so no screen has to guess it. */}
      <main className={cn("mx-auto w-full max-w-2xl flex-1", !hideNav && "pb-nav")}>
        {largeTitle && title && (
          <div className="px-4 pb-1 pt-2 sm:px-5">
            <h2 className="font-display text-[28px] font-extrabold leading-tight tracking-tight">
              {title}
            </h2>
            {headerBelow}
          </div>
        )}
        {children}
      </main>

      {!hideNav && <MobileNav />}
    </div>
  );
}
