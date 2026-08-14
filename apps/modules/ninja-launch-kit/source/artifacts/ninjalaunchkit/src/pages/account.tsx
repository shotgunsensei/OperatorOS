import { useGetSubscription, useGetSession, useLogout, useCreateBillingPortal, getGetSubscriptionQueryKey, getGetSessionQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Shield, CreditCard, LogOut, AlertTriangle, Loader2, ExternalLink, Sparkles, Check, X } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-500",
  trialing: "bg-blue-500/20 text-blue-400",
  past_due: "bg-destructive/20 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  unpaid: "bg-destructive/20 text-destructive",
  incomplete: "bg-yellow-500/20 text-yellow-500",
  demo: "bg-primary/20 text-primary",
};

function FeatureRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-green-500 shrink-0" /> : <X className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
      <span className={ok ? "" : "text-muted-foreground line-through"}>{label}</span>
    </li>
  );
}

export default function Account() {
  const { data: subscription, isLoading: isSubLoading } = useGetSubscription();
  const { data: session, isLoading: isSessionLoading } = useGetSession();
  const logout = useLogout();
  const portal = useCreateBillingPortal();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      toast.success(`Upgraded to ${(params.get("plan") || "").toUpperCase()}!`, {
        description: "Your subscription is being activated.",
      });
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [queryClient]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/");
      },
    });
  };

  const handleManageBilling = () => {
    portal.mutate(undefined, {
      onSuccess: (res) => {
        if (res.url) {
          window.location.href = res.url;
        } else {
          toast.info("Billing portal unavailable", {
            description: res.reason ?? "Subscribe to a paid plan to manage billing.",
          });
        }
      },
      onError: (err) => toast.error("Failed to open billing portal", { description: err.message }),
    });
  };

  if (isSubLoading || isSessionLoading) {
    return <div className="p-8 font-mono animate-pulse text-muted-foreground">LOADING_ACCOUNT_DATA...</div>;
  }

  const plan = subscription?.plan ?? "free";
  const limits = subscription?.limits;
  const usage = subscription?.usage;
  const monthlyLimit = limits?.monthlyKits;
  const kitsThisMonth = usage?.kitsThisMonth ?? 0;
  const percentUsed = monthlyLimit ? Math.min(100, (kitsThisMonth / monthlyLimit) * 100) : 0;
  const isNearLimit = percentUsed > 80;
  const stripeEnabled = subscription?.stripeEnabled ?? false;
  const hasStripeCustomer = subscription?.hasStripeCustomer ?? false;
  const status = subscription?.status ?? "demo";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account & Billing</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">Manage subscription and capacity</p>
      </div>

      {!stripeEnabled && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-md p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-mono text-yellow-500 font-bold">DEMO_BILLING_ACTIVE</p>
            <p className="text-muted-foreground mt-1">Stripe is not yet configured. Plan changes apply locally without payment. Add the Stripe environment variables to enable real subscriptions.</p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Operator Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-mono text-muted-foreground">NAME</p>
              <p className="font-medium">{session?.user?.name || 'Demo User'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-mono text-muted-foreground">EMAIL</p>
              <p className="font-medium">{session?.user?.email || 'demo@ninjalaunchkit.com'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-mono text-muted-foreground">ROLE</p>
              <Badge variant="outline" className="uppercase">{session?.user?.role || 'guest'}</Badge>
            </div>
          </CardContent>
          <CardFooter className="pt-4 border-t border-border/30">
            <Button variant="destructive" className="w-full font-mono text-xs tracking-wider" onClick={handleLogout} disabled={logout.isPending} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" />
              TERMINATE_SESSION
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Subscription
              </div>
              <Badge className={STATUS_COLORS[status] ?? "bg-muted"}>
                {status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-border/30">
              <div>
                <p className="text-sm font-mono text-muted-foreground">CURRENT_PLAN</p>
                <p className="text-2xl font-bold capitalize mt-1 text-primary" data-testid="text-current-plan">{plan}</p>
              </div>
              <Link href="/pricing">
                <Button variant="outline" size="sm" className="font-mono text-xs" data-testid="button-change-plan">CHANGE_PLAN</Button>
              </Link>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-mono text-muted-foreground">MONTHLY_KITS</span>
                <span className="font-mono" data-testid="text-monthly-usage">
                  {kitsThisMonth} / {monthlyLimit ?? '∞'}
                </span>
              </div>
              {monthlyLimit && (
                <Progress value={percentUsed} className={`h-2 ${isNearLimit ? 'bg-destructive/20 [&>div]:bg-destructive' : 'bg-primary/20 [&>div]:bg-primary'}`} />
              )}
              {isNearLimit && monthlyLimit && (
                <p className="text-xs text-destructive flex items-center gap-1 mt-2">
                  <AlertTriangle className="h-3 w-3" />
                  Approaching your monthly cap
                </p>
              )}
            </div>

            {limits && (
              <div className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground">BRAND_PROFILES</p>
                <div className="flex justify-between text-sm font-mono">
                  <span>{usage?.brandProfilesUsed ?? 0} used</span>
                  <span>{limits.brandProfiles ?? "∞"} allowed</span>
                </div>
              </div>
            )}

            {subscription?.currentPeriodEnd && (
              <div className="pt-4 border-t border-border/30">
                <p className="text-sm font-mono text-muted-foreground">RENEWAL_DATE</p>
                <p className="font-medium">{format(new Date(subscription.currentPeriodEnd), 'MMMM dd, yyyy')}</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t border-border/30 pt-4 flex flex-col gap-2">
            <Button
              className="w-full font-mono text-xs gap-2"
              variant="default"
              onClick={handleManageBilling}
              disabled={portal.isPending || !stripeEnabled || !hasStripeCustomer}
              data-testid="button-manage-billing"
            >
              {portal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              MANAGE_BILLING
            </Button>
            {!hasStripeCustomer && stripeEnabled && (
              <p className="text-[10px] font-mono text-muted-foreground text-center">
                Subscribe to a paid plan to access the billing portal.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>

      {limits && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-base font-mono">PLAN_CAPABILITIES</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid md:grid-cols-2 gap-x-8 gap-y-2">
              <FeatureRow ok={limits.monthlyKits === null} label="Unlimited monthly kits" />
              <FeatureRow ok={limits.exportFormats.includes("markdown")} label="Markdown export" />
              <FeatureRow ok={limits.exportFormats.includes("json")} label="JSON export" />
              <FeatureRow ok={!limits.watermarkExports} label="No watermark on exports" />
              <FeatureRow ok={limits.brandProfiles !== 0} label="Brand profiles" />
              <FeatureRow ok={limits.adVariants} label="Ad copy variants" />
              <FeatureRow ok={limits.emailSmsSequences} label="Email & SMS sequences" />
              <FeatureRow ok={limits.clientWorkspaces} label="Client workspaces" />
              <FeatureRow ok={limits.whiteLabel} label="White-label exports" />
              <FeatureRow ok={limits.teamAccess} label="Team access" />
              <FeatureRow ok={limits.commercialUseRights} label="Commercial client-use rights" />
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
