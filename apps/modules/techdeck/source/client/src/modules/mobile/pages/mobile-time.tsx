import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Clock,
  Pencil,
  Trash2,
  Loader2,
  DollarSign,
  Timer,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const MINUTE_PRESETS = [15, 30, 45, 60, 90, 120];

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDecimalHours(mins: number): string {
  return (mins / 60).toFixed(1);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const today = todayString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (dateStr === today) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  return new Date(dateStr + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface TimeEntryFormData {
  minutes: number;
  description: string;
  ticketId: string;
  clientId: string;
  billable: boolean;
  date: string;
}

export default function MobileTimePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const [formData, setFormData] = useState<TimeEntryFormData>({
    minutes: 0,
    description: "",
    ticketId: "",
    clientId: "",
    billable: true,
    date: todayString(),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticketId");
    if (ticketId) {
      setFormData((prev) => ({ ...prev, ticketId }));
      setShowSheet(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: timeEntries, isLoading } = useQuery<any[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: tickets } = useQuery<any[]>({ queryKey: ["/api/tickets"] });

  const today = todayString();
  const weekStart = getWeekStart();

  const myEntries = useMemo(() => {
    if (!timeEntries || !user) return [];
    return timeEntries.filter((e: any) => e.userId === user.id);
  }, [timeEntries, user]);

  const todayTotal = useMemo(() => {
    return myEntries
      .filter((e: any) => e.date && e.date.slice(0, 10) === today)
      .reduce((sum: number, e: any) => sum + (e.minutes || 0), 0);
  }, [myEntries, today]);

  const weekTotal = useMemo(() => {
    return myEntries
      .filter((e: any) => e.date && e.date.slice(0, 10) >= weekStart)
      .reduce((sum: number, e: any) => sum + (e.minutes || 0), 0);
  }, [myEntries, weekStart]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const sorted = [...myEntries].sort((a, b) => {
      const da = a.date ? a.date.slice(0, 10) : "";
      const db = b.date ? b.date.slice(0, 10) : "";
      return db.localeCompare(da);
    });
    for (const entry of sorted) {
      const key = entry.date ? entry.date.slice(0, 10) : "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  }, [myEntries]);

  const resetForm = () => {
    setFormData({
      minutes: 0,
      description: "",
      ticketId: "",
      clientId: "",
      billable: true,
      date: todayString(),
    });
  };

  const openCreate = () => {
    setEditingEntry(null);
    resetForm();
    setShowSheet(true);
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setFormData({
      minutes: entry.minutes || 0,
      description: entry.description || "",
      ticketId: entry.ticketId || "",
      clientId: entry.clientId || "",
      billable: entry.billable ?? true,
      date: entry.date ? entry.date.slice(0, 10) : todayString(),
    });
    setShowSheet(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data: TimeEntryFormData) => {
      const body: any = {
        description: data.description || null,
        minutes: data.minutes,
        billable: data.billable,
        date: data.date,
      };
      if (data.ticketId) body.ticketId = data.ticketId;
      if (data.clientId) body.clientId = data.clientId;
      return apiRequest("POST", "/api/time-entries", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time logged" });
      setShowSheet(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to log time", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: TimeEntryFormData) => {
      const body: any = {
        description: data.description || null,
        minutes: data.minutes,
        billable: data.billable,
        date: data.date,
        ticketId: data.ticketId || null,
        clientId: data.clientId || null,
      };
      return apiRequest("PUT", `/api/time-entries/${editingEntry.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry updated" });
      setShowSheet(false);
      setEditingEntry(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry deleted" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (formData.minutes < 1) {
      toast({ title: "Select a duration", description: "Minutes must be at least 1", variant: "destructive" });
      return;
    }
    if (editingEntry) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-20 rounded-md" />
        </div>
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-20" data-testid="mobile-time-page">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card data-testid="card-today-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">Today</span>
              </div>
              <p className="text-2xl font-bold tracking-tight" data-testid="text-today-hours">
                {formatDecimalHours(todayTotal)}h
              </p>
              <p className="text-xs text-muted-foreground">{formatMinutes(todayTotal)}</p>
            </CardContent>
          </Card>
          <Card data-testid="card-week-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">This Week</span>
              </div>
              <p className="text-2xl font-bold tracking-tight" data-testid="text-week-hours">
                {formatDecimalHours(weekTotal)}h
              </p>
              <p className="text-xs text-muted-foreground">{formatMinutes(weekTotal)}</p>
            </CardContent>
          </Card>
        </div>

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Timer className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No time entries yet</p>
            <p className="text-xs mt-1">Tap the + button to log your first entry.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([dateKey, entries]) => {
              const dayTotal = entries.reduce((s: number, e: any) => s + (e.minutes || 0), 0);
              return (
                <div key={dateKey} data-testid={`group-date-${dateKey}`}>
                  <div className="flex items-center justify-between gap-2 mb-2 px-1">
                    <span className="text-sm font-semibold" data-testid={`text-date-label-${dateKey}`}>
                      {formatDateLabel(dateKey)}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium" data-testid={`text-date-total-${dateKey}`}>
                      {formatMinutes(dayTotal)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {entries.map((entry: any) => (
                      <Card key={entry.id} className="overflow-visible" data-testid={`card-time-entry-${entry.id}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold font-mono" data-testid={`text-entry-minutes-${entry.id}`}>
                                  {formatMinutes(entry.minutes)}
                                </span>
                                {entry.billable ? (
                                  <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px]">
                                    <DollarSign className="w-3 h-3 mr-0.5" />
                                    Billable
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Non-Billable
                                  </Badge>
                                )}
                              </div>
                              {entry.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2" data-testid={`text-entry-desc-${entry.id}`}>
                                  {entry.description}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {entry.ticket && (
                                  <span className="text-xs text-muted-foreground" data-testid={`text-entry-ticket-${entry.id}`}>
                                    #{entry.ticket.number} {entry.ticket.title}
                                  </span>
                                )}
                                {entry.client && (
                                  <span className="text-xs text-muted-foreground" data-testid={`text-entry-client-${entry.id}`}>
                                    {entry.client.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(entry)}
                                data-testid={`button-edit-entry-${entry.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setDeleteTarget(entry)}
                                data-testid={`button-delete-entry-${entry.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button
        size="lg"
        className="fixed bottom-20 right-4 rounded-full shadow-lg z-40 w-14 h-14 p-0"
        onClick={openCreate}
        data-testid="fab-log-time"
      >
        <Plus className="w-6 h-6" />
      </Button>

      <Sheet open={showSheet} onOpenChange={(open) => { setShowSheet(open); if (!open) setEditingEntry(null); }}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto rounded-t-lg">
          <SheetHeader>
            <SheetTitle data-testid="text-sheet-title">
              {editingEntry ? "Edit Time Entry" : "Log Time"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5 mt-4 pb-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Duration</Label>
              <div className="grid grid-cols-3 gap-2">
                {MINUTE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    variant={formData.minutes === preset ? "default" : "outline"}
                    className="text-sm"
                    onClick={() => setFormData((prev) => ({ ...prev, minutes: preset }))}
                    data-testid={`button-preset-${preset}`}
                  >
                    {formatMinutes(preset)}
                  </Button>
                ))}
              </div>
              {formData.minutes > 0 && !MINUTE_PRESETS.includes(formData.minutes) && (
                <p className="text-sm text-muted-foreground mt-2">
                  Custom: {formatMinutes(formData.minutes)}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Label className="text-xs text-muted-foreground shrink-0">Custom min:</Label>
                <input
                  type="number"
                  min={1}
                  value={formData.minutes || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Minutes"
                  data-testid="input-custom-minutes"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="What did you work on?"
                rows={2}
                data-testid="input-mobile-time-description"
              />
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Ticket</Label>
              <Select
                value={formData.ticketId || "__none__"}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, ticketId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger data-testid="select-mobile-time-ticket">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {tickets?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      #{t.number} {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium mb-1.5 block">Client</Label>
              <Select
                value={formData.clientId || "__none__"}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, clientId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger data-testid="select-mobile-time-client">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {clients?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Billable</Label>
              <Switch
                checked={formData.billable}
                onCheckedChange={(v) => setFormData((prev) => ({ ...prev, billable: v }))}
                data-testid="switch-mobile-time-billable"
              />
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSubmit}
              disabled={isSaving}
              data-testid="button-submit-mobile-time"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingEntry ? (
                "Update Entry"
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Log Time
                </>
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteTarget ? formatMinutes(deleteTarget.minutes) : ""} time entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
