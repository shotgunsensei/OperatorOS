import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface EntitlementsResponse {
  snapshot: {
    subscriptionStatus?: string;
    enabled?: boolean;
  } | null;
  operatorosBillingUrl?: string;
}

const BLOCKING = new Set(["past_due", "unpaid", "canceled"]);

/**
 * Task #12: shows when the OperatorOS-managed subscription is not active.
 * The banner deep-links to OperatorOS billing — no local checkout.
 */
export function PausedBanner() {
  const { data } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
    refetchInterval: 60_000,
  });

  const status = data?.snapshot?.subscriptionStatus;
  const blocked = !!status && BLOCKING.has(status);
  if (!blocked) return null;

  const operatorosUrl =
    data?.operatorosBillingUrl ||
    (import.meta.env.VITE_OPERATOROS_BILLING_URL as string | undefined) ||
    (import.meta.env.VITE_OPERATOROS_BASE_URL as string | undefined) ||
    "/billing";

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3" data-testid="banner-paused">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <div>
            <span className="font-medium text-destructive">Subscription {status?.replace("_", " ")}</span>
            <span className="text-muted-foreground ml-1">
              — your OperatorOS subscription needs attention. Update billing in OperatorOS to restore full access.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/evidence">
            <Button size="sm" variant="outline" data-testid="button-download-data">
              <Download className="w-3 h-3 mr-1" />
              Download Data
            </Button>
          </Link>
          <Button size="sm" asChild data-testid="button-fix-billing">
            <a href={operatorosUrl} rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" />
              Manage in OperatorOS
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
