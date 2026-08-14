import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  MapPin,
  User,
  Clock,
  TicketIcon,
  CalendarDays,
  Edit,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  format,
  addDays,
  subDays,
  isSameDay,
  isToday,
  startOfDay,
  parseISO,
} from "date-fns";

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

const HOUR_START = 6;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 72;

function toLocalDatetimeValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

const appointmentColors = [
  "bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  "bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300",
  "bg-orange-500/20 border-orange-500/40 text-orange-700 dark:text-orange-300",
  "bg-pink-500/20 border-pink-500/40 text-pink-700 dark:text-pink-300",
  "bg-teal-500/20 border-teal-500/40 text-teal-700 dark:text-teal-300",
];

function hashColor(id: string | null | undefined): string {
  if (!id) return appointmentColors[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return appointmentColors[hash % appointmentColors.length];
}

export default function MobileCalendarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: tenantInfo } = useQuery<{ role: string }>({ queryKey: ["/api/tenant"] });
  const canDelete = tenantInfo?.role === "OWNER" || tenantInfo?.role === "ADMIN";
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [viewingAppointment, setViewingAppointment] = useState<any | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<any | null>(null);

  const dateStr = format(currentDate, "yyyy-MM-dd");

  const { data: appointments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", `startDate=${dateStr}&endDate=${dateStr}`],
    queryFn: async () => {
      const res = await fetch(
        `/api/appointments?startDate=${dateStr}&endDate=${dateStr}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load appointments");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: tickets } = useQuery<any[]>({ queryKey: ["/api/tickets"] });
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const dayAppointments = useMemo(() => {
    if (!appointments) return [];
    return appointments
      .filter((a: any) => isSameDay(new Date(a.startTime), currentDate))
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [appointments, currentDate]);

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
      setShowCreateSheet(false);
      createForm.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
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
      setViewingAppointment(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment deleted" });
      setViewingAppointment(null);
      setEditingAppointment(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
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

  const goToPrevDay = () => setCurrentDate((d) => subDays(d, 1));
  const goToNextDay = () => setCurrentDate((d) => addDays(d, 1));
  const goToToday = () => setCurrentDate(new Date());

  const openCreateSheet = () => {
    const now = new Date();
    const start = new Date(currentDate);
    start.setHours(now.getHours() + 1, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    createForm.reset({
      title: "",
      description: "",
      startTime: toLocalDatetimeValue(start),
      endTime: toLocalDatetimeValue(end),
      clientId: "",
      siteId: "",
      ticketId: "",
      assignedToId: "",
    });
    setShowCreateSheet(true);
  };

  const openEditSheet = (appt: any) => {
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

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return null;
    const c = clients.find((cl: any) => cl.id === clientId);
    return c?.name || null;
  };

  const getAssigneeName = (assignedToId: string | null) => {
    if (!assignedToId || !members) return null;
    const m = members.find((mem: any) => mem.userId === assignedToId);
    return m?.user ? `${m.user.firstName || ""} ${m.user.lastName || ""}`.trim() : null;
  };

  const getTicketInfo = (ticketId: string | null) => {
    if (!ticketId || !tickets) return null;
    const t = tickets.find((tk: any) => tk.id === ticketId);
    return t ? `#${t.number} ${t.title}` : null;
  };

  function getAppointmentStyle(appt: any) {
    const start = new Date(appt.startTime);
    const end = new Date(appt.endTime);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const clampedStart = Math.max(startHour, HOUR_START);
    const clampedEnd = Math.min(endHour, HOUR_END);
    const top = (clampedStart - HOUR_START) * HOUR_HEIGHT;
    const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 28);
    return { top: `${top}px`, height: `${height}px` };
  }

  const isTodayDate = isToday(currentDate);

  const renderFormFields = (form: any, prefix: string) => (
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 gap-4">
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
        name="ticketId"
        render={({ field }: any) => (
          <FormItem>
            <FormLabel>Linked Ticket</FormLabel>
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
  );

  return (
      <div className="flex flex-col h-full" data-testid="mobile-calendar-page">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background sticky top-0 z-10">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goToPrevDay} data-testid="button-prev-day">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center min-w-[120px]">
              <div className="text-sm font-semibold" data-testid="text-current-date">
                {format(currentDate, "EEE, MMM d")}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(currentDate, "yyyy")}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={goToNextDay} data-testid="button-next-day">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          {!isTodayDate && (
            <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
              <CalendarDays className="w-4 h-4 mr-1" />
              Today
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : dayAppointments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <CalendarDays className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground font-medium" data-testid="text-no-appointments">
              No appointments for this day
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the + button to schedule one
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="relative" style={{ minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-b border-border/40"
                  style={{ top: `${(hour - HOUR_START) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-[10px] text-muted-foreground pl-2 pt-0.5 inline-block w-12">
                    {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                  </span>
                </div>
              ))}

              {dayAppointments.map((appt: any) => {
                const style = getAppointmentStyle(appt);
                const colorClass = hashColor(appt.assignedToId);
                const clientName = getClientName(appt.clientId);
                const assigneeName = getAssigneeName(appt.assignedToId);

                return (
                  <div
                    key={appt.id}
                    className={`absolute left-14 right-2 rounded-md border px-2.5 py-1.5 cursor-pointer ${colorClass}`}
                    style={{ top: style.top, height: style.height, minHeight: "28px", zIndex: 5 }}
                    onClick={() => setViewingAppointment(appt)}
                    data-testid={`appointment-card-${appt.id}`}
                  >
                    <div className="text-xs font-semibold truncate">{appt.title}</div>
                    <div className="text-[10px] opacity-80 truncate">
                      {format(new Date(appt.startTime), "h:mm a")} - {format(new Date(appt.endTime), "h:mm a")}
                    </div>
                    {clientName && (
                      <div className="text-[10px] opacity-70 truncate">{clientName}</div>
                    )}
                    {assigneeName && (
                      <div className="text-[10px] opacity-70 truncate">{assigneeName}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          className="fixed bottom-20 right-4 rounded-full w-14 h-14 shadow-lg z-20"
          onClick={openCreateSheet}
          data-testid="fab-new-appointment"
        >
          <Plus className="w-6 h-6" />
        </Button>

        <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto rounded-t-lg">
            <SheetHeader>
              <SheetTitle>New Appointment</SheetTitle>
            </SheetHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
                className="mt-4 space-y-4"
              >
                {renderFormFields(createForm, "mobile-create")}
                <SheetFooter className="pt-2">
                  <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-create-appointment">
                    {createMutation.isPending ? "Creating..." : "Create Appointment"}
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>

        <Sheet open={!!viewingAppointment && !editingAppointment} onOpenChange={(open) => { if (!open) setViewingAppointment(null); }}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-auto rounded-t-lg">
            {viewingAppointment && (
              <>
                <SheetHeader>
                  <SheetTitle data-testid="text-appointment-title">{viewingAppointment.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span data-testid="text-appointment-time">
                      {format(new Date(viewingAppointment.startTime), "h:mm a")} - {format(new Date(viewingAppointment.endTime), "h:mm a")}
                    </span>
                  </div>

                  {viewingAppointment.description && (
                    <p className="text-sm text-muted-foreground" data-testid="text-appointment-description">
                      {viewingAppointment.description}
                    </p>
                  )}

                  {getClientName(viewingAppointment.clientId) && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid="text-appointment-client">{getClientName(viewingAppointment.clientId)}</span>
                    </div>
                  )}

                  {viewingAppointment.site && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid="text-appointment-site">{viewingAppointment.site.name}</span>
                    </div>
                  )}

                  {getAssigneeName(viewingAppointment.assignedToId) && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid="text-appointment-assignee">{getAssigneeName(viewingAppointment.assignedToId)}</span>
                    </div>
                  )}

                  {getTicketInfo(viewingAppointment.ticketId) && (
                    <div className="flex items-center gap-2 text-sm">
                      <TicketIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate" data-testid="text-appointment-ticket">
                        {getTicketInfo(viewingAppointment.ticketId)}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEditSheet(viewingAppointment)}
                      data-testid="button-edit-appointment"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    {canDelete && (
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => deleteMutation.mutate(viewingAppointment.id)}
                        disabled={deleteMutation.isPending}
                        data-testid="button-delete-appointment"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        <Sheet open={!!editingAppointment} onOpenChange={(open) => { if (!open) setEditingAppointment(null); }}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto rounded-t-lg">
            <SheetHeader>
              <SheetTitle>Edit Appointment</SheetTitle>
            </SheetHeader>
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit((data) =>
                  updateMutation.mutate({ id: editingAppointment?.id, data })
                )}
                className="mt-4 space-y-4"
              >
                {renderFormFields(editForm, "mobile-edit")}
                <SheetFooter className="pt-2">
                  <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-submit-edit-appointment">
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>
  );
}
