/** Shared amount/quantity contract for every recurring OperatorOS purchase. */
export function recurringStripePriceError(
  price: any,
  expected: { priceId: string; unitAmountCents: number; mode: 'test' | 'live' | 'disabled' },
): string | null {
  if (!price || price.id !== expected.priceId) return 'PRICE_ID_MISMATCH';
  if (price.active !== true) return 'PRICE_INACTIVE';
  if (expected.mode === 'disabled' || price.livemode !== (expected.mode === 'live')) return 'PRICE_MODE_MISMATCH';
  if (price.currency !== 'usd') return 'PRICE_CURRENCY_MISMATCH';
  if (price.billing_scheme !== 'per_unit' || price.transform_quantity != null || price.custom_unit_amount != null) {
    return 'PRICE_QUANTITY_MODEL_MISMATCH';
  }
  if (price.type !== 'recurring' || price.recurring?.interval !== 'month'
      || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed') {
    return 'PRICE_RECURRENCE_MISMATCH';
  }
  if (price.unit_amount !== expected.unitAmountCents) return 'PRICE_AMOUNT_MISMATCH';
  return null;
}
