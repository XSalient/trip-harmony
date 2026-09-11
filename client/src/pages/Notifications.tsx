import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { EmptyState } from "@/components/harmony";
import { useLocation } from "wouter";
import { relativeTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  Mail,
  Vote,
  DollarSign,
  Handshake,
  ArrowRightLeft,
  Bot,
  Info,
} from "lucide-react";

const typeIcons: Record<string, any> = {
  invite: Mail,
  vote_request: Vote,
  budget_alert: DollarSign,
  consensus: Handshake,
  phase_change: ArrowRightLeft,
  referee: Bot,
  general: Info,
};

const typeColors: Record<string, string> = {
  invite: "bg-cat-1-soft text-cat-1-on-soft",
  vote_request: "bg-cat-4-soft text-cat-4-on-soft",
  budget_alert: "bg-danger-soft text-danger-on-soft",
  consensus: "bg-success-soft text-success-on-soft",
  phase_change: "bg-warning-soft text-warning-on-soft",
  referee: "bg-primary/10 text-primary",
  general: "bg-muted text-muted-foreground",
};

export default function Notifications() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();

  const { data: notifications, isLoading } = trpc.notifications.list.useQuery();
  const markReadMutation = trpc.notifications.markRead.useMutation();
  const markAllMutation = trpc.notifications.markAllRead.useMutation();
  const utils = trpc.useUtils();

  const handleMarkRead = async (id: number) => {
    try {
      await markReadMutation.mutateAsync({ id });
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    } catch {
      /* silent */
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllMutation.mutateAsync();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("All marked as read");
    } catch {
      toast.error("Failed");
    }
  };

  const handleClick = (notif: any) => {
    if (!notif.read) handleMarkRead(notif.id);
    if (notif.tripId) navigate(`/trips/${notif.tripId}`);
  };

  const unreadCount = notifications?.filter((n: any) => !n.read).length || 0;

  return (
    <AppShell
      title="Notifications"
      showBack
      backHref="/"
      headerRight={
        unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={handleMarkAll}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Read all
          </Button>
        ) : null
      }
    >
      <div className="space-y-2 px-4 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notif: any, i: number) => {
            const Icon = typeIcons[notif.type] || Info;
            const colorClass =
              typeColors[notif.type] || "bg-muted text-muted-foreground";
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                style={{ "--i": i } as React.CSSProperties}
                // Unread is carried by a spine and the title weight, not by a
                // 2% tint nobody can see and a dot the size of a full stop.
                className={`stagger-item pressable-lg relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3 pl-4 text-left shadow-e1 transition-shadow hover:shadow-e2 ${
                  notif.read ? "" : "border-primary/25"
                }`}
              >
                {!notif.read && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary"
                  />
                )}
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${colorClass} ${notif.read ? "opacity-60" : ""}`}
                >
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`min-w-0 flex-1 truncate text-[15px] tracking-tight ${notif.read ? "font-medium text-muted-foreground" : "font-semibold"}`}
                    >
                      {notif.title}
                    </span>
                    <span className="tabular shrink-0 text-[12px] text-muted-foreground">
                      {relativeTime(notif.createdAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">
                    {notif.message}
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <EmptyState
            icon={BellOff}
            title="You're all caught up"
            description="Votes, invites and budget alerts land here as your trips move along."
          />
        )}
      </div>
    </AppShell>
  );
}
