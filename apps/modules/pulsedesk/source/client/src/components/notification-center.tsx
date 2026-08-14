import { Bell, AlertTriangle, UserCheck, ArrowUpRight, Clock, CheckCircle2, Package, MessageSquare, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  ticketId: string | null;
  read: boolean;
  createdAt: string;
}

const ICON_MAP: Record<string, { icon: typeof Bell; color: string }> = {
  ticket_created: { icon: Bell, color: "text-primary" },
  ticket_assigned: { icon: UserCheck, color: "text-primary" },
  ticket_status_changed: { icon: CheckCircle2, color: "text-emerald-500" },
  ticket_note_added: { icon: MessageSquare, color: "text-blue-500" },
  ticket_escalated: { icon: ArrowUpRight, color: "text-rose-500" },
  ticket_overdue: { icon: AlertTriangle, color: "text-amber-500" },
  supply_request_update: { icon: Package, color: "text-violet-500" },
  facility_request_update: { icon: Wrench, color: "text-emerald-500" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationCenter() {
  const { membership } = useAuth();
  const [, setLocation] = useLocation();

  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!membership,
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: !!membership,
    refetchInterval: 15000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const handleNotificationClick = (n: Notification) => {
    if (!n.read) {
      markReadMutation.mutate(n.id);
    }
    if (n.ticketId) {
      setLocation(`/tickets/${n.ticketId}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent text-[10px] font-bold text-white flex items-center justify-center pulse-dot-critical">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => markAllReadMutation.mutate()}
                data-testid="button-mark-all-read"
              >
                Mark all read
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">Activity will appear here</p>
            </div>
          ) : (
            notifs.map((n) => {
              const { icon: IconComp, color } = ICON_MAP[n.type] || { icon: Bell, color: "text-muted-foreground" };
              return (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-muted/50 cursor-pointer ${
                    !n.read ? "bg-accent/5" : ""
                  }`}
                  onClick={() => handleNotificationClick(n)}
                  data-testid={`notification-${n.id}`}
                >
                  <div className="pt-0.5">
                    <IconComp className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-snug ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                      {n.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="pt-1.5">
                      <span className="h-2 w-2 rounded-full bg-accent block" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
