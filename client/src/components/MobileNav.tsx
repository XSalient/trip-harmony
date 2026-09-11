import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Home, Plus, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Every tab is the same width, which is what lets the active pill be placed by
 * arithmetic instead of by measuring the DOM: `translateX(index * TAB_PITCH)`.
 * Keep them equal — a label long enough to stretch its tab breaks the slide.
 *
 * The two numbers are one decision. The tabs used to sit flush against each
 * other at 72px, which is what made the bar read as a packed strip rather than
 * four controls: the gradient "New trip" block touched its neighbours on both
 * sides, so there was no edge to tell them apart. The app-shell spec has always
 * asked for ≥8px between items (`design-system/pages/app-shell.md`) — this is
 * that gap, taken out of the tab width rather than added to the bar, so the
 * whole pill is *narrower* than before (292px against 296px) and still clears
 * a 320px screen with room either side.
 *
 * 64px keeps every target past the 44px minimum, and the longest label ("New
 * trip", ~42px at 10px) still has room. Anything that changes either number
 * changes the pitch, which is why the pill reads `TAB_PITCH` and not `TAB_W`.
 */
const TAB_W = 64;
const TAB_GAP = 8;
const TAB_PITCH = TAB_W + TAB_GAP;

/**
 * How far each filled shape sits inside its tab.
 *
 * The gap alone was not enough. Two of these tabs carry a *fill* — the active
 * pill and the gradient create chip — and they are adjacent, so at full tab
 * width the two blocks met across an 8px slot and the left half of the bar read
 * as one solid mass while the right half was bare icons. Insetting the fill
 * leaves the tap target at the full 64px and puts 20px of clear glass between
 * the two shapes (8 gap + 6 either side), which is what actually makes the bar
 * look like four controls.
 *
 * The create chip's fill is therefore an absolutely-positioned background,
 * exactly like the active pill, rather than a background on the link itself.
 * Both shapes are then the same size and inset by the same rule.
 */
const FILL_INSET = 4;
const FILL_W = TAB_W - FILL_INSET * 2;

export default function MobileNav() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  // This bar is on every authenticated screen, so its poll is the app's steady
  // background load — and it competes for the same few database connections as
  // whatever the person is actually waiting for. A minute is soon enough for a
  // badge, and a tab nobody is looking at does not need one at all.
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
    }
  );

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/trips/new", icon: Plus, label: "New trip", create: true },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  const activeIndex = navItems.findIndex(item =>
    item.href === "/" ? location === "/" : location.startsWith(item.href)
  );

  // The pill only slides between tabs it has already been on. Animating it in
  // from the left edge on first paint would read as a loading artefact, so the
  // first position is taken without a transition.
  const [ready, setReady] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    if (activeIndex < 0 || seen.current) return;
    seen.current = true;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [activeIndex]);

  if (!isAuthenticated) return null;

  return (
    // A floating glass pill rather than a full-width slab: it reads as a
    // control sitting above the content instead of a border welded to the
    // bottom of the page, and it keeps every target inside the thumb arc.
    // `pointer-events-none` on the wrapper so the gap either side of the pill
    // does not swallow taps meant for the content behind it.
    <nav
      aria-label="Primary"
      className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50"
    >
      <div
        // `p-1.5` rather than `p-1`: at 4px the 48px tabs — the filled create
        // one especially — sat almost on the glass edge, so the bar looked like
        // its contents had been pushed into it. The extra 2px a side is also
        // what `--nav-height` accounts for; the two move together.
        className="glass pointer-events-auto relative mx-auto mb-2 flex w-fit items-center rounded-full p-1.5 shadow-e3"
        style={{ gap: TAB_GAP }}
      >
        {/* The active pill is one element that moves, not four that blink on
            and off. Following the thumb from tab to tab is the difference
            between a tab bar and four links (MASTER §7 `continuity`). */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className={cn(
              "bg-primary/15 absolute left-1.5 top-1.5 bottom-1.5 rounded-xl",
              ready &&
                "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            )}
            style={{
              width: FILL_W,
              // Pitch, not width: the gap between tabs is part of the step.
              // The inset is added once here rather than baked into `left-1.5`,
              // so the pill and the create chip cannot drift apart.
              transform: `translateX(${activeIndex * TAB_PITCH + FILL_INSET}px)`,
            }}
          />
        )}

        {navItems.map((item, i) => {
          const isActive = i === activeIndex;

          return (
            <Link key={item.href} href={item.href} asChild>
              <a
                onClick={() => {
                  if (!isActive) haptic("select");
                }}
                aria-current={isActive ? "page" : undefined}
                aria-label={
                  item.badge && item.badge > 0
                    ? `${item.label}, ${item.badge} unread`
                    : item.label
                }
                className={cn(
                  // >=44px in both directions, comfortably inside the thumb arc.
                  "relative z-10 flex min-h-12 flex-col items-center justify-center gap-1 rounded-full py-1.5",
                  "touch-manipulation transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  // Fill + colour + weight, so the active tab never depends on
                  // colour alone.
                  // The create action is the raised, gradient one — the same
                  // emphasis a centre FAB gives, without moving it in the bar.
                  item.create
                    ? "text-primary-foreground"
                    : isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                )}
                style={{ width: TAB_W }}
              >
                {/* The create action's fill, inset to match the active pill.
                    A background on the link itself would be 64px wide and would
                    collide with whatever fill sits beside it. */}
                {item.create && (
                  <span
                    aria-hidden
                    className="grad-brand absolute inset-y-0 rounded-xl shadow-e2"
                    style={{ left: FILL_INSET, right: FILL_INSET }}
                  />
                )}
                <span className="relative z-10">
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                      isActive && "-translate-y-px scale-110 stroke-[2.5px]"
                    )}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="tabular animate-rise absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    // Never wrap: a label that breaks onto a second line makes
                    // one tab taller than the rest, and the pill is positioned
                    // on the assumption that they match.
                    "relative z-10 whitespace-nowrap text-[10px]",
                    isActive ? "font-semibold" : "font-medium"
                  )}
                >
                  {item.label}
                </span>
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
