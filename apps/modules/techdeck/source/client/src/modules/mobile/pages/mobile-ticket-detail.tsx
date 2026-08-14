import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Lock,
  Send,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow, format } from "date-fns";

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  low: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  resolved: "Resolved",
  closed: "Closed",
};

export default function MobileTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [prioritySheetOpen, setPrioritySheetOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState("");
  const [timeDescription, setTimeDescription] = useState("");
  const [timeBillable, setTimeBillable] = useState(true);

  const { data: ticket, isLoading } = useQuery<any>({
    queryKey: ["/api/tickets", id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ticket");
      return res.json();
    },
  });

  const { data: comments, isLoading: commentsLoading } = useQuery<any[]>({
    queryKey: ["/api/tickets", id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comments");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket updated" });
      setStatusSheetOpen(false);
      setPrioritySheetOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; isInternal: boolean }) =>
      apiRequest("POST", `/api/tickets/${id}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "comments"] });
      setCommentText("");
      setIsInternal(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    },
  });

  const logTimeMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", `/api/time-entries`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time logged" });
      setTimeSheetOpen(false);
      setTimeMinutes("");
      setTimeDescription("");
      setTimeBillable(true);
    },
    onError: (err: any) => {
      toast({ title: "Failed to log time", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    addCommentMutation.mutate({ content: commentText.trim(), isInternal });
  };

  const handleLogTime = () => {
    const mins = parseInt(timeMinutes);
    if (!mins || mins <= 0) {
      toast({ title: "Enter valid minutes", variant: "destructive" });
      return;
    }
    logTimeMutation.mutate({
      ticketId: id,
      clientId: ticket?.clientId || null,
      minutes: mins,
      description: timeDescription || null,
      billable: timeBillable,
      date: new Date().toISOString().slice(0, 10),
    });
  };

  const getSlaStatus = () => {
    if (!ticket?.resolutionDeadline) return null;
    const now = new Date();
    const deadline = new Date(ticket.resolutionDeadline);
    if (ticket.status === "resolved" || ticket.status === "closed") {
      if (ticket.resolvedAt && new Date(ticket.resolvedAt) <= deadline) return "met";
      return "breached";
    }
    if (now > deadline) return "breached";
    const remaining = deadline.getTime() - now.getTime();
    if (remaining < 3600000) return "at_risk";
    return "on_track";
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-muted-foreground text-sm">Ticket not found.</p>
        <Button variant="outline" size="sm" asChild data-testid="button-back-tickets-mobile">
          <Link href="/m/tickets">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to tickets
          </Link>
        </Button>
      </div>
    );
  }

  const sla = getSlaStatus();
  const clientName = ticket.clientName || (clients?.find((c: any) => c.id === ticket.clientId)?.name) || "None";
  const assigneeName = ticket.assignedToFirstName
    ? `${ticket.assignedToFirstName} ${ticket.assignedToLastName || ""}`.trim()
    : "Unassigned";

  return (
    <div className="flex flex-col h-full" data-testid="mobile-ticket-detail">
      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild data-testid="button-back-mobile-tickets">
              <Link href="/m/tickets">
                <ArrowLeft className="w-5 h-5" />
              </Link>
            </Button>
            <span className="text-muted-foreground text-sm font-mono">#{ticket.number}</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-semibold leading-tight" data-testid="text-mobile-ticket-title">
              {ticket.title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={`text-xs ${priorityColors[ticket.priority] || ""}`}
                data-testid="badge-mobile-ticket-priority"
              >
                {ticket.priority}
              </Badge>
              <Badge variant="outline" className="text-xs" data-testid="badge-mobile-ticket-status">
                {statusLabels[ticket.status] || ticket.status}
              </Badge>
              {sla === "breached" && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="w-3 h-3 mr-0.5" />
                  SLA Breached
                </Badge>
              )}
              {sla === "at_risk" && (
                <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Clock className="w-3 h-3 mr-0.5" />
                  At Risk
                </Badge>
              )}
              {sla === "on_track" && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" />
                  On Track
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusSheetOpen(true)}
              data-testid="button-mobile-change-status"
            >
              Change Status
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrioritySheetOpen(true)}
              data-testid="button-mobile-change-priority"
            >
              Change Priority
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTimeSheetOpen(true)}
              data-testid="button-mobile-log-time"
            >
              <Clock className="w-4 h-4 mr-1" />
              Log Time
            </Button>
          </div>

          {ticket.description && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm whitespace-pre-wrap" data-testid="text-mobile-ticket-description">
                  {ticket.description}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-2">
              <DetailRow label="Client" value={clientName} testId="text-mobile-ticket-client" />
              <DetailRow label="Assigned to" value={assigneeName} testId="text-mobile-ticket-assignee" />
              {ticket.siteName && <DetailRow label="Site" value={ticket.siteName} />}
              {ticket.assetName && <DetailRow label="Asset" value={ticket.assetName} />}
              <DetailRow
                label="Created"
                value={ticket.createdAt ? format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a") : "-"}
              />
              {ticket.resolutionDeadline && (
                <DetailRow
                  label="Resolution deadline"
                  value={format(new Date(ticket.resolutionDeadline), "MMM d, yyyy h:mm a")}
                />
              )}
              {ticket.resolvedAt && (
                <DetailRow
                  label="Resolved"
                  value={format(new Date(ticket.resolvedAt), "MMM d, yyyy h:mm a")}
                />
              )}
            </CardContent>
          </Card>

          <Separator />

          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments ({comments?.length || 0})
            </h2>

            {commentsLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment: any) => (
                  <div
                    key={comment.id}
                    className={`flex gap-3 p-3 rounded-md ${
                      comment.isInternal ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-muted/30"
                    }`}
                    data-testid={`mobile-comment-${comment.id}`}
                  >
                    <Avatar className="w-7 h-7 flex-shrink-0">
                      <AvatarFallback className="text-xs">
                        {(comment.userFirstName || "?")[0]}
                        {(comment.userLastName || "")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {comment.userFirstName} {comment.userLastName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {comment.createdAt
                            ? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })
                            : ""}
                        </span>
                        {comment.isInternal && (
                          <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                            <Lock className="w-3 h-3 mr-0.5" />
                            Internal
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t bg-background p-3 space-y-2 sticky bottom-0 z-10" data-testid="mobile-comment-input-area">
        <div className="flex items-center gap-2">
          <Textarea
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            className="flex-1 text-sm resize-none"
            data-testid="input-mobile-comment"
          />
          <Button
            size="icon"
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || addCommentMutation.isPending}
            data-testid="button-mobile-send-comment"
          >
            {addCommentMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="internal-toggle"
            checked={isInternal}
            onCheckedChange={setIsInternal}
            data-testid="switch-mobile-internal"
          />
          <Label htmlFor="internal-toggle" className="text-xs text-muted-foreground">
            Internal note
          </Label>
        </div>
      </div>

      <Sheet open={statusSheetOpen} onOpenChange={setStatusSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Change Status</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-2">
            {Object.entries(statusLabels).map(([value, label]) => (
              <Button
                key={value}
                variant={ticket.status === value ? "default" : "ghost"}
                className="w-full justify-between"
                onClick={() => updateMutation.mutate({ status: value })}
                disabled={updateMutation.isPending}
                data-testid={`button-status-${value}`}
              >
                <span>{label}</span>
                {ticket.status === value && <CheckCircle2 className="w-4 h-4" />}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={prioritySheetOpen} onOpenChange={setPrioritySheetOpen}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Change Priority</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-2">
            {["critical", "high", "medium", "low"].map((p) => (
              <Button
                key={p}
                variant={ticket.priority === p ? "default" : "ghost"}
                className="w-full justify-between"
                onClick={() => updateMutation.mutate({ priority: p })}
                disabled={updateMutation.isPending}
                data-testid={`button-priority-${p}`}
              >
                <span className="capitalize">{p}</span>
                {ticket.priority === p && <CheckCircle2 className="w-4 h-4" />}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={timeSheetOpen} onOpenChange={setTimeSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Log Time</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Minutes</Label>
              <div className="flex gap-2 flex-wrap">
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={timeMinutes === String(m) ? "default" : "outline"}
                    onClick={() => setTimeMinutes(String(m))}
                    data-testid={`button-time-preset-${m}`}
                  >
                    {m}m
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Or enter custom minutes"
                value={timeMinutes}
                onChange={(e) => setTimeMinutes(e.target.value)}
                data-testid="input-mobile-time-minutes"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Description</Label>
              <Textarea
                placeholder="What did you work on?"
                value={timeDescription}
                onChange={(e) => setTimeDescription(e.target.value)}
                rows={2}
                className="resize-none text-sm"
                data-testid="input-mobile-time-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="billable-toggle"
                checked={timeBillable}
                onCheckedChange={setTimeBillable}
                data-testid="switch-mobile-billable"
              />
              <Label htmlFor="billable-toggle" className="text-sm">Billable</Label>
            </div>
            <Button
              className="w-full"
              onClick={handleLogTime}
              disabled={logTimeMutation.isPending || !timeMinutes}
              data-testid="button-mobile-submit-time"
            >
              {logTimeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              Log {timeMinutes ? `${timeMinutes} minutes` : "Time"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right" data-testid={testId}>{value}</span>
    </div>
  );
}
