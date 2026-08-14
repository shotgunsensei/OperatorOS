import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState, useRef } from "react";
import {
  Server,
  Plus,
  Search,
  ArrowRight,
  Monitor,
  Wifi,
  Hash,
  Upload,
  Download,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Asset, Client, Site } from "@shared/schema";

export default function AssetsPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{imported: number, errors: {row: number, message: string}[]} | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });
  const { data: clients } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: sites } = useQuery<Site[]>({ queryKey: ["/api/sites"] });

  const createAsset = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/assets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setOpen(false);
      toast({ title: "Asset created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/assets/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDeleteTarget(null);
      toast({ title: "Asset deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/assets/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setSelected(new Set());
      setBulkDeleteOpen(false);
      toast({ title: `${data.deleted} asset${data.deleted !== 1 ? "s" : ""} deleted` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await apiRequest("POST", "/api/assets/import", { csv });
      return res.json();
    },
    onSuccess: (data: {imported: number, errors: {row: number, message: string}[]}) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setImportResult(data);
      if (data.imported > 0) {
        toast({ title: `Imported ${data.imported} asset${data.imported !== 1 ? 's' : ''}` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const csv = event.target?.result as string;
      setImportResult(null);
      importMutation.mutate(csv);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const a = document.createElement("a");
    a.href = "/api/assets/template.csv";
    a.download = "assets-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filtered = assets?.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.type?.toLowerCase().includes(search.toLowerCase()) ||
      a.serialNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!filtered) return;
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a) => a.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-assets-title">
            Assets
          </h1>
          <p className="text-sm text-muted-foreground">
            Track devices, servers, and equipment.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="button-bulk-delete-assets"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selected.size} selected
            </Button>
          )}
          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-import-assets">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Assets from CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download the template, fill it in with your data (e.g. from Datto, Kaseya, ConnectWise), then upload the completed CSV file.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template-assets">
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importMutation.isPending}
                    data-testid="button-upload-csv-assets"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {importMutation.isPending ? "Importing..." : "Upload CSV"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                    data-testid="input-file-csv-assets"
                  />
                </div>
                {importResult && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium" data-testid="text-import-result-assets">
                      Successfully imported {importResult.imported} record{importResult.imported !== 1 ? "s" : ""}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="text-sm text-destructive space-y-1" data-testid="text-import-errors-assets">
                        <p className="font-medium">{importResult.errors.length} error{importResult.errors.length !== 1 ? "s" : ""}:</p>
                        {importResult.errors.slice(0, 10).map((err, i) => (
                          <p key={i}>Row {err.row}: {err.message}</p>
                        ))}
                        {importResult.errors.length > 10 && (
                          <p>...and {importResult.errors.length - 10} more</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-asset">
                <Plus className="w-4 h-4 mr-1" />
                Add Asset
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Asset</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createAsset.mutate({
                  name: fd.get("name") as string,
                  type: (fd.get("type") as string) || undefined,
                  serialNumber: (fd.get("serialNumber") as string) || undefined,
                  ipAddress: (fd.get("ipAddress") as string) || undefined,
                  clientId: (fd.get("clientId") as string) || undefined,
                  siteId: (fd.get("siteId") as string) || undefined,
                  notes: (fd.get("notes") as string) || undefined,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" name="name" required data-testid="input-asset-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Input
                    id="type"
                    name="type"
                    placeholder="Server, Workstation..."
                    data-testid="input-asset-type"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input id="serialNumber" name="serialNumber" data-testid="input-asset-serial" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipAddress">IP Address</Label>
                <Input id="ipAddress" name="ipAddress" data-testid="input-asset-ip" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select name="clientId">
                    <SelectTrigger data-testid="select-asset-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select name="siteId">
                    <SelectTrigger data-testid="select-asset-site">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} data-testid="input-asset-notes" />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createAsset.isPending}
                data-testid="button-submit-asset"
              >
                {createAsset.isPending ? "Creating..." : "Create Asset"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search assets..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-assets"
        />
      </div>

      {!filtered?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Server className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? "No assets match your search" : "No assets yet"}
          </p>
          {!search && (
            <p className="text-xs mt-1">Add your first asset to start tracking.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={filtered.length > 0 && selected.size === filtered.length}
              onCheckedChange={toggleSelectAll}
              data-testid="checkbox-select-all-assets"
            />
            <span className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </span>
          </div>
          <div className="grid gap-3">
            {filtered.map((asset) => (
              <Card key={asset.id} className="hover-elevate" data-testid={`card-asset-${asset.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={selected.has(asset.id)}
                        onCheckedChange={() => toggleSelect(asset.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-asset-${asset.id}`}
                      />
                      <Link href={`/assets/${asset.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Server className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{asset.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            {asset.type && (
                              <span className="flex items-center gap-1">
                                <Monitor className="w-3 h-3" />
                                {asset.type}
                              </span>
                            )}
                            {asset.ipAddress && (
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                {asset.ipAddress}
                              </span>
                            )}
                            {asset.serialNumber && (
                              <span className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                {asset.serialNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget(asset);
                        }}
                        data-testid={`button-delete-asset-${asset.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Link href={`/assets/${asset.id}`}>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-asset">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-asset"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Asset{selected.size !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selected.size} selected asset{selected.size !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete-assets">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-assets"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
