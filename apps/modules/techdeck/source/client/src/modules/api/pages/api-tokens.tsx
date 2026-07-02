import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from "lucide-react";

const AVAILABLE_SCOPES = [
  { value: "evidence:read", label: "Evidence: Read", description: "Read evidence items via API" },
  { value: "license:validate", label: "License: Validate", description: "Validate license keys via API" },
  { value: "status:read", label: "Status: Read", description: "Read status pages via API" },
];

const createTokenSchema = z.object({
  name: z.string().min(1, "Token name is required").max(100),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
});

type CreateTokenForm = z.infer<typeof createTokenSchema>;

interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiTokensPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTokenPlaintext, setNewTokenPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data: tokens, isLoading } = useQuery<ApiTokenRow[]>({
    queryKey: ["/api/api-tokens"],
  });

  const form = useForm<CreateTokenForm>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: { name: "", scopes: [] },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateTokenForm) => {
      const res = await apiRequest("POST", "/api/api-tokens", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setNewTokenPlaintext(data.plaintext);
      setCreateOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/api-tokens"] });
      toast({ title: "Token created", description: "Copy the token now — it won't be shown again." });
    },
    onError: () => {
      toast({ title: "Failed to create token", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/api-tokens/${id}`);
    },
    onSuccess: () => {
      setRevokeId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/api-tokens"] });
      toast({ title: "Token revoked" });
    },
    onError: () => {
      toast({ title: "Failed to revoke token", variant: "destructive" });
    },
  });

  const handleCopy = async () => {
    if (!newTokenPlaintext) return;
    await navigator.clipboard.writeText(newTokenPlaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-api-tokens-title">API Tokens</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage API tokens for programmatic access to your vault.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-token">
          <Plus className="mr-2 h-4 w-4" />
          Create Token
        </Button>
      </div>

      {newTokenPlaintext && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <CardTitle className="text-base">New API Token Created</CardTitle>
              <CardDescription>Copy this token now. It will not be displayed again.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 p-3 bg-background border rounded-md text-sm font-mono break-all"
                data-testid="text-new-token-plaintext"
              >
                {newTokenPlaintext}
              </code>
              <Button size="icon" variant="outline" onClick={handleCopy} data-testid="button-copy-token">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setNewTokenPlaintext(null)}
              data-testid="button-dismiss-token"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Active Tokens
          </CardTitle>
          <CardDescription>
            Tokens authenticate requests to the /api/v1 endpoints. Use <code className="text-xs">Authorization: Bearer &lt;token&gt;</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !tokens || tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-tokens">
              No API tokens yet. Create one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                    <TableCell className="font-medium" data-testid={`text-token-name-${token.id}`}>{token.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {token.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.enabled ? (
                        <Badge variant="default" className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Revoked</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {token.createdAt ? new Date(token.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      {token.enabled && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setRevokeId(token.id)}
                          data-testid={`button-revoke-token-${token.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Documentation</CardTitle>
          <CardDescription>
            The OpenAPI specification is available at <code className="text-xs">/api/v1/openapi.json</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Available Endpoints:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><code className="text-xs">GET /api/v1/status/:slug</code> — Public status page data</li>
              <li><code className="text-xs">GET /api/v1/evidence</code> — List evidence (scope: evidence:read)</li>
              <li><code className="text-xs">POST /api/v1/license/validate</code> — Validate license key (scope: license:validate)</li>
              <li><code className="text-xs">GET /api/v1/openapi.json</code> — OpenAPI specification</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Token</DialogTitle>
            <DialogDescription>
              Choose a name and select the scopes this token should have access to.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. CI Pipeline" {...field} data-testid="input-token-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scopes"
                render={() => (
                  <FormItem>
                    <FormLabel>Scopes</FormLabel>
                    <div className="space-y-2">
                      {AVAILABLE_SCOPES.map((scope) => (
                        <FormField
                          key={scope.value}
                          control={form.control}
                          name="scopes"
                          render={({ field }) => (
                            <FormItem className="flex items-start gap-3">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(scope.value)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, scope.value]);
                                    } else {
                                      field.onChange(current.filter((v: string) => v !== scope.value));
                                    }
                                  }}
                                  data-testid={`checkbox-scope-${scope.value}`}
                                />
                              </FormControl>
                              <div className="leading-none">
                                <span className="text-sm font-medium">{scope.label}</span>
                                <p className="text-xs text-muted-foreground">{scope.description}</p>
                              </div>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create-token">
                  {createMutation.isPending ? "Creating..." : "Create Token"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeId} onOpenChange={(open) => !open && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Token?</AlertDialogTitle>
            <AlertDialogDescription>
              This token will be immediately disabled and all API requests using it will fail. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeMutation.mutate(revokeId)}
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
