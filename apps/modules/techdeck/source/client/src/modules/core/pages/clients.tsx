import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState, useRef } from "react";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Building2,
  ArrowRight,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import type { Client } from "@shared/schema";
import { EmptyState } from "@/components/empty-state";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{imported: number, errors: {row: number, message: string}[]} | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createClient = useMutation({
    mutationFn: async (data: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      notes?: string;
    }) => {
      const res = await apiRequest("POST", "/api/clients", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setOpen(false);
      toast({ title: "Client created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/clients/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDeleteTarget(null);
      toast({ title: "Client deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/clients/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setSelected(new Set());
      setBulkDeleteOpen(false);
      toast({ title: `${data.deleted} client${data.deleted !== 1 ? "s" : ""} deleted` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await apiRequest("POST", "/api/clients/import", { csv });
      return res.json();
    },
    onSuccess: (data: {imported: number, errors: {row: number, message: string}[]}) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setImportResult(data);
      if (data.imported > 0) {
        toast({ title: `Imported ${data.imported} client${data.imported !== 1 ? 's' : ''}` });
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
    a.href = "/api/clients/template.csv";
    a.download = "clients-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const filtered = clients?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase())
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
      setSelected(new Set(filtered.map((c) => c.id)));
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
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-clients-title">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your client organizations.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="button-bulk-delete-clients"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete {selected.size} selected
            </Button>
          )}
          <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null); }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-import-clients">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Clients from CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Download the template, fill it in with your data (e.g. from Datto, Kaseya, ConnectWise), then upload the completed CSV file.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={downloadTemplate} data-testid="button-download-template-clients">
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importMutation.isPending}
                    data-testid="button-upload-csv-clients"
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
                    data-testid="input-file-csv-clients"
                  />
                </div>
                {importResult && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium" data-testid="text-import-result-clients">
                      Successfully imported {importResult.imported} record{importResult.imported !== 1 ? "s" : ""}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="text-sm text-destructive space-y-1" data-testid="text-import-errors-clients">
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
              <Button data-testid="button-add-client">
                <Plus className="w-4 h-4 mr-1" />
                Add Client
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Client</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createClient.mutate({
                  name: fd.get("name") as string,
                  email: (fd.get("email") as string) || undefined,
                  phone: (fd.get("phone") as string) || undefined,
                  company: (fd.get("company") as string) || undefined,
                  notes: (fd.get("notes") as string) || undefined,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" name="name" required data-testid="input-client-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" data-testid="input-client-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" data-testid="input-client-phone" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" data-testid="input-client-company" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} data-testid="input-client-notes" />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createClient.isPending}
                data-testid="button-submit-client"
              >
                {createClient.isPending ? "Creating..." : "Create Client"}
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
          placeholder="Search clients..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-clients"
        />
      </div>

      {!filtered?.length ? (
        <EmptyState
          icon={Users}
          title={search ? "No clients match your search" : "No clients yet"}
          description={search ? "Try a different search term." : "Add your first client to start tracking sites, assets, and tickets."}
          action={!search ? { label: "Add Client", onClick: () => setOpen(true), testId: "button-empty-add-client" } : undefined}
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={filtered.length > 0 && selected.size === filtered.length}
              onCheckedChange={toggleSelectAll}
              data-testid="checkbox-select-all-clients"
            />
            <span className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </span>
          </div>
          <div className="grid gap-3">
            {filtered.map((client) => (
              <Card key={client.id} className="hover-elevate" data-testid={`card-client-${client.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Checkbox
                        checked={selected.has(client.id)}
                        onCheckedChange={() => toggleSelect(client.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-client-${client.id}`}
                      />
                      <Link href={`/clients/${client.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{client.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            {client.company && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {client.company}
                              </span>
                            )}
                            {client.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {client.email}
                              </span>
                            )}
                            {client.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {client.phone}
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
                          setDeleteTarget(client);
                        }}
                        data-testid={`button-delete-client-${client.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Link href={`/clients/${client.id}`}>
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
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will also remove associated client access assignments. Sites and assets linked to this client will be unlinked but not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-client">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-client"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Client{selected.size !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selected.size} selected client{selected.size !== 1 ? "s" : ""}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete-clients">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selected))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-clients"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
