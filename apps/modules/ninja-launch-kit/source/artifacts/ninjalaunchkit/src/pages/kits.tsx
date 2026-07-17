import { useState } from "react";
import { Link } from "wouter";
import { useListKits, useDeleteKit, useDuplicateKit, useRegenerateKit, getListKitsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Search, FolderKanban, Copy, Trash2, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Kits() {
  const [search, setSearch] = useState("");
  const [businessType, setBusinessType] = useState<string>("");
  const [kitToDelete, setKitToDelete] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: kits, isLoading } = useListKits({ 
    search: search || undefined, 
    businessType: businessType === "all" ? undefined : businessType || undefined 
  });

  const deleteKit = useDeleteKit();
  const duplicateKit = useDuplicateKit();
  const regenerateKit = useRegenerateKit();

  const handleDelete = () => {
    if (!kitToDelete) return;
    const id = kitToDelete;
    deleteKit.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKitsQueryKey() });
          toast.success("Kit moved to trash", {
            description: "You can restore it within 30 days.",
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const res = await fetch(`${import.meta.env.BASE_URL}api/kits/${id}/restore`, {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) throw new Error("Restore failed");
                  queryClient.invalidateQueries({ queryKey: getListKitsQueryKey() });
                  toast.success("Kit restored");
                } catch (e) {
                  toast.error("Could not restore kit", { description: e instanceof Error ? e.message : String(e) });
                }
              },
            },
          });
          setKitToDelete(null);
        },
        onError: (err) => {
          toast.error("Failed to delete kit", { description: err.message });
          setKitToDelete(null);
        }
      }
    );
  };

  const handleDuplicate = (id: number) => {
    duplicateKit.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKitsQueryKey() });
          toast.success("Kit duplicated successfully");
        },
        onError: (err) => toast.error("Failed to duplicate", { description: err.message })
      }
    );
  };

  const handleRegenerate = (id: number) => {
    regenerateKit.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKitsQueryKey() });
          toast.success("Kit regenerated successfully");
        },
        onError: (err) => toast.error("Failed to regenerate", { description: err.message })
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Kits</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Access generated marketing payloads</p>
        </div>
        <Link href="/builder">
          <Button className="font-bold tracking-widest bg-primary text-primary-foreground">
            CREATE NEW KIT
          </Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-card/50 p-4 rounded-lg border border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search kits..." 
            className="pl-9 font-mono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={businessType || "all"} onValueChange={setBusinessType}>
          <SelectTrigger className="w-full md:w-[200px] font-mono">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL_TYPES</SelectItem>
            <SelectItem value="Local Service">Local Service</SelectItem>
            <SelectItem value="Online Product">Online Product</SelectItem>
            <SelectItem value="Consultant">Consultant</SelectItem>
            <SelectItem value="E-commerce">E-commerce</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-12 text-center font-mono text-muted-foreground animate-pulse">LOADING_DATA...</div>
      ) : kits?.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-border rounded-lg bg-card/20">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-bold">No Kits Found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">You haven't generated any launch kits yet, or none match your filters.</p>
          <Link href="/builder">
            <Button className="mt-6 font-mono text-xs">INITIALIZE_FIRST_KIT</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kits?.map((kit) => (
            <Card key={kit.id} className="flex flex-col border-border/50 bg-card/50 hover:border-primary/50 transition-colors group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">{kit.input.businessType}</Badge>
                  {kit.watermarked && <Badge variant="secondary" className="text-[10px] bg-primary/20 text-primary border-0">DEMO</Badge>}
                </div>
                <CardTitle className="text-xl mt-2 line-clamp-1">{kit.title}</CardTitle>
                <div className="text-xs text-muted-foreground font-mono mt-1">
                  CREATED: {format(new Date(kit.createdAt), 'MMM dd, yyyy')}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-foreground/80 line-clamp-2">{kit.input.offer}</p>
                <div className="mt-4 flex gap-2">
                  <Badge variant="secondary" className="text-[10px] font-mono capitalize">{kit.input.tone} tone</Badge>
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t border-border/30 bg-muted/20 flex justify-between gap-2">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleDuplicate(kit.id)} title="Duplicate">
                    {duplicateKit.isPending && duplicateKit.variables?.id === kit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleRegenerate(kit.id)} title="Regenerate">
                    {regenerateKit.isPending && regenerateKit.variables?.id === kit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setKitToDelete(kit.id)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Link href={`/kits/${kit.id}`}>
                  <Button size="sm" className="h-8 gap-1 font-mono text-xs">
                    OPEN <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={kitToDelete !== null} onOpenChange={(open) => !open && setKitToDelete(null)}>
        <AlertDialogContent className="border-destructive/50 border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this launch kit? This payload cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs">CANCEL</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono text-xs">
              {deleteKit.isPending ? "DELETING..." : "CONFIRM_DELETE"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}