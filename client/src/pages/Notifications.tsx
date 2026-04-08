import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AppShell from "@/components/AppShell";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Bell, BellOff, CheckCheck, Mail, Vote, DollarSign,
  Handshake, ArrowRightLeft, Bot, Info
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
  invite: "bg-blue-100 text-blue-700",
  vote_request: "bg-purple-100 text-purple-700",
  budget_alert: "bg-red-100 text-red-600",
  consensus: "bg-green-100 text-green-700",
  phase_change: "bg-yellow-100 text-yellow-700",
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
    } catch { /* silent */ }
  };

  const handleMarkAll = async () => {
    try {
      await markAllMutation.mutateAsync();
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("All marked as read");
    } catch { toast.error("Failed"); }
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
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleMarkAll}>
            <CheckCheck className="h-3.5 w-3.5" /> Read all
          </Button>
        ) : null
      }
    >
      <div className="px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notif: any) => {
            const Icon = typeIcons[notif.type] || Info;
            const colorClass = typeColors[notif.type] || "bg-muted text-muted-foreground";
            return (
              <Card
                key={notif.id}
                className={`border-border/50 cursor-pointer transition-all hover:shadow-sm ${!notif.read ? "bg-primary/[0.02] border-primary/20" : ""}`}
                onClick={() => handleClick(notif)}
              >
                <CardContent className="p-4 flex gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm truncate ${!notif.read ? "font-semibold" : "font-medium"}`}>{notif.title}</p>
                      {!notif.read && <div className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(notif.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <BellOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet. They'll appear as your trip progresses!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
