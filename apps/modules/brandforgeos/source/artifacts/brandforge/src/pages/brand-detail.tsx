import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGetBrand, useUpdateBrand, getGetBrandQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function BrandDetail({ brandId }: { brandId: number }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: brand, isLoading } = useGetBrand(tenantId!, brandId, { query: { enabled: !!tenantId } });
  const updateBrand = useUpdateBrand();
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (brand) setForm({
      name: brand.name || "",
      primaryColor: brand.primaryColor || "#6366f1",
      secondaryColor: brand.secondaryColor || "#8b5cf6",
      accentColor: brand.accentColor || "#ec4899",
      fontHeading: brand.fontHeading || "",
      fontBody: brand.fontBody || "",
      voiceTone: brand.voiceTone || "",
      description: brand.description || "",
      guidelines: brand.guidelines || "",
    });
  }, [brand]);

  const handleSave = () => {
    if (!tenantId) return;
    updateBrand.mutate(
      { tenantId, brandId, data: form },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBrandQueryKey(tenantId, brandId) }) }
    );
  };

  if (isLoading) return <AppLayout><div className="p-8"><div className="h-8 bg-muted rounded w-48 animate-pulse" /></div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Link href="/brands"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{brand?.name || "Brand"}</h1>
            <p className="text-muted-foreground">Brand identity settings</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Brand Identity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Brand Name</Label><Input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} /></div>
              <div><Label>Description</Label><Textarea value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
              <div><Label>Voice & Tone</Label><Input value={form.voiceTone || ""} onChange={e => setForm({...form, voiceTone: e.target.value})} placeholder="Professional, friendly..." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Colors</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Primary Color</Label><div className="flex gap-2"><Input type="color" value={form.primaryColor || "#6366f1"} onChange={e => setForm({...form, primaryColor: e.target.value})} className="w-16 h-10" /><Input value={form.primaryColor || ""} onChange={e => setForm({...form, primaryColor: e.target.value})} /></div></div>
              <div><Label>Secondary Color</Label><div className="flex gap-2"><Input type="color" value={form.secondaryColor || "#8b5cf6"} onChange={e => setForm({...form, secondaryColor: e.target.value})} className="w-16 h-10" /><Input value={form.secondaryColor || ""} onChange={e => setForm({...form, secondaryColor: e.target.value})} /></div></div>
              <div><Label>Accent Color</Label><div className="flex gap-2"><Input type="color" value={form.accentColor || "#ec4899"} onChange={e => setForm({...form, accentColor: e.target.value})} className="w-16 h-10" /><Input value={form.accentColor || ""} onChange={e => setForm({...form, accentColor: e.target.value})} /></div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Typography</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Heading Font</Label><Input value={form.fontHeading || ""} onChange={e => setForm({...form, fontHeading: e.target.value})} placeholder="Inter, Poppins..." /></div>
              <div><Label>Body Font</Label><Input value={form.fontBody || ""} onChange={e => setForm({...form, fontBody: e.target.value})} placeholder="Inter, Source Sans..." /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Brand Guidelines</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.guidelines || ""} onChange={e => setForm({...form, guidelines: e.target.value})} rows={8} placeholder="Document your brand guidelines, do's and don'ts, approved messaging..." />
            </CardContent>
          </Card>
        </div>

        <Button onClick={handleSave} disabled={updateBrand.isPending}>Save Changes</Button>
      </div>
    </AppLayout>
  );
}
