import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FolderOpen, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";

export default function IntakeSpacesPage() {
  const { toast } = useToast();
  const { data: spaces, isLoading, error } = useQuery<any[]>({ queryKey: ["/api/secure-intake/spaces"] });
  const [open, setOpen] = useState(false);
  const [editSpace, setEditSpace] = useState<any>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", maxFileSizeMb: 25, externalUploadsEnabled: true, allowedFileTypes: "" });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/secure-intake/spaces", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      toast({ title: "Space created" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/secure-intake/spaces/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/spaces"] });
      toast({ title: "Space updated" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/secure-intake/spaces/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      toast({ title: "Space deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setForm({ name: "", slug: "", description: "", maxFileSizeMb: 25, externalUploadsEnabled: true, allowedFileTypes: "" });
    setEditSpace(null);
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      allowedFileTypes: form.allowedFileTypes ? form.allowedFileTypes.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    };
    if (editSpace) {
      updateMutation.mutate({ id: editSpace.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEdit = (space: any) => {
    setEditSpace(space);
    setForm({
      name: space.name,
      slug: space.slug,
      description: space.description || "",
      maxFileSizeMb: space.maxFileSizeMb,
      externalUploadsEnabled: space.externalUploadsEnabled,
      allowedFileTypes: (space.allowedFileTypes || []).join(", "),
    });
    setOpen(true);
  };

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Spaces" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">Failed to load spaces</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Spaces" }]} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-spaces-title">Intake Spaces</h1>
            <p className="text-sm text-muted-foreground">Organize file intake by department, client, or purpose</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-space"><Plus className="w-4 h-4 mr-2" />Create Space</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editSpace ? "Edit Space" : "Create Intake Space"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value, ...(editSpace ? {} : { slug: autoSlug(e.target.value) }) }); }} required data-testid="input-space-name" />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required pattern="^[a-z0-9-]+$" data-testid="input-space-slug" disabled={!!editSpace} />
                  <p className="text-xs text-muted-foreground">URL-safe identifier (lowercase, hyphens only)</p>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-space-description" />
                </div>
                <div className="space-y-2">
                  <Label>Max File Size (MB)</Label>
                  <Input type="number" min={1} max={5120} value={form.maxFileSizeMb} onChange={(e) => setForm({ ...form, maxFileSizeMb: parseInt(e.target.value) || 25 })} data-testid="input-space-max-size" />
                </div>
                <div className="space-y-2">
                  <Label>Allowed File Types</Label>
                  <Input value={form.allowedFileTypes} onChange={(e) => setForm({ ...form, allowedFileTypes: e.target.value })} placeholder="pdf, docx, jpg (leave empty for all)" data-testid="input-space-file-types" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>External Uploads Enabled</Label>
                  <Switch checked={form.externalUploadsEnabled} onCheckedChange={(v) => setForm({ ...form, externalUploadsEnabled: v })} data-testid="switch-external-uploads" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-space">
                    {editSpace ? "Update" : "Create"} Space
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(!spaces || spaces.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">No intake spaces yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first space to start receiving files</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>Create Space</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space: any) => (
            <Card key={space.id} className="hover-elevate" data-testid={`card-space-${space.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{space.name}</CardTitle>
                  <Badge variant={space.status === "active" ? "default" : "secondary"}>{space.status}</Badge>
                </div>
                <CardDescription className="font-mono text-xs">/{space.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {space.description && <p className="text-sm text-muted-foreground line-clamp-2">{space.description}</p>}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>Max: {space.maxFileSizeMb}MB</span>
                  {space.allowedFileTypes?.length > 0 && <span>Types: {space.allowedFileTypes.join(", ")}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant={space.externalUploadsEnabled ? "outline" : "secondary"} className="text-xs">
                    {space.externalUploadsEnabled ? "External uploads on" : "External uploads off"}
                  </Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(space)} data-testid={`button-edit-space-${space.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this space and all its files?")) deleteMutation.mutate(space.id); }} data-testid={`button-delete-space-${space.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
