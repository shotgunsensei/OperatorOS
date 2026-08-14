import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface EntitlementsResponse {
  snapshot: { accessLevel?: string; planSlug?: string } | null;
}

const PLAN_VARIANTS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  basic: { label: "Basic", variant: "outline" },
  solo: { label: "Solo", variant: "outline" },
  pro: { label: "Pro", variant: "secondary" },
  msp: { label: "MSP", variant: "default" },
  enterprise: { label: "Enterprise", variant: "default" },
};

/**
 * Task #12: badge now reads the OperatorOS entitlement snapshot
 * (access_level), not the local Stripe subscription.
 */
export function PlanBadge({ canManage }: { canManage: boolean }) {
  const { data } = useQuery<EntitlementsResponse>({
    queryKey: ["/api/me/entitlements"],
    enabled: canManage,
    staleTime: 60_000,
  });

  if (!canManage) return null;

  const code = (data?.snapshot?.accessLevel || data?.snapshot?.planSlug || "basic").toLowerCase();
  const meta = PLAN_VARIANTS[code] || { label: code, variant: "outline" as const };

  const badge = (
    <Badge variant={meta.variant} className="gap-1 text-xs" data-testid={`plan-badge-${code}`}>
      {meta.label}
    </Badge>
  );

  return (
    <Link href="/billing" className="hover-elevate rounded-md inline-flex" data-testid="link-plan-badge">
      {badge}
    </Link>
  );
}
