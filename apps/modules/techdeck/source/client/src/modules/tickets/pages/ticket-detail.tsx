import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Trash2,
  Save,
  Send,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Lock,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editAssignedToId, setEditAssignedToId] = useState("");
  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

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
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket updated" });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/tickets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket deleted" });
      navigate("/tickets");
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; isInternal: boolean }) =>
      apiRequest("POST", `/api/tickets/${id}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "comments"] });
      setCommentText("");
      setIsInternal(false);
      toast({ title: "Comment added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) =>
      apiRequest("PATCH", `/api/tickets/${id}/comments/${commentId}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "comments"] });
      setEditingCommentId(null);
      toast({ title: "Comment updated" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) =>
      apiRequest("DELETE", `/api/tickets/${id}/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", id, "comments"] });
      toast({ title: "Comment deleted" });
    },
  });

  const startEdit = () => {
    if (!ticket) return;
    setEditTitle(ticket.title);
    setEditDescription(ticket.description || "");
    setEditPriority(ticket.priority);
    setEditStatus(ticket.status);
    setEditClientId(ticket.clientId || "");
    setEditAssignedToId(ticket.assignedToId || "");
    setIsEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate({
      title: editTitle,
      description: editDescription || null,
      priority: editPriority,
      status: editStatus,
      clientId: editClientId || null,
      assignedToId: editAssignedToId || null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Ticket not found.</p>
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link href="/tickets">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to tickets
          </Link>
        </Button>
      </div>
    );
  }

  const slaStatus = () => {
    if (!ticket.resolutionDeadline) return null;
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

  const sla = slaStatus();

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild data-testid="button-back-tickets">
          <Link href="/tickets">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Tickets
          </Link>
        </Button>
        <span className="text-muted-foreground text-sm font-mono">#{ticket.number}</span>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-lg font-semibold"
                data-testid="input-edit-title"
              />
            ) : (
              <CardTitle className="text-lg" data-testid="text-ticket-title">
                {ticket.title}
              </CardTitle>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="secondary"
                className={`text-xs ${priorityColors[ticket.priority] || ""}`}
                data-testid="badge-ticket-priority"
              >
                {ticket.priority}
              </Badge>
              <Badge variant="outline" className="text-xs" data-testid="badge-ticket-status">
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
                  SLA At Risk
                </Badge>
              )}
              {sla === "on_track" && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" />
                  SLA On Track
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isEditing ? (
              <>
                <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending} data-testid="button-save-ticket">
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-ticket">
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" data-testid="button-delete-ticket">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete ticket #{ticket.number}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this ticket and all its comments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        data-testid="button-confirm-delete"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={editPriority} onValueChange={setEditPriority}>
                    <SelectTrigger data-testid="select-edit-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="waiting_on_client">Waiting on Client</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Client</label>
                  <Select value={editClientId || "__none__"} onValueChange={(v) => setEditClientId(v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="select-edit-client">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {clients?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Assigned To</label>
                  <Select value={editAssignedToId || "__none__"} onValueChange={(v) => setEditAssignedToId(v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid="select-edit-assignee">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {members?.filter((m: any) => m.role !== "CLIENT").map((m: any) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.user?.firstName} {m.user?.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {ticket.description && (
                <div>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-ticket-description">
                    {ticket.description}
                  </p>
                </div>
              )}
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Client:</span>{" "}
                  <span className="font-medium" data-testid="text-ticket-client">
                    {ticket.clientName || "None"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Site:</span>{" "}
                  <span className="font-medium">{ticket.siteName || "None"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Asset:</span>{" "}
                  <span className="font-medium">{ticket.assetName || "None"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Assigned to:</span>{" "}
                  <span className="font-medium" data-testid="text-ticket-assignee">
                    {ticket.assignedToFirstName
                      ? `${ticket.assignedToFirstName} ${ticket.assignedToLastName || ""}`
                      : "Unassigned"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created by:</span>{" "}
                  <span className="font-medium">
                    {ticket.createdByFirstName
                      ? `${ticket.createdByFirstName} ${ticket.createdByLastName || ""}`
                      : "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{" "}
                  <span className="font-medium">
                    {ticket.createdAt ? format(new Date(ticket.createdAt), "MMM d, yyyy h:mm a") : "-"}
                  </span>
                </div>
                {ticket.responseDeadline && (
                  <div>
                    <span className="text-muted-foreground">Response deadline:</span>{" "}
                    <span className="font-medium">
                      {format(new Date(ticket.responseDeadline), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                )}
                {ticket.resolutionDeadline && (
                  <div>
                    <span className="text-muted-foreground">Resolution deadline:</span>{" "}
                    <span className="font-medium">
                      {format(new Date(ticket.resolutionDeadline), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                )}
                {ticket.respondedAt && (
                  <div>
                    <span className="text-muted-foreground">First response:</span>{" "}
                    <span className="font-medium">
                      {format(new Date(ticket.respondedAt), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                )}
                {ticket.resolvedAt && (
                  <div>
                    <span className="text-muted-foreground">Resolved:</span>{" "}
                    <span className="font-medium">
                      {format(new Date(ticket.resolvedAt), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Comments ({comments?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {commentsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <>
              {comments?.map((comment: any) => (
                <div
                  key={comment.id}
                  className={`flex gap-3 p-3 rounded-md ${
                    comment.isInternal ? "bg-yellow-500/5 border border-yellow-500/20" : "bg-muted/30"
                  }`}
                  data-testid={`comment-${comment.id}`}
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
                    {editingCommentId === comment.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          rows={2}
                          data-testid="input-edit-comment"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateCommentMutation.mutate({
                                commentId: comment.id,
                                content: editCommentText,
                              })
                            }
                            disabled={updateCommentMutation.isPending}
                            data-testid="button-save-comment"
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingCommentId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
                    )}
                    {editingCommentId !== comment.id && (
                      <div className="flex gap-1 mt-2" style={{ visibility: "visible" }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditCommentText(comment.content);
                          }}
                          data-testid={`button-edit-comment-${comment.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              data-testid={`button-delete-comment-${comment.id}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteCommentMutation.mutate(comment.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <Separator />
              <div className="space-y-2">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  data-testid="input-new-comment"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-internal-note"
                    />
                    <Lock className="w-3 h-3 text-muted-foreground" />
                    Internal note (not visible to clients)
                  </label>
                  <Button
                    size="sm"
                    onClick={() =>
                      addCommentMutation.mutate({ content: commentText, isInternal })
                    }
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                    data-testid="button-add-comment"
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
