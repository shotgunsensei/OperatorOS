import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PulseLoader } from "@/components/pulse-line";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { PlusCircle, Users2, Trash2, Phone, Mail, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { canAssignTickets, canManageSettings } from "@/lib/permissions";
import type { Vendor } from "@shared/schema";

export default function VendorsPage() {
  const { toast } = useToast();
  const { membership } = useAuth();
  const role = membership?.role;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", serviceType: "", phone: "", email: "", emergencyContact: "", contractNotes: "" });

  const { data: vendors, isLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      setOpen(false);
      setForm({ name: "", serviceType: "", phone: "", email: "", emergencyContact: "", contractNotes: "" });
      toast({ title: "Vendor added" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vendors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding"] });
      toast({ title: "Vendor removed" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Vendor Directory"
        description="External service providers and emergency contacts"
        action={
          canAssignTickets(role) ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-vendor"><PlusCircle className="h-4 w-4 mr-2" /> Add Vendor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-4">
                <div><Label htmlFor="vendor-name">Company Name *</Label><Input id="vendor-name" data-testid="input-vendor-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vendor name" className="mt-1" /></div>
                <div><Label htmlFor="vendor-service">Service Type</Label><Input id="vendor-service" value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} placeholder="e.g., HVAC Maintenance" className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="vendor-phone">Phone</Label><Input id="vendor-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1" /></div>
                  <div><Label htmlFor="vendor-email">Email</Label><Input id="vendor-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="support@vendor.com" className="mt-1" /></div>
                </div>
                <div><Label htmlFor="vendor-emergency">Emergency Contact</Label><Input id="vendor-emergency" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} placeholder="After-hours number" className="mt-1" /></div>
                <div><Label htmlFor="vendor-notes">Contract Notes</Label><Textarea id="vendor-notes" value={form.contractNotes} onChange={(e) => setForm({ ...form, contractNotes: e.target.value })} placeholder="Contract terms, SLA details..." rows={2} className="mt-1" /></div>
                <Button
                  data-testid="button-save-vendor"
                  onClick={() => form.name.trim() && createMutation.mutate(form)}
                  disabled={!form.name.trim() || createMutation.isPending}
                  className="w-full"
                >{createMutation.isPending ? "Adding..." : "Add Vendor"}</Button>
              </div>
            </DialogContent>
          </Dialog>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><PulseLoader /></div>
        ) : !vendors || vendors.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Users2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-base font-medium mb-1">No vendors yet</p>
              <p className="text-sm text-muted-foreground max-w-md mb-4">Track service contractors, biomed providers, after-hours contacts, and contract notes so vendor waits have clear ownership.</p>
              {canManageSettings(role) && (
                <Button size="sm" onClick={() => setOpen(true)} data-testid="button-empty-add-vendor">Add your first vendor</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vendors.map((vendor) => (
              <div key={vendor.id} className="rounded-lg border bg-card p-4" data-testid={`vendor-${vendor.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{vendor.name}</p>
                    {vendor.serviceType && <p className="text-xs text-muted-foreground mt-0.5">{vendor.serviceType}</p>}
                  </div>
                  {canManageSettings(role) && (
                    <Button variant="ghost" size="sm" aria-label={`Remove ${vendor.name}`} onClick={() => { if (confirm("Remove this vendor?")) deleteMutation.mutate(vendor.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <div className="mt-3 space-y-1">
                  {vendor.phone && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{vendor.phone}</div>}
                  {vendor.email && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{vendor.email}</div>}
                  {vendor.emergencyContact && <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle className="h-3 w-3" />Emergency: {vendor.emergencyContact}</div>}
                </div>
                {vendor.contractNotes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{vendor.contractNotes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
