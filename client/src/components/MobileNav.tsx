import { useLocation, Link } from "wouter";
import { Home, Plus, Bell, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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

  if (!isAuthenticated) return null;

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/trips/new", icon: Plus, label: "New Trip" },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/60 safe-area-bottom">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-around px-2">
        {navItems.map(item => {
          const isActive =
            item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-2xl transition-all relative ${isActive ? "bg-secondary text-primary" : "text-muted-foreground"}`}
              >
                <div className="relative">
                  <item.icon
                    className={`h-5 w-5 ${isActive ? "stroke-[2.5px]" : ""}`}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 bg-danger-strong text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </div>
                <span
                  className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}
                >
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
