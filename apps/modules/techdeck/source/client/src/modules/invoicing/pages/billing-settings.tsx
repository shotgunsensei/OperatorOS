import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function BillingSettingsPage() {
  const { toast } = useToast();

  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/billing-config"],
  });

  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [defaultHourlyRate, setDefaultHourlyRate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [invoicePrefix, setInvoicePrefix] = useState("INV-");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  useEffect(() => {
    if (config) {
      setCompanyName(config.companyName || "");
      setCompanyAddress(config.companyAddress || "");
      setCompanyPhone(config.companyPhone || "");
      setCompanyEmail(config.companyEmail || "");
      setDefaultHourlyRate(
        config.defaultHourlyRateCents
          ? (config.defaultHourlyRateCents / 100).toFixed(2)
          : ""
      );
      setCurrency(config.currency || "USD");
      setInvoicePrefix(config.invoicePrefix || "INV-");
      setPaymentTermsDays(String(config.paymentTermsDays ?? 30));
      setInvoiceNotes(config.invoiceNotes || "");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        companyName: companyName || null,
        companyAddress: companyAddress || null,
        companyPhone: companyPhone || null,
        companyEmail: companyEmail || null,
        defaultHourlyRateCents: defaultHourlyRate
          ? Math.round(parseFloat(defaultHourlyRate) * 100)
          : 0,
        currency,
        invoicePrefix,
        paymentTermsDays: parseInt(paymentTermsDays) || 30,
        invoiceNotes: invoiceNotes || null,
      };
      return apiRequest("PUT", "/api/billing-config", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing-config"] });
      toast({ title: "Billing settings saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save settings",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1
          className="text-2xl font-bold tracking-tight"
          data-testid="text-billing-settings-title"
        >
          Billing Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure your invoicing defaults and company information.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Company Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyEmail">Company Email</Label>
              <Input
                id="companyEmail"
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="billing@example.com"
                data-testid="input-company-email"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyAddress">Company Address</Label>
            <Textarea
              id="companyAddress"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              rows={2}
              data-testid="input-company-address"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyPhone">Company Phone</Label>
            <Input
              id="companyPhone"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              data-testid="input-company-phone"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Invoice Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultHourlyRate">
                Default Hourly Rate ($)
              </Label>
              <Input
                id="defaultHourlyRate"
                type="number"
                step="0.01"
                min="0"
                value={defaultHourlyRate}
                onChange={(e) => setDefaultHourlyRate(e.target.value)}
                placeholder="0.00"
                data-testid="input-default-hourly-rate"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="AUD">AUD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
              <Input
                id="invoicePrefix"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                placeholder="INV-"
                data-testid="input-invoice-prefix"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
              <Input
                id="paymentTermsDays"
                type="number"
                min="1"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(e.target.value)}
                placeholder="30"
                data-testid="input-payment-terms-days"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceNotes">Default Invoice Notes</Label>
            <Textarea
              id="invoiceNotes"
              value={invoiceNotes}
              onChange={(e) => setInvoiceNotes(e.target.value)}
              placeholder="Thank you for your business..."
              rows={3}
              data-testid="input-invoice-notes"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-billing-settings"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
