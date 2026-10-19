function resourceId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'id' in value
      && typeof value.id === 'string' && value.id.length > 0) return value.id;
  return null;
}

/** Normalize legacy and Basil-or-later invoice subscription references. */
export function stripeInvoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== 'object') return null;
  const legacyId = 'subscription' in invoice ? resourceId(invoice.subscription) : null;
  const parent = 'parent' in invoice ? invoice.parent : null;
  let parentId: string | null = null;
  if (parent && typeof parent === 'object'
      && 'type' in parent && parent.type === 'subscription_details'
      && 'subscription_details' in parent) {
    const details = parent.subscription_details;
    if (details && typeof details === 'object' && 'subscription' in details) {
      parentId = resourceId(details.subscription);
    }
  }
  // Ambiguous provider references must not select either subscription's authority.
  if (legacyId && parentId && legacyId !== parentId) return null;
  return parentId ?? legacyId;
}
