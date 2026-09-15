import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoBack, isBehind } from "@/lib/navigationDepth";
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
   * Go **up** — to the screen `backHref` names, which is this one's parent in
   * the app rather than whatever the browser happens to have behind it.
   *
   * This used to be `history.back()` whenever there was anything to go back
   * to, which is a different question. Open a trip's accommodations from a
   * notification and the entry behind you is the notifications list, so the
   * arrow beside the word "Accommodations" took you sideways; walk in and out
   * of two sections and it retraced the walk instead of climbing out of it.
   *
   * Popping is still what happens in the ordinary case, because it is how the
   * stack stays honest: when the entry behind us *is* the parent — the usual
   * trip page → section → back — `history.back()` unwinds rather than growing
   * the stack, and scroll restoration gets its entry back.
   *
   * Otherwise the parent replaces the current entry rather than being pushed
   * on top of it. A back arrow that pushes is how this went wrong the first
   * time: the screen you just left sits in front of you and the browser's own
   * back button walks straight into it.
   */
  const goBack = () => {
    if (isBehind(backHref)) {
      window.history.back();
      return;
    }
    if (backHref) {
      navigate(backHref, { replace: true });
      return;
    }
    // No parent named — nothing to climb to, so unwind if we can.
    if (canGoBack()) window.history.back();
  };

  return (
    // `screen-forward` gives each screen an entrance. It lives here rather
    // than around the router because AppShell remounts on every route change,
    // so the animation cannot fail to fire; a wrapper above the router has to
    // observe navigation, and doing that reliably means racing wouter's own
    // location subscription.
    <div className="screen-forward min-h-dvh bg-background flex flex-col">
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
      <main
        className={cn("mx-auto w-full max-w-2xl flex-1", !hideNav && "pb-nav")}
      >
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
