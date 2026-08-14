import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Save, AlertCircle } from "lucide-react";

export default function IntakePoliciesPage() {
  const { toast } = useToast();
  const { data: policy, isLoading, error } = useQuery<any>({ queryKey: ["/api/secure-intake/policies"] });
  const [form, setForm] = useState({
    defaultMaxFileSizeMb: 25,
    defaultAllowedFileTypes: "",
    defaultRetentionDays: "",
    defaultExpirationHours: 72,
    requirePasswordForLinks: false,
    autoDeleteExpiredFiles: false,
    complianceNotice: "",
  });

  useEffect(() => {
    if (policy && Object.keys(policy).length > 0) {
      setForm({
        defaultMaxFileSizeMb: policy.defaultMaxFileSizeMb || 25,
        defaultAllowedFileTypes: (policy.defaultAllowedFileTypes || []).join(", "),
        defaultRetentionDays: policy.defaultRetentionDays?.toString() || "",
        defaultExpirationHours: policy.defaultExpirationHours || 72,
        requirePasswordForLinks: policy.requirePasswordForLinks || false,
        autoDeleteExpiredFiles: policy.autoDeleteExpiredFiles || false,
        complianceNotice: policy.complianceNotice || "",
      });
    }
  }, [policy]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/secure-intake/policies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/policies"] });
      toast({ title: "Policies saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      defaultMaxFileSizeMb: form.defaultMaxFileSizeMb,
      defaultAllowedFileTypes: form.defaultAllowedFileTypes ? form.defaultAllowedFileTypes.split(",").map((t) => t.trim()).filter(Boolean) : null,
      defaultRetentionDays: form.defaultRetentionDays ? parseInt(form.defaultRetentionDays) : null,
      defaultExpirationHours: form.defaultExpirationHours,
      requirePasswordForLinks: form.requirePasswordForLinks,
      autoDeleteExpiredFiles: form.autoDeleteExpiredFiles,
      complianceNotice: form.complianceNotice || null,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Policies" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">Failed to load policies</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Policies" }]} />
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-policies-title">Intake Policies</h1>
        <p className="text-sm text-muted-foreground">Configure default security and compliance settings</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">File Defaults</CardTitle>
            <CardDescription>Default settings applied to new intake spaces and upload requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Default Max File Size (MB)</Label>
              <Input type="number" min={1} max={5120} value={form.defaultMaxFileSizeMb} onChange={(e) => setForm({ ...form, defaultMaxFileSizeMb: parseInt(e.target.value) || 25 })} data-testid="input-policy-max-size" />
            </div>
            <div className="space-y-2">
              <Label>Default Allowed File Types</Label>
              <Input value={form.defaultAllowedFileTypes} onChange={(e) => setForm({ ...form, defaultAllowedFileTypes: e.target.value })} placeholder="pdf, docx, jpg (leave empty for all)" data-testid="input-policy-file-types" />
            </div>
            <div className="space-y-2">
              <Label>Default Retention (days)</Label>
              <Input type="number" min={1} max={3650} value={form.defaultRetentionDays} onChange={(e) => setForm({ ...form, defaultRetentionDays: e.target.value })} placeholder="No automatic deletion" data-testid="input-policy-retention" />
            </div>
            <div className="space-y-2">
              <Label>Default Link Expiration (hours)</Label>
              <Input type="number" min={1} max={8760} value={form.defaultExpirationHours} onChange={(e) => setForm({ ...form, defaultExpirationHours: parseInt(e.target.value) || 72 })} data-testid="input-policy-expiration" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Require Password for Upload Links</Label>
                <p className="text-xs text-muted-foreground">When enabled, all new upload links require a password</p>
              </div>
              <Switch checked={form.requirePasswordForLinks} onCheckedChange={(v) => setForm({ ...form, requirePasswordForLinks: v })} data-testid="switch-require-password-policy" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-Delete Expired Files</Label>
                <p className="text-xs text-muted-foreground">Automatically remove files past their retention period</p>
              </div>
              <Switch checked={form.autoDeleteExpiredFiles} onCheckedChange={(v) => setForm({ ...form, autoDeleteExpiredFiles: v })} data-testid="switch-auto-delete" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" />
              <CardTitle className="text-base">Compliance Notice</CardTitle>
            </div>
            <CardDescription>Optional notice shown on upload pages</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={form.complianceNotice} onChange={(e) => setForm({ ...form, complianceNotice: e.target.value })} rows={4} placeholder="e.g., By uploading files, you acknowledge that this system includes security-focused features intended to support regulated document intake workflows..." data-testid="input-compliance-notice" />
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-policies">
          <Save className="w-4 h-4 mr-2" />
          Save Policies
        </Button>
      </form>
    </div>
  );
}
