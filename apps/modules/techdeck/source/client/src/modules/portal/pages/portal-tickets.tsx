import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Ticket, Plus, MessageSquare, ArrowLeft, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PortalClient {
  id: string;
  name: string;
}

interface PortalTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  clientId: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  in_progress: "secondary",
  waiting_on_client: "outline",
  resolved: "secondary",
  closed: "outline",
};

const priorityVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PortalTicketsPage() {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [commentText, setCommentText] = useState("");
  const { toast } = useToast();

  const { data: clients } = useQuery<PortalClient[]>({
    queryKey: ["/api/portal/clients"],
  });

  const { data: ticketsList, isLoading } = useQuery<PortalTicket[]>({
    queryKey: ["/api/portal/tickets"],
  });

  const { data: comments, isLoading: commentsLoading } = useQuery<TicketComment[]>({
    queryKey: ["/api/portal/tickets", selectedTicketId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tickets/${selectedTicketId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!selectedTicketId,
  });

  const createTicketMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; clientId: string; priority: string }) => {
      const res = await apiRequest("POST", "/api/portal/tickets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets"] });
      setDialogOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewClientId("");
      setNewPriority("medium");
      toast({ title: "Ticket submitted successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit ticket", description: err.message, variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (data: { ticketId: string; content: string }) => {
      const res = await apiRequest("POST", `/api/portal/tickets/${data.ticketId}/comments`, { content: data.content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/tickets", selectedTicketId, "comments"] });
      setCommentText("");
      toast({ title: "Comment added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add comment", description: err.message, variant: "destructive" });
    },
  });

  const selectedTicket = ticketsList?.find((t) => t.id === selectedTicketId);

  if (selectedTicketId && selectedTicket) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => setSelectedTicketId(null)} data-testid="button-back-tickets">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Tickets
        </Button>

        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-ticket-detail-title">{selectedTicket.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={statusVariant[selectedTicket.status] || "secondary"} data-testid="badge-ticket-status">
              {formatStatus(selectedTicket.status)}
            </Badge>
            <Badge variant={priorityVariant[selectedTicket.priority] || "secondary"} data-testid="badge-ticket-priority">
              {selectedTicket.priority}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Created {new Date(selectedTicket.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {commentsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-md" />
                ))}
              </div>
            ) : comments && comments.length > 0 ? (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="border rounded-md p-3" data-testid={`comment-${comment.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium" data-testid={`text-comment-author-${comment.id}`}>
                        {comment.user?.firstName && comment.user?.lastName
                          ? `${comment.user.firstName} ${comment.user.lastName}`
                          : comment.user?.email || "Unknown"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm" data-testid={`text-comment-content-${comment.id}`}>{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-comments">
                No comments yet.
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Textarea
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1"
                data-testid="input-comment"
              />
              <Button
                size="icon"
                onClick={() => {
                  if (commentText.trim() && selectedTicketId) {
                    addCommentMutation.mutate({ ticketId: selectedTicketId, content: commentText.trim() });
                  }
                }}
                disabled={!commentText.trim() || addCommentMutation.isPending}
                data-testid="button-submit-comment"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-portal-tickets-title">
            <Ticket className="w-6 h-6" />
            My Tickets
          </h1>
          <p className="text-muted-foreground mt-1">
            View and submit support tickets
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-submit-ticket">
              <Plus className="w-4 h-4 mr-1" />
              Submit Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit New Ticket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="ticket-title">Title</Label>
                <Input
                  id="ticket-title"
                  placeholder="Brief description of the issue"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  data-testid="input-ticket-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  placeholder="Provide more details..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  data-testid="input-ticket-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-client">Client</Label>
                <Select value={newClientId} onValueChange={setNewClientId}>
                  <SelectTrigger data-testid="select-ticket-client">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-priority">Priority</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger data-testid="select-ticket-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (newTitle.trim() && newClientId) {
                    createTicketMutation.mutate({
                      title: newTitle.trim(),
                      description: newDescription.trim() || undefined,
                      clientId: newClientId,
                      priority: newPriority,
                    });
                  }
                }}
                disabled={!newTitle.trim() || !newClientId || createTicketMutation.isPending}
                data-testid="button-confirm-submit-ticket"
              >
                {createTicketMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : ticketsList && ticketsList.length > 0 ? (
        <div className="space-y-2">
          {ticketsList.map((ticket) => (
            <Card
              key={ticket.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedTicketId(ticket.id)}
              data-testid={`row-ticket-${ticket.id}`}
            >
              <CardContent className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>{ticket.title}</p>
                  <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground mt-1">
                    <Badge variant={statusVariant[ticket.status] || "secondary"} data-testid={`badge-status-${ticket.id}`}>
                      {formatStatus(ticket.status)}
                    </Badge>
                    <Badge variant={priorityVariant[ticket.priority] || "secondary"} data-testid={`badge-priority-${ticket.id}`}>
                      {ticket.priority}
                    </Badge>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-ticket-date-${ticket.id}`}>
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-tickets">
            No tickets found. Submit a ticket to get started.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
