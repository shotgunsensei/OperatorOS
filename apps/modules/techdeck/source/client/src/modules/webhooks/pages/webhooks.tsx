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
import { Switch } from "@/components/ui/switch";
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
  FormDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Webhook,
  Plus,
  Trash2,
  Eye,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  enabled: boolean;
  eventTypes: string[];
  description: string | null;
  createdAt: string;
  signingSecret?: string;
}

interface WebhookDelivery {
  id: string;
  eventType: string;
  status: string;
  responseCode: number | null;
  durationMs: number | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
}

const webhookFormSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  description: z.string().optional(),
  eventTypes: z.string().optional(),
});

export default function WebhooksPage() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewDeliveriesId, setViewDeliveriesId] = useState<string | null>(null);

  const { data: webhooks, isLoading } = useQuery<WebhookEndpoint[]>({
    queryKey: ["/api/webhooks"],
  });

  const { data: availableEvents } = useQuery<string[]>({
    queryKey: ["/api/webhook-events"],
  });

  const { data: deliveries } = useQuery<WebhookDelivery[]>({
    queryKey: [`/api/webhooks/${viewDeliveriesId}/deliveries`],
    enabled: !!viewDeliveriesId,
  });

  const form = useForm<z.infer<typeof webhookFormSchema>>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: { url: "", description: "", eventTypes: "" },
  });

  const createWebhook = useMutation({
    mutationFn: async (data: z.infer<typeof webhookFormSchema>) => {
      const eventTypes = data.eventTypes
        ? data.eventTypes.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const res = await apiRequest("POST", "/api/webhooks", {
        url: data.url,
        eventTypes,
        description: data.description || undefined,
      });
      return res.json();
    },
    onSuccess: (data: WebhookEndpoint) => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setShowCreate(false);
      form.reset();
      setShowSecret(data.signingSecret || null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await apiRequest("PATCH", `/api/webhooks/${id}`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setDeleteId(null);
      toast({ title: "Webhook deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-webhooks-title">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send real-time event notifications to external services
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-webhook">
          <Plus className="w-4 h-4 mr-2" />
          New Webhook
        </Button>
      </div>

      {webhooks && webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No webhooks yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a webhook to start receiving event notifications
            </p>
            <Button onClick={() => setShowCreate(true)} data-testid="button-create-webhook-empty">
              <Plus className="w-4 h-4 mr-2" />
              Create Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks?.map((wh) => (
            <Card key={wh.id} data-testid={`webhook-card-${wh.id}`}>
              <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-mono truncate max-w-md" data-testid={`webhook-url-${wh.id}`}>
                      {wh.url}
                    </code>
                    <Badge variant={wh.enabled ? "default" : "secondary"}>
                      {wh.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  {wh.description && (
                    <p className="text-sm text-muted-foreground">{wh.description}</p>
                  )}
                  <div className="flex items-center gap-1 flex-wrap">
                    {wh.eventTypes && wh.eventTypes.length > 0 ? (
                      wh.eventTypes.map((et) => (
                        <Badge key={et} variant="outline" className="text-xs">{et}</Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-xs">All events</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={wh.enabled}
                    onCheckedChange={(checked) => toggleWebhook.mutate({ id: wh.id, enabled: checked })}
                    data-testid={`switch-webhook-${wh.id}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setViewDeliveriesId(wh.id)}
                    data-testid={`button-deliveries-${wh.id}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDeleteId(wh.id)}
                    data-testid={`button-delete-webhook-${wh.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Webhook</DialogTitle>
            <DialogDescription>
              Configure an endpoint to receive event notifications via HTTP POST
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createWebhook.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/webhook" {...field} data-testid="input-webhook-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Zapier integration" {...field} data-testid="input-webhook-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eventTypes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Types</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Leave empty for all events, or comma-separated: evidence.uploaded,license.activation"
                        {...field}
                        data-testid="input-webhook-events"
                      />
                    </FormControl>
                    <FormDescription>
                      {availableEvents && availableEvents.length > 0 && (
                        <span className="text-xs">
                          Available: {availableEvents.join(", ")}
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={createWebhook.isPending} data-testid="button-submit-webhook">
                {createWebhook.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Webhook
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showSecret} onOpenChange={() => setShowSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Signing Secret</DialogTitle>
            <DialogDescription>
              Save this secret now. It will not be shown again. Use it to verify webhook signatures.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted p-3 rounded-md font-mono text-sm break-all" data-testid="text-signing-secret">
                {showSecret}
              </code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (showSecret) navigator.clipboard.writeText(showSecret);
                  toast({ title: "Copied to clipboard" });
                }}
                data-testid="button-copy-secret"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="bg-muted/50 p-3 rounded-md space-y-1">
              <p className="text-sm font-medium">Signature verification</p>
              <p className="text-xs text-muted-foreground">
                Verify with: HMAC-SHA256(secret, timestamp + "." + body)
              </p>
              <p className="text-xs text-muted-foreground">
                Headers: X-SNV-Event, X-SNV-Timestamp, X-SNV-Signature
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDeliveriesId} onOpenChange={() => setViewDeliveriesId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delivery Log</DialogTitle>
            <DialogDescription>
              Recent delivery attempts for this webhook endpoint
            </DialogDescription>
          </DialogHeader>
          {deliveries && deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries?.map((d) => (
                    <TableRow key={d.id} data-testid={`delivery-row-${d.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(d.status)}
                          <span className="text-xs capitalize">{d.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{d.eventType}</code>
                      </TableCell>
                      <TableCell className="text-xs">{d.responseCode || "-"}</TableCell>
                      <TableCell className="text-xs">{d.durationMs ? `${d.durationMs}ms` : "-"}</TableCell>
                      <TableCell className="text-xs">{d.attempts}/{d.maxAttempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this webhook endpoint and all its delivery history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteWebhook.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
