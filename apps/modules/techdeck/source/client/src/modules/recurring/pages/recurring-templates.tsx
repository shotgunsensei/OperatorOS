import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, format } from "date-fns";

const priorityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  low: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const templateSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  clientId: z.string().optional(),
  assignedToId: z.string().optional(),
  cronExpression: z.string().min(1, "Cron expression is required"),
  enabled: z.boolean(),
});

type TemplateForm = z.infer<typeof templateSchema>;

export default function RecurringTemplatesPage() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<any[]>({
    queryKey: ["/api/recurring-templates"],
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });
  const { data: members } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateForm) => {
      const body: any = { ...data };
      if (!body.clientId) delete body.clientId;
      if (!body.assignedToId) delete body.assignedToId;
      if (!body.description) delete body.description;
      return apiRequest("POST", "/api/recurring-templates", body);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-templates"] });
      toast({ title: "Template created" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create template", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TemplateForm }) => {
      const body: any = { ...data };
      if (!body.clientId) delete body.clientId;
      if (!body.assignedToId) delete body.assignedToId;
      if (!body.description) delete body.description;
      return apiRequest("PUT", `/api/recurring-templates/${id}`, body);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-templates"] });
      toast({ title: "Template updated" });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: "Failed to update template", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/recurring-templates/${id}`),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-templates"] });
      toast({ title: "Template deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete template", description: err.message, variant: "destructive" });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/recurring-templates/${id}`, { enabled }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-templates"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update template", description: err.message, variant: "destructive" });
    },
  });

  const form = useForm<TemplateForm>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      clientId: "",
      assignedToId: "",
      cronExpression: "",
      enabled: true,
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.reset({
      title: "",
      description: "",
      priority: "medium",
      clientId: "",
      assignedToId: "",
      cronExpression: "",
      enabled: true,
    });
    setShowDialog(true);
  };

  const openEdit = (template: any) => {
    setEditingId(template.id);
    form.reset({
      title: template.title || "",
      description: template.description || "",
      priority: template.priority || "medium",
      clientId: template.clientId || "",
      assignedToId: template.assignedToId || "",
      cronExpression: template.cronExpression || "",
      enabled: template.enabled ?? true,
    });
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    form.reset();
  };

  const onSubmit = (data: TemplateForm) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients?.find((c: any) => c.id === clientId);
    return client?.name || "-";
  };

  const getMemberName = (userId: string) => {
    const member = members?.find((m: any) => m.userId === userId);
    if (member?.user) return `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim();
    return "-";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
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
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-recurring-title">
            Recurring Tickets
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage automated recurring ticket templates.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-create-template">
          <Plus className="w-4 h-4 mr-1" />
          New Template
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!templates?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <RefreshCw className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">No recurring templates</p>
              <p className="text-xs mt-1">Create a template to automate ticket creation.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={openCreate}
                data-testid="button-create-template-empty"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Template
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground font-medium">
                  <span className="flex-1">Title</span>
                  <span className="w-20">Priority</span>
                  <span className="w-28">Client</span>
                  <span className="w-32">Assigned To</span>
                  <span className="w-36">Schedule</span>
                  <span className="w-16 text-center">Enabled</span>
                  <span className="w-28">Next Run</span>
                  <span className="w-20">Actions</span>
                </div>
                {templates.map((template: any) => (
                  <div
                    key={template.id}
                    className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                    data-testid={`template-row-${template.id}`}
                  >
                    <span className="flex-1 text-sm font-medium truncate" data-testid={`text-template-title-${template.id}`}>
                      {template.title}
                    </span>
                    <span className="w-20">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${priorityColors[template.priority] || ""}`}
                        data-testid={`badge-priority-${template.id}`}
                      >
                        {template.priority}
                      </Badge>
                    </span>
                    <span className="w-28 text-xs text-muted-foreground truncate" data-testid={`text-client-${template.id}`}>
                      {template.clientId ? getClientName(template.clientId) : "-"}
                    </span>
                    <span className="w-32 text-xs text-muted-foreground truncate" data-testid={`text-assignee-${template.id}`}>
                      {template.assignedToId ? getMemberName(template.assignedToId) : "-"}
                    </span>
                    <span className="w-36 text-xs font-mono text-muted-foreground" data-testid={`text-cron-${template.id}`}>
                      {template.cronExpression || "-"}
                    </span>
                    <span className="w-16 flex justify-center">
                      <Switch
                        checked={template.enabled}
                        onCheckedChange={(checked) =>
                          toggleEnabledMutation.mutate({ id: template.id, enabled: checked })
                        }
                        data-testid={`switch-enabled-${template.id}`}
                      />
                    </span>
                    <span className="w-28 text-xs text-muted-foreground" data-testid={`text-nextrun-${template.id}`}>
                      {template.nextRunAt
                        ? format(new Date(template.nextRunAt), "MMM d, HH:mm")
                        : "-"}
                    </span>
                    <span className="w-20 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(template)}
                        data-testid={`button-edit-template-${template.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Delete this template?")) {
                            deleteMutation.mutate(template.id);
                          }
                        }}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ticket title" data-testid="input-template-title" />
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
                      <Textarea {...field} placeholder="Ticket description..." rows={3} data-testid="input-template-description" />
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
                          <SelectTrigger data-testid="select-template-priority">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
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
                          <SelectTrigger data-testid="select-template-client">
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
                        <SelectTrigger data-testid="select-template-assignee">
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
              <FormField
                control={form.control}
                name="cronExpression"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule (Cron)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="0 9 * * 1" data-testid="input-template-cron" />
                    </FormControl>
                    <FormDescription>
                      Format: minute hour day month weekday (e.g. "0 9 * * 1" = every Monday at 9am)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-template-enabled"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Enabled</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-template"
                >
                  {(createMutation.isPending || updateMutation.isPending)
                    ? "Saving..."
                    : editingId
                      ? "Update Template"
                      : "Create Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
