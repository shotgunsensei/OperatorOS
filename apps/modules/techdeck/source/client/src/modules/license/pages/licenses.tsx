import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Package,
  Key,
  Copy,
  Check,
  Ban,
  Monitor,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { LicenseProduct, LicenseKey } from "@shared/schema";

const productFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Lowercase alphanumeric with hyphens only"),
  description: z.string().max(500).optional(),
});

const keyFormSchema = z.object({
  label: z.string().max(200).optional(),
  maxActivations: z.coerce.number().int().min(1).max(10000).default(1),
  expiresAt: z.string().optional(),
});

type LicenseKeyWithCount = LicenseKey & { activationCount: number };

interface Activation {
  id: string;
  deviceFingerprint: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | null;
}

export default function LicensesPage() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<LicenseProduct | null>(null);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showIssueKey, setShowIssueKey] = useState(false);
  const [showPlainKey, setShowPlainKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [viewActivationsKeyId, setViewActivationsKeyId] = useState<string | null>(null);
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);

  const { data: products, isLoading: productsLoading } = useQuery<LicenseProduct[]>({
    queryKey: ["/api/license/products"],
  });

  const { data: keys, isLoading: keysLoading } = useQuery<LicenseKeyWithCount[]>({
    queryKey: [`/api/license/products/${selectedProduct?.id}/keys`],
    enabled: !!selectedProduct,
  });

  const { data: activations } = useQuery<Activation[]>({
    queryKey: [`/api/license/keys/${viewActivationsKeyId}/activations`],
    enabled: !!viewActivationsKeyId,
  });

  const productForm = useForm<z.infer<typeof productFormSchema>>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { name: "", slug: "", description: "" },
  });

  const keyForm = useForm<z.infer<typeof keyFormSchema>>({
    resolver: zodResolver(keyFormSchema),
    defaultValues: { label: "", maxActivations: 1, expiresAt: "" },
  });

  const createProduct = useMutation({
    mutationFn: async (data: z.infer<typeof productFormSchema>) => {
      const res = await apiRequest("POST", "/api/license/products", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/license/products"] });
      setShowCreateProduct(false);
      productForm.reset();
      toast({ title: "Product created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const issueKey = useMutation({
    mutationFn: async (data: z.infer<typeof keyFormSchema>) => {
      const body: any = { ...data };
      if (body.expiresAt) {
        body.expiresAt = new Date(body.expiresAt).toISOString();
      } else {
        delete body.expiresAt;
      }
      if (!body.label) delete body.label;
      const res = await apiRequest("POST", `/api/license/products/${selectedProduct!.id}/keys`, body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/license/products/${selectedProduct?.id}/keys`] });
      setShowIssueKey(false);
      keyForm.reset();
      setShowPlainKey(data.plainKey);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/license/keys/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/license/products/${selectedProduct?.id}/keys`] });
      setRevokeKeyId(null);
      toast({ title: "Key revoked" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/license/products/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/license/products"] });
      if (selectedProduct) {
        setSelectedProduct({ ...selectedProduct, isActive: !selectedProduct.isActive });
      }
    },
  });

  const handleCopyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  if (productsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-licenses-title">
            License Server
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage products and license keys.
          </p>
        </div>
        <Button onClick={() => setShowCreateProduct(true)} data-testid="button-create-product">
          <Plus className="w-4 h-4 mr-2" />
          New Product
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">Products</h2>
          {products?.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No products yet. Create one to get started.
              </CardContent>
            </Card>
          )}
          {products?.map((product) => (
            <Card
              key={product.id}
              className={`cursor-pointer transition-colors ${selectedProduct?.id === product.id ? "border-primary" : ""}`}
              onClick={() => setSelectedProduct(product)}
              data-testid={`product-card-${product.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium truncate" data-testid={`product-name-${product.id}`}>
                        {product.name}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{product.slug}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant={product.isActive ? "default" : "secondary"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-2">
          {!selectedProduct ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Select a product to view its license keys.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-lg" data-testid="text-selected-product-name">
                        {selectedProduct.name}
                      </CardTitle>
                      {selectedProduct.description && (
                        <CardDescription>{selectedProduct.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive.mutate({ id: selectedProduct.id, isActive: !selectedProduct.isActive })}
                        data-testid="button-toggle-active"
                      >
                        {selectedProduct.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowIssueKey(true)}
                        data-testid="button-issue-key"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        Issue Key
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">License Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  {keysLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8" />
                      <Skeleton className="h-8" />
                    </div>
                  ) : keys?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No keys issued yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Label</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Activations</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keys?.map((k) => (
                            <TableRow key={k.id} data-testid={`key-row-${k.id}`}>
                              <TableCell className="font-medium text-sm">
                                {k.label || <span className="text-muted-foreground">--</span>}
                              </TableCell>
                              <TableCell>
                                {k.isRevoked ? (
                                  <Badge variant="destructive">Revoked</Badge>
                                ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                                  <Badge variant="secondary">Expired</Badge>
                                ) : (
                                  <Badge variant="default">Active</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {k.activationCount} / {k.maxActivations}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {k.expiresAt
                                  ? new Date(k.expiresAt).toLocaleDateString()
                                  : "Never"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {k.createdAt
                                  ? new Date(k.createdAt).toLocaleDateString()
                                  : "--"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setViewActivationsKeyId(k.id)}
                                    data-testid={`button-view-activations-${k.id}`}
                                  >
                                    <Monitor className="w-4 h-4" />
                                  </Button>
                                  {!k.isRevoked && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setRevokeKeyId(k.id)}
                                      data-testid={`button-revoke-${k.id}`}
                                    >
                                      <Ban className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showCreateProduct} onOpenChange={setShowCreateProduct}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Product</DialogTitle>
            <DialogDescription>
              Add a new product to issue license keys for.
            </DialogDescription>
          </DialogHeader>
          <Form {...productForm}>
            <form
              onSubmit={productForm.handleSubmit((data) => createProduct.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={productForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="My App Pro"
                        data-testid="input-product-name"
                        onChange={(e) => {
                          field.onChange(e);
                          const slug = e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, "");
                          productForm.setValue("slug", slug);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={productForm.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="my-app-pro" data-testid="input-product-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={productForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Optional description" data-testid="input-product-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createProduct.isPending} data-testid="button-submit-product">
                  {createProduct.isPending ? "Creating..." : "Create Product"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssueKey} onOpenChange={setShowIssueKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue License Key</DialogTitle>
            <DialogDescription>
              Generate a new license key for {selectedProduct?.name}. The key will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <Form {...keyForm}>
            <form
              onSubmit={keyForm.handleSubmit((data) => issueKey.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={keyForm.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Customer name or note" data-testid="input-key-label" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={keyForm.control}
                name="maxActivations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Activations</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={10000} data-testid="input-max-activations" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={keyForm.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" data-testid="input-expires-at" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={issueKey.isPending} data-testid="button-submit-key">
                  {issueKey.isPending ? "Issuing..." : "Issue Key"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showPlainKey} onOpenChange={() => setShowPlainKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>License Key Created</DialogTitle>
            <DialogDescription>
              Copy this key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-muted p-3 font-mono text-sm break-all" data-testid="text-plain-key">
              {showPlainKey}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleCopyKey(showPlainKey!)}
              data-testid="button-copy-key"
            >
              {copiedKey ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="w-3 h-3" />
            This key is stored hashed and cannot be recovered.
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewActivationsKeyId} onOpenChange={() => setViewActivationsKeyId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activations</DialogTitle>
            <DialogDescription>
              Devices that have activated this license key.
            </DialogDescription>
          </DialogHeader>
          {!activations || activations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activations yet.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device Fingerprint</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activations.map((a) => (
                    <TableRow key={a.id} data-testid={`activation-row-${a.id}`}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {a.deviceFingerprint}
                      </TableCell>
                      <TableCell className="text-sm">{a.ip || "--"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.createdAt ? new Date(a.createdAt).toLocaleString() : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeKeyId} onOpenChange={() => setRevokeKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke License Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The key will be permanently invalidated and all future validation attempts will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeKeyId && revokeKey.mutate(revokeKeyId)}
              data-testid="button-confirm-revoke"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
