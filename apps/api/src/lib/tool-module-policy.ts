import { TOOL_MODULE_CATALOG, TOOL_PURCHASE_PENDING_DECISIONS } from '@operatoros/sdk';

/** Only server-resolved user, tenant and persisted membership rows may supply this context. */
export interface ToolPurchaseContext {
  userId: string;
  userStatus: string;
  tenantId: string;
  tenantStatus: string;
  ownerUserId: string;
  membership: { userId: string; tenantId: string; role: string } | null;
}

export type ToolPurchaseEligibilityReason =
  | 'eligible' | 'user_inactive' | 'tenant_inactive' | 'not_a_member' | 'owner_required';

/** Base subscription, Stack seats and companions intentionally are not inputs. */
export function toolPurchaseEligibility(context: ToolPurchaseContext): {
  eligible: boolean; reason: ToolPurchaseEligibilityReason;
} {
  if (context.userStatus !== 'active') return { eligible: false, reason: 'user_inactive' };
  if (context.tenantStatus !== 'active') return { eligible: false, reason: 'tenant_inactive' };
  const membership = context.membership;
  if (!context.userId || !context.tenantId || !membership
    || membership.userId !== context.userId || membership.tenantId !== context.tenantId) {
    return { eligible: false, reason: 'not_a_member' };
  }
  if (membership.role !== 'owner' || context.ownerUserId !== context.userId) {
    return { eligible: false, reason: 'owner_required' };
  }
  return { eligible: true, reason: 'eligible' };
}

export function toolModuleCatalogReadiness(context: ToolPurchaseContext) {
  return {
    contractVersion: 1 as const,
    tenantId: context.tenantId,
    purchaseEligibility: toolPurchaseEligibility(context),
    checkoutAvailable: false as const,
    pendingDecisions: [...TOOL_PURCHASE_PENDING_DECISIONS],
    tools: TOOL_MODULE_CATALOG.map(tool => ({ ...tool })),
  };
}
