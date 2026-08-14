import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Clock,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const timeEntrySchema = z.object({
  ticketId: z.string().optional(),
  clientId: z.string().optional(),
  description: z.string().optional(),
  minutes: z.coerce.number().min(1, "Minutes must be at least 1"),
  billable: z.boolean(),
  rateOverrideCents: z.coerce.number().optional(),
  date: z.string().min(1, "Date is required"),
});

type TimeEntryForm = z.infer<typeof timeEntrySchema>;

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TimeEntriesPage() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [clientFilter, setClientFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [billableFilter, setBillableFilter] = useState("all");
  const [uninvoicedOnly, setUninvoicedOnly] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const queryParams = new URLSearchParams();
  if (clientFilter && clientFilter !== "all") queryParams.set("clientId", clientFilter);
  if (userFilter && userFilter !== "all") queryParams.set("userId", userFilter);
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);
  if (billableFilter === "billable") queryParams.set("billable", "true");
  if (billableFilter === "non-billable") queryParams.set("billable", "false");
  if (uninvoicedOnly) queryParams.set("uninvoiced", "true");
  const queryString = queryParams.toString();

  const { data: timeEntries, isLoading } = useQuery<any[]>({
    queryKey: ["/api/time-entries", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries${queryString ? `?${queryString}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load time entries");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: tickets } = useQuery<any[]>({ queryKey: ["/api/tickets"] });
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const form = useForm<TimeEntryForm>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      ticketId: "",
      clientId: "",
      description: "",
      minutes: 0,
      billable: true,
      rateOverrideCents: undefined,
      date: todayString(),
    },
  });

  const openCreate = () => {
    setEditingEntry(null);
    form.reset({
      ticketId: "",
      clientId: "",
      description: "",
      minutes: 0,
      billable: true,
      rateOverrideCents: undefined,
      date: todayString(),
    });
    setShowDialog(true);
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    form.reset({
      ticketId: entry.ticketId || "",
      clientId: entry.clientId || "",
      description: entry.description || "",
      minutes: entry.minutes,
      billable: entry.billable,
      rateOverrideCents: entry.rateOverrideCents ? entry.rateOverrideCents / 100 : undefined,
      date: entry.date ? entry.date.slice(0, 10) : todayString(),
    });
    setShowDialog(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data: TimeEntryForm) => {
      const body: any = {
        description: data.description,
        minutes: data.minutes,
        billable: data.billable,
        date: data.date,
      };
      if (data.ticketId) body.ticketId = data.ticketId;
      if (data.clientId) body.clientId = data.clientId;
      if (data.rateOverrideCents != null && data.rateOverrideCents > 0) {
        body.rateOverrideCents = Math.round(data.rateOverrideCents * 100);
      }
      return apiRequest("POST", "/api/time-entries", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry created" });
      setShowDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create time entry", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TimeEntryForm) => {
      const body: any = {
        description: data.description,
        minutes: data.minutes,
        billable: data.billable,
        date: data.date,
      };
      if (data.ticketId) body.ticketId = data.ticketId;
      else body.ticketId = null;
      if (data.clientId) body.clientId = data.clientId;
      else body.clientId = null;
      if (data.rateOverrideCents != null && data.rateOverrideCents > 0) {
        body.rateOverrideCents = Math.round(data.rateOverrideCents * 100);
      } else {
        body.rateOverrideCents = null;
      }
      return apiRequest("PUT", `/api/time-entries/${editingEntry.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry updated" });
      setShowDialog(false);
      setEditingEntry(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update time entry", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete time entry", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (data: TimeEntryForm) => {
    if (editingEntry) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const totalMinutes = timeEntries?.reduce((sum, e) => sum + (e.minutes || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-time-tracking-title">
            Time Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Track and manage time entries across tickets and clients.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-log-time">
          <Plus className="w-4 h-4 mr-1" />
          Log Time
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-client-filter">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients?.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-user-filter">
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {members?.filter((m: any) => m.role !== "CLIENT").map((m: any) => (
              <SelectItem key={m.userId} value={m.userId}>
                {m.user?.firstName} {m.user?.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-[150px]"
          placeholder="Start date"
          data-testid="input-start-date"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-[150px]"
          placeholder="End date"
          data-testid="input-end-date"
        />
        <Select value={billableFilter} onValueChange={setBillableFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-billable-filter">
            <SelectValue placeholder="Billable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="billable">Billable</SelectItem>
            <SelectItem value="non-billable">Non-Billable</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={uninvoicedOnly}
            onCheckedChange={(v) => setUninvoicedOnly(!!v)}
            id="uninvoiced-filter"
            data-testid="checkbox-uninvoiced-filter"
          />
          <label htmlFor="uninvoiced-filter" className="text-sm text-muted-foreground cursor-pointer">
            Uninvoiced only
          </label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {!timeEntries?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No time entries found</p>
              <p className="text-xs mt-1">Log your first time entry to get started.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={openCreate}
                data-testid="button-log-time-empty"
              >
                <Plus className="w-4 h-4 mr-1" />
                Log Time
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Billable</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeEntries.map((entry: any) => (
                  <TableRow key={entry.id} data-testid={`time-entry-row-${entry.id}`}>
                    <TableCell className="text-sm" data-testid={`text-date-${entry.id}`}>
                      {entry.date ? new Date(entry.date).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" data-testid={`text-description-${entry.id}`}>
                      {entry.description || "-"}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-ticket-${entry.id}`}>
                      {entry.ticket?.title || "-"}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-client-${entry.id}`}>
                      {entry.client?.name || "-"}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-user-${entry.id}`}>
                      {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "-"}
                    </TableCell>
                    <TableCell className="text-sm font-mono" data-testid={`text-minutes-${entry.id}`}>
                      {formatMinutes(entry.minutes)}
                    </TableCell>
                    <TableCell data-testid={`text-billable-${entry.id}`}>
                      {entry.billable ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                          Billable
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Non-Billable
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(entry)}
                          data-testid={`button-edit-time-entry-${entry.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-time-entry-${entry.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell colSpan={5} className="text-sm text-right">
                    Total
                  </TableCell>
                  <TableCell className="text-sm font-mono" data-testid="text-total-hours">
                    {formatMinutes(totalMinutes)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) setEditingEntry(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit Time Entry" : "Log Time"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-time-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minutes</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-time-minutes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="What did you work on?" rows={3} data-testid="input-time-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ticketId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticket</FormLabel>
                      <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-time-ticket">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {tickets?.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>
                              #{t.number} {t.title}
                            </SelectItem>
                          ))}
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
                          <SelectTrigger data-testid="select-time-client">
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="billable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-time-billable"
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer">Billable</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rateOverrideCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate Override ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Default rate"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                          data-testid="input-time-rate-override"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-time-entry"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : editingEntry ? "Update Entry" : "Log Time"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
