import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  FileText,
  Trash2,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EmptyState } from "@/components/empty-state";
import { z } from "zod";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  viewed: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  partial: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
  cancelled: "bg-gray-500/10 text-gray-500 dark:text-gray-500",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  partial: "Partial",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const createInvoiceSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  notes: z.string().optional(),
});

type CreateInvoiceForm = z.infer<typeof createInvoiceSchema>;

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const queryParams = new URLSearchParams();
  if (statusFilter && statusFilter !== "all")
    queryParams.set("status", statusFilter);
  if (clientFilter && clientFilter !== "all")
    queryParams.set("clientId", clientFilter);
  const queryString = queryParams.toString();

  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: ["/api/invoices", queryString],
    queryFn: async () => {
      const res = await fetch(
        `/api/invoices${queryString ? `?${queryString}` : ""}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
  });

  const { data: clients } = useQuery<any[]>({ queryKey: ["/api/clients"] });

  const createMutation = useMutation({
    mutationFn: async (data: CreateInvoiceForm) => {
      const body: any = {
        clientId: data.clientId,
        notes: data.notes || null,
      };
      return apiRequest("POST", "/api/invoices", body);
    },
    onSuccess: async (res) => {
      const invoice = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: `Invoice ${invoice.invoiceNumber} created` });
      setShowCreateDialog(false);
      form.reset();
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create invoice",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted" });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      clientId: "",
      notes: "",
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-invoices-title"
          >
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and manage client invoices.
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-create-invoice"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Invoice
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-[140px]"
            data-testid="select-invoice-status-filter"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="viewed">Viewed</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="select-invoice-client-filter"
          >
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients?.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {!invoices?.length ? (
            <EmptyState
              icon={FileText}
              title="No invoices found"
              description="Create your first invoice to get started."
              action={{ label: "New Invoice", onClick: () => setShowCreateDialog(true), testId: "button-create-invoice-empty" }}
            />
          ) : (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground font-medium">
                <span className="w-24">Invoice #</span>
                <span className="flex-1">Client</span>
                <span className="w-24">Status</span>
                <span className="w-24 text-right">Total</span>
                <span className="w-28">Issued</span>
                <span className="w-28">Due</span>
                <span className="w-16">Actions</span>
              </div>
              {invoices.map((invoice: any) => (
                <div
                  key={invoice.id}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover-elevate cursor-pointer"
                  data-testid={`invoice-row-${invoice.id}`}
                >
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <span className="w-24 text-xs font-mono text-muted-foreground">
                      {invoice.invoiceNumber}
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">
                      {invoice.clientName || "No Client"}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`w-24 justify-center text-xs ${statusColors[invoice.status] || ""}`}
                      data-testid={`badge-invoice-status-${invoice.id}`}
                    >
                      {statusLabels[invoice.status] || invoice.status}
                    </Badge>
                    <span
                      className="w-24 text-sm font-medium text-right"
                      data-testid={`text-invoice-total-${invoice.id}`}
                    >
                      {formatCurrency(invoice.totalCents || 0)}
                    </span>
                    <span className="w-28 text-xs text-muted-foreground">
                      {invoice.issuedAt
                        ? format(new Date(invoice.issuedAt), "MMM d, yyyy")
                        : "-"}
                    </span>
                    <span className="w-28 text-xs text-muted-foreground">
                      {invoice.dueAt
                        ? format(new Date(invoice.dueAt), "MMM d, yyyy")
                        : "-"}
                    </span>
                  </Link>
                  <div className="w-16 flex justify-end">
                    {invoice.status === "draft" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(invoice.id);
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-invoice-${invoice.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) =>
                createMutation.mutate(data)
              )}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select
                      value={field.value || ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-invoice-client">
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional notes for this invoice..."
                        rows={3}
                        data-testid="input-invoice-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-submit-invoice"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Invoice"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
