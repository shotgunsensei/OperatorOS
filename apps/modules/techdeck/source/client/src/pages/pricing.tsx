import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentReturnUrl, getOperatorOsBillingUrl, withReturnTo } from "@/lib/operatoros";

export default function PricingPage() {
  const billingUrl = withReturnTo(getOperatorOsBillingUrl(), getCurrentReturnUrl());

  useEffect(() => {
    window.location.replace(billingUrl);
  }, [billingUrl]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 text-sm font-semibold" data-testid="link-home">
              <ArrowLeft className="h-4 w-4" /> Tech Deck
            </a>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-16">
        <Card>
          <CardContent className="p-10 text-center space-y-6">
            <h1 className="text-3xl font-bold" data-testid="text-pricing-title">
              Opening OperatorOS Billing
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              TechDeck does not own pricing, checkout, subscriptions, or plan changes. OperatorOS manages billing and syncs entitlement state back into this module.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button asChild data-testid="button-open-operatoros">
                <a href={billingUrl}>
                  Open OperatorOS billing <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline" data-testid="button-back-home">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
