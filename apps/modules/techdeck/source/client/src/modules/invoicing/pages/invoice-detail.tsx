import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Copy,
  Pencil,
  Loader2,
  Clock,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [showAddLineItem, setShowAddLineItem] = useState(false);
  const [showImportTime, setShowImportTime] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editPrice, setEditPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("");
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<Set<string>>(
    new Set()
  );

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: ["/api/invoices", id],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load invoice");
      return res.json();
    },
  });

  const { data: timeEntries, isLoading: timeEntriesLoading } = useQuery<any[]>({
    queryKey: ["/api/time-entries", invoice?.clientId, "uninvoiced"],
    queryFn: async () => {
      const res = await fetch(
        `/api/time-entries?clientId=${invoice.clientId}&uninvoiced=true`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to load time entries");
      return res.json();
    },
    enabled: !!invoice?.clientId && showImportTime,
  });

  const sendMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/invoices/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice sent" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send invoice",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/invoices/${id}/mark-paid`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice marked as paid" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to mark as paid",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const addLineItemMutation = useMutation({
    mutationFn: async (data: {
      description: string;
      quantity: number;
      unitPriceCents: number;
      timeEntryId?: string | null;
    }) => apiRequest("POST", `/api/invoices/${id}/line-items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      setShowAddLineItem(false);
      setNewDesc("");
      setNewQty("1");
      setNewPrice("");
      toast({ title: "Line item added" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to add line item",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateLineItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: any;
    }) =>
      apiRequest(
        "PUT",
        `/api/invoices/${id}/line-items/${itemId}`,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      setEditingItemId(null);
      toast({ title: "Line item updated" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to update line item",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteLineItemMutation = useMutation({
    mutationFn: async (itemId: string) =>
      apiRequest(
        "DELETE",
        `/api/invoices/${id}/line-items/${itemId}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
      toast({ title: "Line item deleted" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to delete line item",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyPublicLink = () => {
    if (!invoice?.publicToken) return;
    const url = `${window.location.origin}/public/invoices/${invoice.publicToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Public link copied to clipboard" });
  };

  const handleAddLineItem = () => {
    const qty = parseInt(newQty) || 1;
    const priceCents = Math.round(parseFloat(newPrice) * 100) || 0;
    addLineItemMutation.mutate({
      description: newDesc,
      quantity: qty,
      unitPriceCents: priceCents,
    });
  };

  const handleUpdateLineItem = (itemId: string) => {
    const qty = parseInt(editQty) || 1;
    const priceCents = Math.round(parseFloat(editPrice) * 100) || 0;
    updateLineItemMutation.mutate({
      itemId,
      data: {
        description: editDesc,
        quantity: qty,
        unitPriceCents: priceCents,
      },
    });
  };

  const startEditItem = (item: any) => {
    setEditingItemId(item.id);
    setEditDesc(item.description);
    setEditQty(String(item.quantity));
    setEditPrice((item.unitPriceCents / 100).toFixed(2));
  };

  const handleImportTimeEntries = async () => {
    for (const entryId of Array.from(selectedTimeEntries)) {
      const entry = timeEntries?.find((e: any) => e.id === entryId);
      if (!entry) continue;
      const durationHours = (entry.durationMinutes || 0) / 60;
      const rateCents = entry.hourlyRateCents || 0;
      const unitPriceCents = Math.round(durationHours * rateCents);
      await apiRequest("POST", `/api/invoices/${id}/line-items`, {
        description: entry.description || `Time entry: ${durationHours.toFixed(2)}h`,
        quantity: 1,
        unitPriceCents,
        timeEntryId: entry.id,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/invoices", id] });
    setSelectedTimeEntries(new Set());
    setShowImportTime(false);
    toast({ title: `${selectedTimeEntries.size} time entries imported` });
  };

  const toggleTimeEntry = (entryId: string) => {
    const next = new Set(selectedTimeEntries);
    if (next.has(entryId)) next.delete(entryId);
    else next.add(entryId);
    setSelectedTimeEntries(next);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-32 w-full rounded-md" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button variant="outline" size="sm" asChild className="mt-2">
          <Link href="/invoices">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to invoices
          </Link>
        </Button>
      </div>
    );
  }

  const lineItems = invoice.lineItems || [];
  const newTotalPreview =
    newPrice && newQty
      ? (parseInt(newQty) || 1) * (parseFloat(newPrice) || 0)
      : 0;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          data-testid="button-back-invoices"
        >
          <Link href="/invoices">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Invoices
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="text-lg"
              data-testid="text-invoice-number"
            >
              {invoice.invoiceNumber}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge
                variant="secondary"
                className={`text-xs ${statusColors[invoice.status] || ""}`}
                data-testid="badge-invoice-status"
              >
                {statusLabels[invoice.status] || invoice.status}
              </Badge>
              <span
                className="text-sm text-muted-foreground"
                data-testid="text-invoice-client"
              >
                {invoice.clientName || "No Client"}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              {invoice.issuedAt && (
                <span data-testid="text-invoice-issued-date">
                  Issued:{" "}
                  {format(new Date(invoice.issuedAt), "MMM d, yyyy")}
                </span>
              )}
              {invoice.dueAt && (
                <span data-testid="text-invoice-due-date">
                  Due:{" "}
                  {format(new Date(invoice.dueAt), "MMM d, yyyy")}
                </span>
              )}
              {invoice.paidAt && (
                <span data-testid="text-invoice-paid-date">
                  Paid:{" "}
                  {format(new Date(invoice.paidAt), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {invoice.status === "draft" && (
              <Button
                size="sm"
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                data-testid="button-send-invoice"
              >
                <Send className="w-4 h-4 mr-1" />
                Send Invoice
              </Button>
            )}
            {(invoice.status === "sent" ||
              invoice.status === "viewed" ||
              invoice.status === "overdue" ||
              invoice.status === "partial") && (
              <Button
                size="sm"
                onClick={() => markPaidMutation.mutate()}
                disabled={markPaidMutation.isPending}
                data-testid="button-mark-paid"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Mark as Paid
              </Button>
            )}
            {invoice.publicToken && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyPublicLink}
                data-testid="button-copy-public-link"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy Public Link
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Line Items
          </CardTitle>
          <div className="flex items-center gap-1">
            {invoice.clientId && invoice.status === "draft" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImportTime(true)}
                data-testid="button-import-time-entries"
              >
                <Clock className="w-4 h-4 mr-1" />
                Import Time
              </Button>
            )}
            {invoice.status === "draft" && (
              <Button
                size="sm"
                onClick={() => setShowAddLineItem(true)}
                data-testid="button-add-line-item"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!lineItems.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No line items yet.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground font-medium">
                <span className="flex-1">Description</span>
                <span className="w-16 text-right">Qty</span>
                <span className="w-24 text-right">Unit Price</span>
                <span className="w-24 text-right">Total</span>
                {invoice.status === "draft" && (
                  <span className="w-20">Actions</span>
                )}
              </div>
              {lineItems.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                  data-testid={`line-item-row-${item.id}`}
                >
                  {editingItemId === item.id ? (
                    <>
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="flex-1"
                        data-testid="input-edit-line-description"
                      />
                      <Input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="w-16 text-right"
                        min="1"
                        data-testid="input-edit-line-qty"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-24 text-right"
                        data-testid="input-edit-line-price"
                      />
                      <span className="w-24 text-right text-sm font-medium">
                        {formatCurrency(
                          (parseInt(editQty) || 1) *
                            Math.round((parseFloat(editPrice) || 0) * 100)
                        )}
                      </span>
                      <div className="w-20 flex gap-1">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleUpdateLineItem(item.id)
                          }
                          disabled={
                            updateLineItemMutation.isPending
                          }
                          data-testid="button-save-line-item"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingItemId(null)}
                        >
                          X
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">
                        {item.description}
                      </span>
                      <span className="w-16 text-right text-sm">
                        {item.quantity}
                      </span>
                      <span className="w-24 text-right text-sm">
                        {formatCurrency(item.unitPriceCents)}
                      </span>
                      <span
                        className="w-24 text-right text-sm font-medium"
                        data-testid={`text-line-total-${item.id}`}
                      >
                        {formatCurrency(item.totalCents)}
                      </span>
                      {invoice.status === "draft" && (
                        <div className="w-20 flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEditItem(item)}
                            data-testid={`button-edit-line-${item.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              deleteLineItemMutation.mutate(
                                item.id
                              )
                            }
                            disabled={
                              deleteLineItemMutation.isPending
                            }
                            data-testid={`button-delete-line-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator />
          <div className="px-4 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span data-testid="text-invoice-subtotal">
                {formatCurrency(invoice.subtotalCents || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span data-testid="text-invoice-tax">
                {formatCurrency(invoice.taxCents || 0)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span data-testid="text-invoice-total">
                {formatCurrency(invoice.totalCents || 0)}
              </span>
            </div>
            {invoice.amountPaidCents > 0 &&
              invoice.amountPaidCents < invoice.totalCents && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Amount Paid</span>
                  <span data-testid="text-invoice-amount-paid">
                    {formatCurrency(invoice.amountPaidCents)}
                  </span>
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-sm whitespace-pre-wrap"
              data-testid="text-invoice-notes"
            >
              {invoice.notes}
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddLineItem} onOpenChange={setShowAddLineItem}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Line Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Service description"
                data-testid="input-new-line-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  data-testid="input-new-line-qty"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-new-line-price"
                />
              </div>
            </div>
            {newTotalPreview > 0 && (
              <div className="text-sm text-muted-foreground">
                Total: ${newTotalPreview.toFixed(2)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddLineItem}
              disabled={
                !newDesc || addLineItemMutation.isPending
              }
              data-testid="button-submit-line-item"
            >
              {addLineItemMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportTime} onOpenChange={setShowImportTime}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Time Entries</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {timeEntriesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-12 w-full rounded-md"
                  />
                ))}
              </div>
            ) : !timeEntries?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No uninvoiced time entries found for this client.
              </p>
            ) : (
              timeEntries.map((entry: any) => {
                const durationHours =
                  (entry.durationMinutes || 0) / 60;
                const rateCents = entry.hourlyRateCents || 0;
                const totalCents = Math.round(
                  durationHours * rateCents
                );
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted/30"
                    data-testid={`time-entry-row-${entry.id}`}
                  >
                    <Checkbox
                      checked={selectedTimeEntries.has(entry.id)}
                      onCheckedChange={() =>
                        toggleTimeEntry(entry.id)
                      }
                      data-testid={`checkbox-time-entry-${entry.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {entry.description || "Time entry"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {durationHours.toFixed(2)}h @{" "}
                        {formatCurrency(rateCents)}/hr ={" "}
                        {formatCurrency(totalCents)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {entry.date
                        ? format(
                            new Date(entry.date),
                            "MMM d, yyyy"
                          )
                        : ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleImportTimeEntries}
              disabled={selectedTimeEntries.size === 0}
              data-testid="button-import-selected-time"
            >
              Import {selectedTimeEntries.size} Entries
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
