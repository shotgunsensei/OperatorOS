import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useListBrandProfiles, useCreateBrandProfile, useUpdateBrandProfile, useDeleteBrandProfile, getListBrandProfilesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Palette, Trash2, Edit, Plus, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { handlePlanLimitError } from "@/lib/plan-error";

const brandSchema = z.object({
  name: z.string().min(2, "Name is required"),
  primaryColor: z.string().min(3, "Primary color is required"),
  accentColor: z.string().min(3, "Accent color is required"),
  logoText: z.string().min(2, "Logo text is required"),
  voice: z.string().min(5, "Brand voice is required"),
  tagline: z.string().min(5, "Tagline is required"),
});

type BrandValues = z.infer<typeof brandSchema>;

export default function Brands() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: brands, isLoading } = useListBrandProfiles();
  const createBrand = useCreateBrandProfile();
  const updateBrand = useUpdateBrandProfile();
  const deleteBrand = useDeleteBrandProfile();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<number | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<number | null>(null);

  const form = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: "",
      primaryColor: "#E53E3E",
      accentColor: "#1F2937",
      logoText: "",
      voice: "Professional and authoritative",
      tagline: "",
    },
  });

  const handleOpenCreate = () => {
    form.reset({
      name: "",
      primaryColor: "#E53E3E",
      accentColor: "#1F2937",
      logoText: "",
      voice: "Professional and authoritative",
      tagline: "",
    });
    setEditingBrandId(null);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (brand: any) => {
    form.reset({
      name: brand.name,
      primaryColor: brand.primaryColor,
      accentColor: brand.accentColor,
      logoText: brand.logoText,
      voice: brand.voice,
      tagline: brand.tagline,
    });
    setEditingBrandId(brand.id);
    setIsDialogOpen(true);
  };

  const onSubmit = (values: BrandValues) => {
    if (editingBrandId) {
      updateBrand.mutate(
        { id: editingBrandId, data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBrandProfilesQueryKey() });
            toast.success("Brand profile updated");
            setIsDialogOpen(false);
          },
          onError: (err) => toast.error("Failed to update brand", { description: err.message })
        }
      );
    } else {
      createBrand.mutate(
        { data: values },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBrandProfilesQueryKey() });
            toast.success("Brand profile created");
            setIsDialogOpen(false);
          },
          onError: (err) => {
            if (handlePlanLimitError(err, () => setLocation("/pricing"))) return;
            toast.error("Failed to create brand", { description: err.message });
          }
        }
      );
    }
  };

  const handleDelete = () => {
    if (!brandToDelete) return;
    const id = brandToDelete;
    deleteBrand.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBrandProfilesQueryKey() });
          toast.success("Brand profile moved to trash", {
            description: "You can restore it within 30 days.",
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const res = await fetch(`${import.meta.env.BASE_URL}api/brands/${id}/restore`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("Restore failed");
                  queryClient.invalidateQueries({ queryKey: getListBrandProfilesQueryKey() });
                  toast.success("Brand profile restored");
                } catch (e) {
                  toast.error("Could not restore brand", { description: e instanceof Error ? e.message : String(e) });
                }
              },
            },
          });
          setBrandToDelete(null);
        },
        onError: (err) => {
          toast.error("Failed to delete brand", { description: err.message });
          setBrandToDelete(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand Profiles</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Manage brand identities for quick deployment</p>
        </div>
        <Button onClick={handleOpenCreate} className="font-bold tracking-widest bg-primary text-primary-foreground">
          <Plus className="mr-2 h-4 w-4" /> NEW PROFILE
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center font-mono text-muted-foreground animate-pulse">LOADING_DATA...</div>
      ) : brands?.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-border rounded-lg bg-card/20">
          <Palette className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-bold">No Brand Profiles</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">Create brand profiles to quickly apply styling and voice parameters when generating launch kits.</p>
          <Button className="mt-6 font-mono text-xs" onClick={handleOpenCreate}>CREATE_FIRST_PROFILE</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brands?.map((brand) => (
            <Card key={brand.id} className="flex flex-col border-border/50 bg-card/50 overflow-hidden relative">
              <div 
                className="h-2 w-full absolute top-0 left-0" 
                style={{ background: `linear-gradient(to right, ${brand.primaryColor}, ${brand.accentColor})` }} 
              />
              <CardHeader className="pt-6">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase border-primary/30 text-primary">PROFILE_{brand.id}</Badge>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: brand.primaryColor }} title="Primary Color" />
                    <div className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: brand.accentColor }} title="Accent Color" />
                  </div>
                </div>
                <CardTitle className="text-xl mt-2 line-clamp-1">{brand.name}</CardTitle>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  CREATED: {format(new Date(brand.createdAt), 'MMM dd, yyyy')}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">LOGO_TEXT</p>
                  <p className="text-sm font-medium">{brand.logoText}</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">TAGLINE</p>
                  <p className="text-sm italic text-foreground/80 line-clamp-2">"{brand.tagline}"</p>
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground mb-1">BRAND_VOICE</p>
                  <p className="text-sm text-foreground/80 line-clamp-2">{brand.voice}</p>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t border-border/30 bg-muted/20 flex justify-end gap-2">
                <Button variant="ghost" size="sm" className="h-8 font-mono text-xs" onClick={() => handleOpenEdit(brand)}>
                  <Edit className="mr-2 h-3 w-3" /> EDIT
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setBrandToDelete(brand.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px] border-border/50 bg-card">
          <DialogHeader>
            <DialogTitle className="font-mono text-primary flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {editingBrandId ? 'EDIT_BRAND_PROFILE' : 'NEW_BRAND_PROFILE'}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">PROFILE_NAME *</FormLabel>
                    <FormControl><Input placeholder="e.g. Main Brand" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="logoText" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">LOGO_TEXT *</FormLabel>
                    <FormControl><Input placeholder="e.g. ACME Corp" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="primaryColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">PRIMARY_COLOR_HEX *</FormLabel>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 h-10 p-1 bg-transparent" {...field} />
                      <FormControl><Input className="flex-1 font-mono uppercase" {...field} /></FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="accentColor" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono">ACCENT_COLOR_HEX *</FormLabel>
                    <div className="flex gap-2">
                      <Input type="color" className="w-12 h-10 p-1 bg-transparent" {...field} />
                      <FormControl><Input className="flex-1 font-mono uppercase" {...field} /></FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="tagline" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono">TAGLINE *</FormLabel>
                  <FormControl><Input placeholder="e.g. We build the future" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="voice" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono">BRAND_VOICE_DESCRIPTION *</FormLabel>
                  <FormControl><Textarea placeholder="e.g. Professional, authoritative, but approachable..." className="h-20" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="font-mono text-xs">CANCEL</Button>
                <Button type="submit" className="font-mono text-xs" disabled={createBrand.isPending || updateBrand.isPending}>
                  {createBrand.isPending || updateBrand.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  SAVE_PROFILE
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={brandToDelete !== null} onOpenChange={(open) => !open && setBrandToDelete(null)}>
        <AlertDialogContent className="border-destructive/50 border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this brand profile? Kits generated with this profile will retain their styling, but you won't be able to use it for new kits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">CANCEL</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs">
              {deleteBrand.isPending ? "DELETING..." : "CONFIRM_DELETE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}