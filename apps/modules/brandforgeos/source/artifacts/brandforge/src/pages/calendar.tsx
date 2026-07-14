import { useState, useMemo } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useListCalendarItems, useCreateCalendarItem, useUpdateCalendarItem, useDeleteCalendarItem, getListCalendarItemsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, ChevronLeft, ChevronRight, Trash2, Calendar as CalIcon,
  Filter, LayoutGrid, List, Clock, AlertCircle,
} from "lucide-react";

const itemTypes = ["post", "email", "ad", "blog", "video", "event", "launch", "other"];
const channels = ["instagram", "twitter", "linkedin", "facebook", "youtube", "tiktok", "email", "blog", "google_ads"];
const statuses = ["idea", "planned", "in_progress", "scheduled", "published"];

const typeColors: Record<string, string> = {
  post: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  email: "bg-green-500/20 text-green-700 dark:text-green-400",
  ad: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
  blog: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  video: "bg-red-500/20 text-red-700 dark:text-red-400",
  event: "bg-pink-500/20 text-pink-700 dark:text-pink-400",
  launch: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  other: "bg-gray-500/20 text-gray-700 dark:text-gray-400",
};

export default function CalendarPage() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useListCalendarItems(tenantId!, {}, { query: { enabled: !!tenantId } });
  const createItem = useCreateCalendarItem();
  const updateItem = useUpdateCalendarItem();
  const deleteItem = useDeleteCalendarItem();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", itemType: "post", channel: "instagram", scheduledDate: "", description: "", status: "planned" });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "list">("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const filteredItems = useMemo(() => {
    return items?.filter(item => {
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      return true;
    }) || [];
  }, [items, typeFilter, statusFilter]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      const dateStr = item.scheduledDate;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(item);
    });
    return map;
  }, [filteredItems]);

  const handleCreate = () => {
    if (!tenantId || !form.title || !form.scheduledDate) return;
    createItem.mutate(
      { tenantId, data: form },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCalendarItemsQueryKey(tenantId) }); setOpen(false); setForm({ title: "", itemType: "post", channel: "instagram", scheduledDate: "", description: "", status: "planned" }); } }
    );
  };

  const handleStatusChange = (itemId: number, newStatus: string) => {
    if (!tenantId) return;
    updateItem.mutate(
      { tenantId, itemId, data: { status: newStatus } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCalendarItemsQueryKey(tenantId) }) }
    );
  };

  const prev = () => setCurrentDate(new Date(year, month - 1));
  const next = () => setCurrentDate(new Date(year, month + 1));
  const today = () => setCurrentDate(new Date());

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const todayStr = new Date().toISOString().split("T")[0];

  const overdueItems = filteredItems.filter(item =>
    item.scheduledDate < todayStr && item.status !== "published"
  );

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
            <p className="text-muted-foreground text-sm">Plan, schedule, and track your content</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Content</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Schedule Content</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Blog post: How to..." className="mt-1" /></div>
                <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate} onChange={e => setForm({...form, scheduledDate: e.target.value})} className="mt-1" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={form.itemType} onValueChange={v => setForm({...form, itemType: v})}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{itemTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Channel</Label>
                    <Select value={form.channel} onValueChange={v => setForm({...form, channel: v})}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{channels.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} placeholder="Brief description..." className="mt-1" /></div>
                <Button onClick={handleCreate} disabled={!form.title || !form.scheduledDate} className="w-full rounded-full">Schedule Content</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {overdueItems.length > 0 && (
          <Card className="border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10">
            <CardContent className="py-3 flex items-center gap-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-400">{overdueItems.length} overdue item{overdueItems.length > 1 ? "s" : ""} — consider rescheduling or marking as published</span>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-28 h-8 text-xs rounded-full"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {itemTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={today} className="rounded-full text-xs h-7">Today</Button>
            <div className="flex gap-1">
              <Button variant={view === "month" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("month")}><LayoutGrid className="h-3.5 w-3.5" /></Button>
              <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("list")}><List className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>

        {view === "month" ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
                <CardTitle className="text-lg font-semibold">{monthName}</CardTitle>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px mb-1">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                  if (day === null) return <div key={`empty-${i}`} className="min-h-[90px]" />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayItems = itemsByDate[dateStr] || [];
                  const isToday = todayStr === dateStr;
                  const isSelected = selectedDay === dateStr;
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                      className={`min-h-[90px] rounded-lg p-1.5 text-left transition-all ${
                        isSelected ? "bg-primary/10 ring-1 ring-primary/30" :
                        isToday ? "bg-primary/5 ring-1 ring-primary/20" :
                        "hover:bg-muted/50"
                      }`}
                    >
                      <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {isToday ? <span className="w-5 h-5 rounded-full bg-primary text-white inline-flex items-center justify-center text-[10px]">{day}</span> : day}
                      </div>
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map(item => (
                          <div key={item.id} className={`text-[9px] px-1.5 py-0.5 rounded font-medium truncate ${typeColors[item.itemType] || typeColors.other}`}>
                            {item.title}
                          </div>
                        ))}
                        {dayItems.length > 3 && <div className="text-[9px] text-muted-foreground pl-1">+{dayItems.length - 3} more</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {(selectedDay && itemsByDate[selectedDay]?.length > 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{new Date(selectedDay + "T00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {itemsByDate[selectedDay].map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg group">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge className={`text-[10px] ${typeColors[item.itemType] || ""} border-0`}>{item.itemType}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{item.channel?.replace(/_/g, " ")}</Badge>
                      <Select value={item.status} onValueChange={(v) => handleStatusChange(item.id, v)}>
                        <SelectTrigger className="h-5 text-[10px] w-24 border-0 bg-transparent px-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{statuses.map(s => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => tenantId && deleteItem.mutate({ tenantId, itemId: item.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCalendarItemsQueryKey(tenantId) }) })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {view === "list" && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">All Scheduled Content</CardTitle>
                <Badge variant="secondary" className="text-xs">{filteredItems.length} items</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center">
                  <CalIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mb-3">No content scheduled yet</p>
                  <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="rounded-full">Schedule your first content</Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[...filteredItems].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).map(item => {
                    const isOverdue = item.scheduledDate < todayStr && item.status !== "published";
                    return (
                      <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg group transition-colors ${isOverdue ? "bg-red-50/50 dark:bg-red-900/10" : "bg-muted/30 hover:bg-muted/50"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{item.title}</p>
                            {isOverdue && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" /> {item.scheduledDate}
                            </span>
                            <Badge className={`text-[10px] ${typeColors[item.itemType] || ""} border-0`}>{item.itemType}</Badge>
                            <Badge variant="outline" className="text-[10px] capitalize">{item.status?.replace(/_/g, " ")}</Badge>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => tenantId && deleteItem.mutate({ tenantId, itemId: item.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCalendarItemsQueryKey(tenantId) }) })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
