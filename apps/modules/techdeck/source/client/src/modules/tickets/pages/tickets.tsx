import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Ticket,
  Filter,
  Trash2,
  ChevronRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EmptyState } from "@/components/empty-state";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  low: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const statusIcons: Record<string, any> = {
  open: Circle,
  in_progress: Loader2,
  waiting_on_client: Clock,
  resolved: CheckCircle2,
  closed: XCircle,
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_on_client: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const createTicketSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  clientId: z.string().optional(),
  siteId: z.string().optional(),
  assetId: z.string().optional(),
  assignedToId: z.string().optional(),
});

type CreateTicketForm = z.infer<typeof createTicketSchema>;

export default function TicketsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const queryParams = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") queryParams.set("status", statusFilter);
  if (priorityFilter && priorityFilter !== "all") queryParams.set("priority", priorityFilter);
  if (assigneeFilter && assigneeFilter !== "all") queryParams.set("assignedToId", assigneeFilter);
  if (searchQuery) queryParams.set("q", searchQuery);
  const queryString = queryParams.toString();

  const { data: tickets, isLoading } = useQuery<any[]>({
    queryKey: ["/api/tickets", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/tickets${queryString ? `?${queryString}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load tickets");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const createMutation = useMutation({
    mutationFn: async (data: CreateTicketForm) => {
      const body: any = { ...data };
      if (!body.clientId) delete body.clientId;
      if (!body.siteId) delete body.siteId;
      if (!body.assetId) delete body.assetId;
      if (!body.assignedToId) delete body.assignedToId;
      return apiRequest("POST", "/api/tickets", body);
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: `Ticket #${ticket.number} created` });
      setShowCreateDialog(false);
      navigate(`/tickets/${ticket.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create ticket", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => apiRequest("POST", "/api/tickets/bulk-delete", { ids }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      setSelectedIds(new Set());
      toast({ title: `${selectedIds.size} ticket(s) deleted` });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const form = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      clientId: "",
      assignedToId: "",
    },
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (!tickets) return;
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)));
    }
  };

  const slaStatus = (ticket: any) => {
    if (!ticket.resolutionDeadline) return null;
    const now = new Date();
    const deadline = new Date(ticket.resolutionDeadline);
    if (ticket.status === "resolved" || ticket.status === "closed") {
      if (ticket.resolvedAt && new Date(ticket.resolvedAt) <= deadline) return "met";
      if (ticket.resolvedAt && new Date(ticket.resolvedAt) > deadline) return "breached";
      return "met";
    }
    if (now > deadline) return "breached";
    const remaining = deadline.getTime() - now.getTime();
    if (remaining < 3600000) return "at_risk";
    return "on_track";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-tickets-title">
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage service requests and issues.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-ticket">
          <Plus className="w-4 h-4 mr-1" />
          New Ticket
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tickets..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_on_client">Waiting</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-assignee-filter">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            {members?.filter((m: any) => m.role !== "CLIENT").map((m: any) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.user?.firstName} {m.user?.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            disabled={bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete-tickets"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {!tickets?.length ? (
            <EmptyState
              icon={Ticket}
              title="No tickets found"
              description="Create your first ticket to get started."
              action={{ label: "New Ticket", onClick: () => setShowCreateDialog(true), testId: "button-create-ticket-empty" }}
            />
          ) : (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground font-medium">
                <Checkbox
                  checked={selectedIds.size === tickets.length && tickets.length > 0}
                  onCheckedChange={toggleAll}
                  data-testid="checkbox-select-all"
                />
                <span className="w-16">Number</span>
                <span className="flex-1">Title</span>
                <span className="w-20">Priority</span>
                <span className="w-24">Status</span>
                <span className="w-24">SLA</span>
                <span className="w-32">Assignee</span>
                <span className="w-28">Client</span>
                <span className="w-24">Created</span>
              </div>
              {tickets.map((ticket: any) => {
                const StatusIcon = statusIcons[ticket.status] || Circle;
                const sla = slaStatus(ticket);
                return (
                  <div
                    key={ticket.id}
                    className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover-elevate cursor-pointer"
                    data-testid={`ticket-row-${ticket.id}`}
                  >
                    <Checkbox
                      checked={selectedIds.has(ticket.id)}
                      onCheckedChange={() => toggleSelect(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`checkbox-ticket-${ticket.id}`}
                    />
                    <Link href={`/tickets/${ticket.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="w-16 text-xs font-mono text-muted-foreground">
                        #{ticket.number}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">
                        {ticket.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`w-20 justify-center text-xs ${priorityColors[ticket.priority] || ""}`}
                      >
                        {ticket.priority}
                      </Badge>
                      <div className="w-24 flex items-center gap-1 text-xs">
                        <StatusIcon className="w-3 h-3" />
                        <span>{statusLabels[ticket.status] || ticket.status}</span>
                      </div>
                      <div className="w-24">
                        {sla === "breached" && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            Breached
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
                        {sla === "met" && (
                          <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400">
                            Met
                          </Badge>
                        )}
                      </div>
                      <span className="w-32 text-xs text-muted-foreground truncate">
                        {ticket.assignedToFirstName
                          ? `${ticket.assignedToFirstName} ${ticket.assignedToLastName || ""}`
                          : "Unassigned"}
                      </span>
                      <span className="w-28 text-xs text-muted-foreground truncate">
                        {ticket.clientName || "-"}
                      </span>
                      <span className="w-24 text-xs text-muted-foreground">
                        {ticket.createdAt
                          ? formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })
                          : "-"}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Ticket</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Brief description of the issue" data-testid="input-ticket-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Detailed description..." rows={3} data-testid="input-ticket-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-ticket-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-ticket-client">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {clients?.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign To</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-ticket-assignee">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {members?.filter((m: any) => m.role !== "CLIENT").map((m: any) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.user?.firstName} {m.user?.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-ticket">
                  {createMutation.isPending ? "Creating..." : "Create Ticket"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
