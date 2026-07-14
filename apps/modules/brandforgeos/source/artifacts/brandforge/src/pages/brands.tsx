import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useListBrands, useCreateBrand, useDeleteBrand, getListBrandsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Palette, Trash2 } from "lucide-react";
import { Link } from "wouter";

export default function Brands() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: brands, isLoading } = useListBrands(tenantId!, { query: { enabled: !!tenantId } });
  const createBrand = useCreateBrand();
  const deleteBrand = useDeleteBrand();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", primaryColor: "#6366f1", secondaryColor: "#8b5cf6", voiceTone: "", description: "" });

  const handleCreate = () => {
    if (!tenantId || !form.name) return;
    createBrand.mutate(
      { tenantId, data: form },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey(tenantId) });
          setOpen(false);
          setForm({ name: "", primaryColor: "#6366f1", secondaryColor: "#8b5cf6", voiceTone: "", description: "" });
        },
      }
    );
  };

  const handleDelete = (brandId: number) => {
    if (!tenantId) return;
    deleteBrand.mutate(
      { tenantId, brandId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBrandsQueryKey(tenantId) }) }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Brand HQ</h1>
            <p className="text-muted-foreground">Manage your brand identities</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Brand</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Brand</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Brand Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My Brand" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Primary Color</Label><Input type="color" value={form.primaryColor} onChange={e => setForm({...form, primaryColor: e.target.value})} /></div>
                  <div><Label>Secondary Color</Label><Input type="color" value={form.secondaryColor} onChange={e => setForm({...form, secondaryColor: e.target.value})} /></div>
                </div>
                <div><Label>Voice & Tone</Label><Input value={form.voiceTone} onChange={e => setForm({...form, voiceTone: e.target.value})} placeholder="Professional, friendly, authoritative..." /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Brand description..." /></div>
                <Button onClick={handleCreate} disabled={!form.name} className="w-full">Create Brand</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : !brands || brands.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Palette className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No brands yet</h3>
              <p className="text-muted-foreground mb-4">Create your first brand to get started with your marketing.</p>
              <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create Brand</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((brand) => (
              <Card key={brand.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Link href={`/brands/${brand.id}`}>
                      <CardTitle className="text-base hover:text-primary cursor-pointer">{brand.name}</CardTitle>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDelete(brand.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    {brand.primaryColor && <div className="w-8 h-8 rounded-md border" style={{ backgroundColor: brand.primaryColor }} />}
                    {brand.secondaryColor && <div className="w-8 h-8 rounded-md border" style={{ backgroundColor: brand.secondaryColor }} />}
                    {brand.accentColor && <div className="w-8 h-8 rounded-md border" style={{ backgroundColor: brand.accentColor }} />}
                  </div>
                  {brand.voiceTone && <Badge variant="secondary" className="text-xs">{brand.voiceTone}</Badge>}
                  {brand.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{brand.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
