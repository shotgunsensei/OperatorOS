import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MinusCircle,
  Plus,
  Save,
  Trash2,
  XCircle,
  AlertTriangle,
  Info,
} from "lucide-react";

const COMPONENT_STATUS_OPTIONS = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "partial_outage", label: "Partial Outage" },
  { value: "major_outage", label: "Major Outage" },
  { value: "maintenance", label: "Maintenance" },
] as const;

const INCIDENT_SEVERITY_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "critical", label: "Critical" },
] as const;

const INCIDENT_STATUS_OPTIONS = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
] as const;

function statusIcon(status: string) {
  switch (status) {
    case "operational": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "degraded": return <MinusCircle className="w-4 h-4 text-yellow-500" />;
    case "partial_outage": return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case "major_outage": return <XCircle className="w-4 h-4 text-red-500" />;
    case "maintenance": return <Clock className="w-4 h-4 text-blue-500" />;
    default: return <CheckCircle2 className="w-4 h-4 text-muted-foreground" />;
  }
}

function severityBadge(severity: string) {
  const variants: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    minor: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    major: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return <Badge className={variants[severity] || ""}>{severity}</Badge>;
}

function severityIcon(severity: string) {
  switch (severity) {
    case "info": return <Info className="w-4 h-4 text-blue-500" />;
    case "minor": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "major": return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case "critical": return <XCircle className="w-4 h-4 text-red-500" />;
    default: return <Info className="w-4 h-4" />;
  }
}

export default function StatusAdminPage() {
  const { toast } = useToast();

  const { data: page, isLoading: pageLoading } = useQuery<any>({ queryKey: ["/api/status/page"] });
  const { data: components = [], isLoading: componentsLoading } = useQuery<any[]>({ queryKey: ["/api/status/components"] });
  const { data: incidents = [], isLoading: incidentsLoading } = useQuery<any[]>({ queryKey: ["/api/status/incidents"] });

  const [pageForm, setPageForm] = useState<{ title: string; publicSlug: string; isPublic: boolean; description: string }>({
    title: "", publicSlug: "", isPublic: false, description: "",
  });
  const [pageFormInit, setPageFormInit] = useState(false);

  if (page && !pageFormInit) {
    setPageForm({
      title: page.title || "",
      publicSlug: page.publicSlug || "",
      isPublic: page.isPublic || false,
      description: page.description || "",
    });
    setPageFormInit(true);
  }

  const savePageMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/status/page", pageForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/page"] });
      toast({ title: "Status page saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const [newComponentName, setNewComponentName] = useState("");
  const createComponentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/status/components", { name: newComponentName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/components"] });
      setNewComponentName("");
      toast({ title: "Component added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateComponentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/status/components/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/components"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteComponentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/status/components/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/components"] });
      toast({ title: "Component deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ title: "", description: "", severity: "info" as string, status: "investigating" as string });

  const createIncidentMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/status/incidents", incidentForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/incidents"] });
      setIncidentDialogOpen(false);
      setIncidentForm({ title: "", description: "", severity: "info", status: "investigating" });
      toast({ title: "Incident created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/status/incidents/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/incidents"] });
      toast({ title: "Incident updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteIncidentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/status/incidents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/status/incidents"] });
      toast({ title: "Incident deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const isLoading = pageLoading || componentsLoading || incidentsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-status-admin-title">Status Pages</h1>
          <p className="text-sm text-muted-foreground">Manage your public status page, components, and incidents.</p>
        </div>
        {page?.isPublic && page?.publicSlug && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/status/${page.publicSlug}`} target="_blank" rel="noopener noreferrer" data-testid="link-view-public-status">
              <ExternalLink className="w-4 h-4 mr-1" />
              View Public Page
            </a>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={pageForm.title}
              onChange={(e) => setPageForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Service Status"
              data-testid="input-status-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Public Slug</Label>
            <Input
              value={pageForm.publicSlug}
              onChange={(e) => setPageForm((p) => ({ ...p, publicSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              placeholder="my-company"
              data-testid="input-status-slug"
            />
            <p className="text-xs text-muted-foreground">
              Public URL: /status/{pageForm.publicSlug || "my-slug"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={pageForm.description}
              onChange={(e) => setPageForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Current status of our services"
              data-testid="input-status-description"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={pageForm.isPublic}
              onCheckedChange={(v) => setPageForm((p) => ({ ...p, isPublic: v }))}
              data-testid="switch-status-public"
            />
            <Label>Publish status page publicly</Label>
          </div>
          <Button
            onClick={() => savePageMutation.mutate()}
            disabled={savePageMutation.isPending || !pageForm.title || !pageForm.publicSlug}
            data-testid="button-save-status-page"
          >
            {savePageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Page Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Components</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {components.map((comp: any) => (
            <div key={comp.id} className="flex flex-wrap items-center gap-3 p-3 rounded-md border" data-testid={`status-component-${comp.id}`}>
              {statusIcon(comp.status)}
              <span className="font-medium text-sm flex-1 min-w-0 truncate">{comp.name}</span>
              <Select
                value={comp.status}
                onValueChange={(val) => updateComponentMutation.mutate({ id: comp.id, data: { status: val } })}
              >
                <SelectTrigger className="w-[160px]" data-testid={`select-component-status-${comp.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENT_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteComponentMutation.mutate(comp.id)}
                data-testid={`button-delete-component-${comp.id}`}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <Input
              value={newComponentName}
              onChange={(e) => setNewComponentName(e.target.value)}
              placeholder="New component name"
              className="flex-1"
              data-testid="input-new-component-name"
              onKeyDown={(e) => { if (e.key === "Enter" && newComponentName.trim()) createComponentMutation.mutate(); }}
            />
            <Button
              onClick={() => createComponentMutation.mutate()}
              disabled={!newComponentName.trim() || createComponentMutation.isPending}
              data-testid="button-add-component"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Incidents</CardTitle>
          <Dialog open={incidentDialogOpen} onOpenChange={setIncidentDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-incident">
                <Plus className="w-4 h-4 mr-1" />
                New Incident
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Incident</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={incidentForm.title}
                    onChange={(e) => setIncidentForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Service disruption"
                    data-testid="input-incident-title"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={incidentForm.description}
                    onChange={(e) => setIncidentForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Describe the incident..."
                    data-testid="input-incident-description"
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1.5 flex-1">
                    <Label>Severity</Label>
                    <Select value={incidentForm.severity} onValueChange={(v) => setIncidentForm((f) => ({ ...f, severity: v }))}>
                      <SelectTrigger data-testid="select-incident-severity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INCIDENT_SEVERITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <Label>Status</Label>
                    <Select value={incidentForm.status} onValueChange={(v) => setIncidentForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger data-testid="select-incident-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INCIDENT_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={() => createIncidentMutation.mutate()}
                  disabled={!incidentForm.title.trim() || !incidentForm.description.trim() || createIncidentMutation.isPending}
                  className="w-full"
                  data-testid="button-submit-incident"
                >
                  {createIncidentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                  Create Incident
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No incidents recorded.</p>
          )}
          {incidents.map((inc: any) => (
            <div key={inc.id} className="p-3 rounded-md border space-y-2" data-testid={`status-incident-${inc.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                {severityIcon(inc.severity)}
                <span className="font-medium text-sm flex-1 min-w-0">{inc.title}</span>
                {severityBadge(inc.severity)}
                <Badge variant="outline" className="text-xs">{inc.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{inc.description}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Select
                  value={inc.status}
                  onValueChange={(v) => updateIncidentMutation.mutate({ id: inc.id, data: { status: v } })}
                >
                  <SelectTrigger className="w-[140px]" data-testid={`select-incident-status-${inc.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteIncidentMutation.mutate(inc.id)}
                  data-testid={`button-delete-incident-${inc.id}`}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
