import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  TicketIcon,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ChevronRight,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  status: z.enum(["open", "in_progress", "waiting_on_client", "resolved", "closed"]),
  clientId: z.string().optional(),
  assignedToId: z.string().optional(),
});

type CreateTicketForm = z.infer<typeof createTicketSchema>;

type FilterMode = "mine" | "all" | "open" | "in_progress" | "waiting_on_client" | "resolved" | "closed";

function slaStatus(ticket: any) {
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
}

export default function MobileTicketsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<FilterMode>("mine");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [editingTicket, setEditingTicket] = useState<any | null>(null);
  const [statusChangeTicket, setStatusChangeTicket] = useState<any | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);

  const queryParams = new URLSearchParams();
  if (activeFilter !== "mine" && activeFilter !== "all") {
    queryParams.set("status", activeFilter);
  }
  if (activeFilter === "mine" && user?.id) {
    queryParams.set("assignedToId", user.id);
  }
  const queryString = queryParams.toString();

  const { data: tickets, isLoading, refetch } = useQuery<any[]>({
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
      if (!body.assignedToId) delete body.assignedToId;
      return apiRequest("POST", "/api/tickets", body);
    },
    onSuccess: async (res) => {
      const ticket = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: `Ticket #${ticket.number} created` });
      setShowCreateSheet(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create ticket", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/tickets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket updated" });
      setEditingTicket(null);
      editForm.reset();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/tickets/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Status updated" });
      setStatusChangeTicket(null);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const form = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      clientId: "",
      assignedToId: "",
    },
  });

  const editForm = useForm<CreateTicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      status: "open",
      clientId: "",
      assignedToId: "",
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const endY = e.changedTouches[0].clientY;
      const diff = endY - touchStartY.current;
      if (diff > 80 && scrollRef.current && scrollRef.current.scrollTop <= 0) {
        handleRefresh();
      }
    },
    [handleRefresh]
  );

  const openEditSheet = (ticket: any) => {
    editForm.reset({
      title: ticket.title,
      description: ticket.description || "",
      priority: ticket.priority,
      status: ticket.status,
      clientId: ticket.clientId || "",
      assignedToId: ticket.assignedToId || "",
    });
    setEditingTicket(ticket);
  };

  const filters: { label: string; value: FilterMode }[] = [
    { label: "My Tickets", value: "mine" },
    { label: "All", value: "all" },
    { label: "Open", value: "open" },
    { label: "In Progress", value: "in_progress" },
    { label: "Waiting", value: "waiting_on_client" },
    { label: "Resolved", value: "resolved" },
  ];

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-20 flex-shrink-0 rounded-md" />
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="px-4 pt-3 pb-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-mobile-tickets-title">
            Tickets
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            data-testid="button-refresh-tickets"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              data-testid={`filter-${f.value}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-4 pb-24 space-y-2" data-testid="mobile-tickets-list">
        {isRefreshing && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {!tickets?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <TicketIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium" data-testid="text-no-tickets">No tickets found</p>
            <p className="text-xs mt-1">
              {activeFilter === "mine" ? "No tickets assigned to you." : "No tickets match this filter."}
            </p>
          </div>
        ) : (
          tickets.map((ticket: any) => {
            const StatusIcon = statusIcons[ticket.status] || Circle;
            const sla = slaStatus(ticket);
            return (
              <Card
                key={ticket.id}
                className="overflow-visible"
                data-testid={`mobile-ticket-card-${ticket.id}`}
              >
                <CardContent className="p-3 space-y-2">
                  <div
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => navigate(`/m/tickets/${ticket.id}`)}
                    data-testid={`link-ticket-${ticket.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">#{ticket.number}</span>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${priorityColors[ticket.priority] || ""}`}
                        >
                          {ticket.priority}
                        </Badge>
                        {sla === "breached" && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            SLA
                          </Badge>
                        )}
                        {sla === "at_risk" && (
                          <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400">
                            <Clock className="w-3 h-3 mr-0.5" />
                            At Risk
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate" data-testid={`text-ticket-title-${ticket.id}`}>
                        {ticket.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {statusLabels[ticket.status] || ticket.status}
                        </span>
                        {ticket.clientName && (
                          <span className="truncate max-w-[120px]">{ticket.clientName}</span>
                        )}
                        {ticket.createdAt && (
                          <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>

                  <div className="flex gap-1.5 pt-1 border-t flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusChangeTicket(ticket);
                      }}
                      data-testid={`button-change-status-${ticket.id}`}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                      Status
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/m/time?ticketId=${ticket.id}&ticketNumber=${ticket.number}`);
                      }}
                      data-testid={`button-log-time-${ticket.id}`}
                    >
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      Log Time
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditSheet(ticket);
                      }}
                      data-testid={`button-edit-ticket-${ticket.id}`}
                    >
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Button
        className="fixed bottom-20 right-4 rounded-full shadow-lg z-40"
        size="lg"
        onClick={() => {
          form.reset();
          setShowCreateSheet(true);
        }}
        data-testid="fab-new-ticket"
      >
        <Plus className="w-5 h-5 mr-1" />
        New Ticket
      </Button>

      <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
        <SheetContent side="bottom" className="h-[90dvh] flex flex-col rounded-t-lg overflow-auto">
          <SheetHeader>
            <SheetTitle>New Ticket</SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
              className="flex-1 flex flex-col gap-4 py-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Brief description of the issue" data-testid="input-mobile-ticket-title" />
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
                      <Textarea {...field} placeholder="Details..." rows={3} data-testid="input-mobile-ticket-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mobile-ticket-priority">
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mobile-ticket-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="waiting_on_client">Waiting</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mobile-ticket-client">
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
              <FormField
                control={form.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mobile-ticket-assignee">
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
              <SheetFooter className="mt-auto pt-4">
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-mobile-ticket">
                  {createMutation.isPending ? "Creating..." : "Create Ticket"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingTicket} onOpenChange={(open) => !open && setEditingTicket(null)}>
        <SheetContent side="bottom" className="h-[90dvh] flex flex-col rounded-t-lg overflow-auto">
          <SheetHeader>
            <SheetTitle>Edit Ticket #{editingTicket?.number}</SheetTitle>
          </SheetHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => {
                if (!editingTicket) return;
                const body: any = { ...data };
                if (!body.clientId) body.clientId = null;
                if (!body.assignedToId) body.assignedToId = null;
                updateMutation.mutate({ id: editingTicket.id, data: body });
              })}
              className="flex-1 flex flex-col gap-4 py-4"
            >
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-mobile-edit-ticket-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} data-testid="input-mobile-edit-ticket-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={editForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mobile-edit-priority">
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
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-mobile-edit-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="waiting_on_client">Waiting</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mobile-edit-client">
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
              <FormField
                control={editForm.control}
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mobile-edit-assignee">
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
              <SheetFooter className="mt-auto pt-4">
                <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-save-mobile-ticket">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!statusChangeTicket} onOpenChange={(open) => !open && setStatusChangeTicket(null)}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Change Status - #{statusChangeTicket?.number}</SheetTitle>
          </SheetHeader>
          <div className="py-4 space-y-2">
            {(["open", "in_progress", "waiting_on_client", "resolved", "closed"] as const).map((s) => {
              const Icon = statusIcons[s] || Circle;
              const isCurrentStatus = statusChangeTicket?.status === s;
              return (
                <Button
                  key={s}
                  variant={isCurrentStatus ? "default" : "ghost"}
                  className="w-full justify-start"
                  disabled={statusMutation.isPending}
                  onClick={() => {
                    if (!statusChangeTicket || isCurrentStatus) return;
                    statusMutation.mutate({ id: statusChangeTicket.id, status: s });
                  }}
                  data-testid={`button-status-option-${s}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {statusLabels[s]}
                  {isCurrentStatus && (
                    <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>
                  )}
                </Button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
