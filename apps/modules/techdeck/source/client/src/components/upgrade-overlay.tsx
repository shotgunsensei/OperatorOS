import { useQuery } from "@tanstack/react-query";
import { Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

interface UpgradeOverlayProps {
  feature: string;
  requiredPlan?: "Pro" | "MSP" | "Enterprise";
  description?: string;
}

interface EntitlementsResponse {
  operatorosBillingUrl?: string;
}

/**
 * Task #12: shown when an OperatorOS access level / feature flag doesn't
 * include the requested feature. The CTA deep-links to OperatorOS billing
 * — Tech Deck no longer owns plan switching.
 */
export function UpgradeOverlay({ feature, description }: UpgradeOverlayProps) {
  const { data } = useQuery<EntitlementsResponse>({ queryKey: ["/api/me/entitlements"], staleTime: 60_000 });
  const operatorosUrl =
    data?.operatorosBillingUrl ||
    (import.meta.env.VITE_OPERATOROS_BILLING_URL as string | undefined) ||
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
    "/billing";

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="upgrade-overlay">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight" data-testid="upgrade-overlay-title">
              {feature}
            </h2>
            <p className="text-sm text-muted-foreground mt-2" data-testid="upgrade-overlay-description">
              {description ?? `${feature} is not enabled for your OperatorOS account.`}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild data-testid="button-upgrade">
              <a href={operatorosUrl} rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Manage Access in OperatorOS
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm" data-testid="button-view-plan">
              <Link href="/billing">View current plan</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
