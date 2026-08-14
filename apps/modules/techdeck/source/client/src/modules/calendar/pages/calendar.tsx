import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { z } from "zod";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  addDays,
  isSameDay,
} from "date-fns";

const HOUR_START = 8;
const HOUR_END = 18;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

const appointmentColors = [
  "bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  "bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300",
  "bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-300",
  "bg-pink-500/20 border-pink-500/40 text-pink-700 dark:text-pink-300",
  "bg-teal-500/20 border-teal-500/40 text-teal-700 dark:text-teal-300",
  "bg-indigo-500/20 border-indigo-500/40 text-indigo-700 dark:text-indigo-300",
  "bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300",
];

function hashColor(id: string | null | undefined): string {
  if (!id) return appointmentColors[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return appointmentColors[hash % appointmentColors.length];
}

const appointmentSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  clientId: z.string().optional(),
  siteId: z.string().optional(),
  ticketId: z.string().optional(),
  assignedToId: z.string().optional(),
});

type AppointmentForm = z.infer<typeof appointmentSchema>;

function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
  }
  if (weekStart.getFullYear() === weekEnd.getFullYear()) {
    return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
  }
  return `${format(weekStart, "MMM d, yyyy")} - ${format(weekEnd, "MMM d, yyyy")}`;
}

function toLocalDatetimeValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any | null>(null);

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(weekEnd, "yyyy-MM-dd");

  const { data: appointments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", `startDate=${startDate}&endDate=${endDate}`],
    queryFn: async () => {
      const res = await fetch(
        `/api/appointments?startDate=${startDate}&endDate=${endDate}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load appointments");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: sites } = useQuery<any[]>({ queryKey: ["/api/sites"] });
  const { data: tickets } = useQuery<any[]>({ queryKey: ["/api/tickets"] });
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const createMutation = useMutation({
    mutationFn: async (data: AppointmentForm) => {
      const body: any = { ...data };
      if (body.startTime) body.startTime = new Date(body.startTime).toISOString();
      if (body.endTime) body.endTime = new Date(body.endTime).toISOString();
      if (!body.clientId) delete body.clientId;
      if (!body.siteId) delete body.siteId;
      if (!body.ticketId) delete body.ticketId;
      if (!body.assignedToId) delete body.assignedToId;
      return apiRequest("POST", "/api/appointments", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment created" });
      setShowCreateDialog(false);
      createForm.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create appointment", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AppointmentForm }) => {
      const body: any = { ...data };
      if (body.startTime) body.startTime = new Date(body.startTime).toISOString();
      if (body.endTime) body.endTime = new Date(body.endTime).toISOString();
      if (!body.clientId) delete body.clientId;
      if (!body.siteId) delete body.siteId;
      if (!body.ticketId) delete body.ticketId;
      if (!body.assignedToId) delete body.assignedToId;
      return apiRequest("PUT", `/api/appointments/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment updated" });
      setEditingAppointment(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update appointment", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment deleted" });
      setEditingAppointment(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete appointment", description: err.message, variant: "destructive" });
    },
  });

  const createForm = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: "",
      description: "",
      startTime: "",
      endTime: "",
      clientId: "",
      siteId: "",
      ticketId: "",
      assignedToId: "",
    },
  });

  const editForm = useForm<AppointmentForm>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: "",
      description: "",
      startTime: "",
      endTime: "",
      clientId: "",
      siteId: "",
      ticketId: "",
      assignedToId: "",
    },
  });

  const openEditDialog = (appt: any) => {
    setEditingAppointment(appt);
    editForm.reset({
      title: appt.title || "",
      description: appt.description || "",
      startTime: appt.startTime ? toLocalDatetimeValue(new Date(appt.startTime)) : "",
      endTime: appt.endTime ? toLocalDatetimeValue(new Date(appt.endTime)) : "",
      clientId: appt.clientId || "",
      siteId: appt.siteId || "",
      ticketId: appt.ticketId || "",
      assignedToId: appt.assignedToId || "",
    });
  };

  const goToToday = () => setCurrentDate(new Date());
  const goToPrevWeek = () => setCurrentDate((d) => subWeeks(d, 1));
  const goToNextWeek = () => setCurrentDate((d) => addWeeks(d, 1));

  function getAppointmentsForDay(day: Date) {
    if (!appointments) return [];
    return appointments.filter((a: any) => {
      const start = new Date(a.startTime);
      return isSameDay(start, day);
    });
  }

  function getAppointmentPosition(appt: any) {
    const start = new Date(appt.startTime);
    const end = new Date(appt.endTime);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const clampedStart = Math.max(startHour, HOUR_START);
    const clampedEnd = Math.min(endHour, HOUR_END);
    const top = ((clampedStart - HOUR_START) / (HOUR_END - HOUR_START)) * 100;
    const height = ((clampedEnd - clampedStart) / (HOUR_END - HOUR_START)) * 100;
    return { top: `${top}%`, height: `${Math.max(height, 2)}%` };
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full rounded-md" />
      </div>
    );
  }

  const renderFormFields = (form: any, prefix: string) => (
    <>
      <FormField
        control={form.control}
        name="title"
        render={({ field }: any) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Appointment title" data-testid={`input-${prefix}-title`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }: any) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Optional description..." rows={2} data-testid={`input-${prefix}-description`} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="startTime"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Start Time</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} data-testid={`input-${prefix}-start-time`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="endTime"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>End Time</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} data-testid={`input-${prefix}-end-time`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="clientId"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Client</FormLabel>
              <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                <FormControl>
                  <SelectTrigger data-testid={`select-${prefix}-client`}>
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
          name="siteId"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Site</FormLabel>
              <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                <FormControl>
                  <SelectTrigger data-testid={`select-${prefix}-site`}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {sites?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
          name="ticketId"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Ticket</FormLabel>
              <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                <FormControl>
                  <SelectTrigger data-testid={`select-${prefix}-ticket`}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {tickets?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      #{t.number} - {t.title}
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
          name="assignedToId"
          render={({ field }: any) => (
            <FormItem>
              <FormLabel>Assigned To</FormLabel>
              <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
                <FormControl>
                  <SelectTrigger data-testid={`select-${prefix}-assignee`}>
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
      </div>
    </>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-calendar-title">
            Dispatch Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            Schedule and manage field appointments.
          </p>
        </div>
        <Button onClick={() => { createForm.reset(); setShowCreateDialog(true); }} data-testid="button-new-appointment">
          <Plus className="w-4 h-4 mr-1" />
          New Appointment
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" onClick={goToPrevWeek} data-testid="button-prev-week">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" onClick={goToToday} data-testid="button-today">
          Today
        </Button>
        <Button variant="outline" size="icon" onClick={goToNextWeek} data-testid="button-next-week">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium ml-2" data-testid="text-week-range">
          {formatWeekRange(weekStart)}
        </span>
      </div>

      <Card className="overflow-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
            <div className="p-2 text-xs text-muted-foreground font-medium border-r" />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={i}
                  className={`p-2 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                  data-testid={`header-day-${i}`}
                >
                  <div className="text-xs text-muted-foreground font-medium">
                    {format(day, "EEE")}
                  </div>
                  <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            <div className="border-r">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-16 border-b last:border-b-0 flex items-start justify-end pr-2 pt-0.5"
                >
                  <span className="text-xs text-muted-foreground">
                    {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                  </span>
                </div>
              ))}
            </div>

            {weekDays.map((day, dayIndex) => {
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={dayIndex}
                  className={`relative border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                  data-testid={`day-column-${dayIndex}`}
                >
                  {HOURS.map((hour) => (
                    <div key={hour} className="h-16 border-b last:border-b-0" />
                  ))}

                  {dayAppointments.map((appt: any) => {
                    const pos = getAppointmentPosition(appt);
                    const colorClass = hashColor(appt.assignedToId);
                    return (
                      <div
                        key={appt.id}
                        className={`absolute left-0.5 right-0.5 rounded-md border px-1 py-0.5 cursor-pointer overflow-hidden ${colorClass}`}
                        style={{ top: pos.top, height: pos.height, minHeight: "20px" }}
                        onClick={() => openEditDialog(appt)}
                        data-testid={`appointment-block-${appt.id}`}
                      >
                        <div className="text-xs font-medium truncate">{appt.title}</div>
                        <div className="text-[10px] opacity-70 truncate">
                          {format(new Date(appt.startTime), "h:mm a")} - {format(new Date(appt.endTime), "h:mm a")}
                        </div>
                        {appt.assignedUser && (
                          <div className="text-[10px] opacity-70 truncate">
                            {appt.assignedUser.firstName} {appt.assignedUser.lastName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              {renderFormFields(createForm, "create")}
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create-appointment">
                  {createMutation.isPending ? "Creating..." : "Create Appointment"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAppointment} onOpenChange={(open) => { if (!open) setEditingAppointment(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) =>
                updateMutation.mutate({ id: editingAppointment?.id, data }),
              )}
              className="space-y-4"
            >
              {renderFormFields(editForm, "edit")}
              <DialogFooter className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => editingAppointment && deleteMutation.mutate(editingAppointment.id)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-appointment"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit-appointment">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
