import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, ArrowLeft } from "lucide-react";

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  clientId: string;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number;
}

interface InvoiceDetail extends PortalInvoice {
  subtotalCents: number;
  taxCents: number;
  amountPaidCents: number;
  notes: string | null;
  lineItems: InvoiceLineItem[];
}

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  viewed: "secondary",
  paid: "secondary",
  partial: "outline",
  overdue: "destructive",
  cancelled: "outline",
};

function formatCurrency(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

function formatStatus(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PortalInvoicesPage() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: invoicesList, isLoading } = useQuery<PortalInvoice[]>({
    queryKey: ["/api/portal/invoices"],
  });

  const { data: invoiceDetail, isLoading: detailLoading } = useQuery<InvoiceDetail>({
    queryKey: ["/api/portal/invoices", selectedInvoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/invoices/${selectedInvoiceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoice");
      return res.json();
    },
    enabled: !!selectedInvoiceId,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-portal-invoices-title">
          <FileText className="w-6 h-6" />
          My Invoices
        </h1>
        <p className="text-muted-foreground mt-1">
          View invoices for your assigned clients
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : invoicesList && invoicesList.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesList.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  data-testid={`row-invoice-${invoice.id}`}
                >
                  <TableCell className="font-medium" data-testid={`text-invoice-number-${invoice.id}`}>
                    {invoice.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[invoice.status] || "secondary"} data-testid={`badge-invoice-status-${invoice.id}`}>
                      {formatStatus(invoice.status)}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid={`text-invoice-total-${invoice.id}`}>
                    {formatCurrency(invoice.totalCents, invoice.currency)}
                  </TableCell>
                  <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                  <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                  <TableCell>{formatDate(invoice.paidAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground" data-testid="text-no-invoices">
            No invoices available.
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => { if (!open) setSelectedInvoiceId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Invoice {invoiceDetail?.invoiceNumber || ""}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : invoiceDetail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusColors[invoiceDetail.status] || "secondary"} data-testid="badge-detail-status">
                  {formatStatus(invoiceDetail.status)}
                </Badge>
                {invoiceDetail.issuedAt && (
                  <span className="text-sm text-muted-foreground">
                    Issued: {formatDate(invoiceDetail.issuedAt)}
                  </span>
                )}
                {invoiceDetail.dueAt && (
                  <span className="text-sm text-muted-foreground">
                    Due: {formatDate(invoiceDetail.dueAt)}
                  </span>
                )}
              </div>

              {invoiceDetail.lineItems && invoiceDetail.lineItems.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceDetail.lineItems.map((item) => (
                      <TableRow key={item.id} data-testid={`row-line-item-${item.id}`}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.unitPriceCents, invoiceDetail.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(item.totalCents, invoiceDetail.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="border-t pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span data-testid="text-subtotal">{formatCurrency(invoiceDetail.subtotalCents, invoiceDetail.currency)}</span>
                </div>
                {invoiceDetail.taxCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span data-testid="text-tax">{formatCurrency(invoiceDetail.taxCents, invoiceDetail.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span data-testid="text-detail-total">{formatCurrency(invoiceDetail.totalCents, invoiceDetail.currency)}</span>
                </div>
                {invoiceDetail.amountPaidCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span data-testid="text-amount-paid">{formatCurrency(invoiceDetail.amountPaidCents, invoiceDetail.currency)}</span>
                  </div>
                )}
              </div>

              {invoiceDetail.notes && (
                <div className="border-t pt-3">
                  <p className="text-sm text-muted-foreground" data-testid="text-invoice-notes">{invoiceDetail.notes}</p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
