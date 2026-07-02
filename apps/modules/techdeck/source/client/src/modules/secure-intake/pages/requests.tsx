import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Copy, XCircle, ExternalLink, Check, Upload, AlertCircle } from "lucide-react";

export default function IntakeRequestsPage() {
  const { toast } = useToast();
  const { data: requests, isLoading, error } = useQuery<any[]>({ queryKey: ["/api/secure-intake/requests"] });
  const { data: spaces } = useQuery<any[]>({ queryKey: ["/api/secure-intake/spaces"] });
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    spaceId: "", title: "", uploaderName: "", uploaderEmail: "", instructions: "",
    maxUploads: "", maxTotalSizeMb: "", oneTimeUse: false, requiresPassword: false, password: "",
    expiresAt: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/secure-intake/requests", data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      const data = await res.json();
      if (data.uploadUrl) {
        try {
          await navigator.clipboard.writeText(data.uploadUrl);
          toast({ title: "Upload request created", description: "Upload link copied to clipboard" });
        } catch {
          toast({ title: "Upload request created", description: data.uploadUrl });
        }
      } else {
        toast({ title: "Upload request created" });
      }
      resetForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/secure-intake/requests/${id}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      toast({ title: "Request revoked" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setForm({ spaceId: "", title: "", uploaderName: "", uploaderEmail: "", instructions: "", maxUploads: "", maxTotalSizeMb: "", oneTimeUse: false, requiresPassword: false, password: "", expiresAt: "" });
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      maxUploads: form.maxUploads ? parseInt(form.maxUploads) : null,
      maxTotalSizeMb: form.maxTotalSizeMb ? parseInt(form.maxTotalSizeMb) : null,
      expiresAt: form.expiresAt || null,
    });
  };

  const copyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/t/upload/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast({ title: "Upload link copied" });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: url });
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "active": return "default" as const;
      case "completed": return "secondary" as const;
      case "expired": return "outline" as const;
      case "revoked": return "destructive" as const;
      default: return "secondary" as const;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Upload Requests" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">Failed to load upload requests</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Upload Requests" }]} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-requests-title">Upload Requests</h1>
            <p className="text-sm text-muted-foreground">Generate and manage secure upload links</p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-request"><Plus className="w-4 h-4 mr-2" />New Request</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Upload Request</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="space-y-2">
                  <Label>Intake Space *</Label>
                  <Select value={form.spaceId} onValueChange={(v) => setForm({ ...form, spaceId: v })}>
                    <SelectTrigger data-testid="select-request-space"><SelectValue placeholder="Select a space" /></SelectTrigger>
                    <SelectContent>
                      {(spaces || []).filter((s: any) => s.status === "active").map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required data-testid="input-request-title" placeholder="e.g., Medical Records Upload" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Recipient Name</Label>
                    <Input value={form.uploaderName} onChange={(e) => setForm({ ...form, uploaderName: e.target.value })} data-testid="input-request-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Recipient Email</Label>
                    <Input type="email" value={form.uploaderEmail} onChange={(e) => setForm({ ...form, uploaderEmail: e.target.value })} data-testid="input-request-email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} data-testid="input-request-instructions" placeholder="Instructions for the uploader..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Max Uploads</Label>
                    <Input type="number" min={1} value={form.maxUploads} onChange={(e) => setForm({ ...form, maxUploads: e.target.value })} data-testid="input-request-max-uploads" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Total Size (MB)</Label>
                    <Input type="number" min={1} value={form.maxTotalSizeMb} onChange={(e) => setForm({ ...form, maxTotalSizeMb: e.target.value })} data-testid="input-request-max-size" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Expires At</Label>
                  <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} data-testid="input-request-expires" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>One-Time Use</Label>
                  <Switch checked={form.oneTimeUse} onCheckedChange={(v) => setForm({ ...form, oneTimeUse: v })} data-testid="switch-one-time-use" />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require Password</Label>
                  <Switch checked={form.requiresPassword} onCheckedChange={(v) => setForm({ ...form, requiresPassword: v })} data-testid="switch-require-password" />
                </div>
                {form.requiresPassword && (
                  <div className="space-y-2">
                    <Label>Upload Password</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} data-testid="input-request-password" />
                    <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || !form.spaceId || !form.title} data-testid="button-submit-request">
                    <Upload className="w-4 h-4 mr-2" />
                    Create Request
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {(!requests || requests.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Upload className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">No upload requests yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a request to generate a secure upload link</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>Create Request</Button>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploads</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req: any) => (
                <TableRow key={req.id} data-testid={`row-request-${req.id}`}>
                  <TableCell className="font-medium">{req.title}</TableCell>
                  <TableCell>
                    <div className="text-sm">{req.uploaderName || "-"}</div>
                    {req.uploaderEmail && <div className="text-xs text-muted-foreground">{req.uploaderEmail}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(req.status)}>{req.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {req.uploadCount}{req.maxUploads ? `/${req.maxUploads}` : ""}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {req.expiresAt ? new Date(req.expiresAt).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {req.status === "active" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => copyLink(req.token, req.id)} data-testid={`button-copy-link-${req.id}`} title="Copy upload link">
                            {copiedId === req.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => window.open(`/t/upload/${req.token}`, "_blank")} data-testid={`button-open-link-${req.id}`} title="Open upload page">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm("Revoke this request? The upload link will stop working.")) revokeMutation.mutate(req.id); }} data-testid={`button-revoke-${req.id}`} title="Revoke request">
                            <XCircle className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
