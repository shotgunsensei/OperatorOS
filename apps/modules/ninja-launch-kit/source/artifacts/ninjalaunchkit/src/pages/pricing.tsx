import { useListPlans, useGetSession, useGetSubscription, useCreateCheckoutSession, getGetSessionQueryKey, getGetSubscriptionQueryKey, CheckoutBodyPlanId } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Pricing() {
  const { data: plans, isLoading } = useListPlans();
  const { data: session } = useGetSession();
  const { data: subscription } = useGetSubscription();
  const checkout = useCreateCheckoutSession();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const currentPlan = subscription?.plan ?? session?.user?.plan ?? "free";
  const stripeEnabled = subscription?.stripeEnabled ?? false;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled") === "1") {
      toast.info("Checkout canceled — no charges were made.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSubscribe = (planId: string) => {
    if (planId === "free") {
      toast.info("You're already on the free plan by default.");
      return;
    }
    if (planId === currentPlan) return;

    checkout.mutate(
      { data: { planId: planId as CheckoutBodyPlanId } },
      {
        onSuccess: (res) => {
          if (res.url) {
            window.location.href = res.url;
            return;
          }
          // Demo mode (Stripe not configured on server)
          toast.success(`Demo upgrade applied: ${res.plan.toUpperCase()}`, {
            description: "Configure Stripe keys to enable real billing.",
          });
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey() });
          setLocation("/account");
        },
        onError: (err) => {
          toast.error("Failed to start checkout", { description: err.message });
        },
      },
    );
  };

  return (
    <div className="container max-w-6xl mx-auto py-12 px-4 md:py-24">
      <div className="text-center space-y-4 mb-16">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Weaponize Your Launch</h1>
        <p className="text-xl text-muted-foreground font-mono">Select your operational capacity.</p>
        {!stripeEnabled && (
          <p className="text-xs font-mono text-yellow-500/80 inline-flex items-center gap-2 px-3 py-1.5 border border-yellow-500/20 bg-yellow-500/5 rounded">
            <Sparkles className="h-3 w-3" /> DEMO_MODE — Stripe not configured. Plan changes apply locally only.
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center"><p className="font-mono animate-pulse">LOADING_DATA...</p></div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {plans?.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isPending = checkout.isPending && checkout.variables?.data.planId === plan.id;

            return (
              <Card key={plan.id} className={`relative flex flex-col ${plan.highlighted ? 'border-primary shadow-lg shadow-primary/20' : 'border-border/40'}`} data-testid={`card-plan-${plan.id}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full">
                    RECOMMENDED
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 right-4 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
                    CURRENT
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                  <CardDescription className="h-10">{plan.tagline}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">${plan.priceMonthly}</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3 text-sm">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full font-bold tracking-wider hover-elevate"
                    variant={plan.highlighted ? "default" : "outline"}
                    disabled={isCurrent || checkout.isPending}
                    onClick={() => handleSubscribe(plan.id)}
                    data-testid={`button-subscribe-${plan.id}`}
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {isCurrent ? "CURRENT PLAN" : plan.ctaLabel.toUpperCase()}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
