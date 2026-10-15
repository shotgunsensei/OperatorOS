import {
  CORE_PRODUCTS,
  isEligibleCompanionModuleKey,
  normalizeStackSelection,
  type CoreProductKey,
  type StackSelection,
} from '@operatoros/sdk';

/** Presentation of the server-owned pending cart; this never grants access. */
export function pendingStackSelection(value: unknown): StackSelection | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.status !== 'incomplete'
      || typeof row.coreProduct !== 'string'
      || !CORE_PRODUCTS.some(product => product.key === row.coreProduct)
      || typeof row.includedCompanionKey !== 'string'
      || !isEligibleCompanionModuleKey(row.includedCompanionKey)
      || !Array.isArray(row.additionalModuleKeys)
      || !row.additionalModuleKeys.every((key): key is string => typeof key === 'string' && isEligibleCompanionModuleKey(key))
      || new Set(row.additionalModuleKeys).size !== row.additionalModuleKeys.length
      || row.additionalModuleKeys.includes(row.includedCompanionKey)
      || typeof row.additionalSeats !== 'number'
      || !Number.isSafeInteger(row.additionalSeats)
      || row.additionalSeats < 0) return null;
  try {
    return normalizeStackSelection({
      coreProduct: row.coreProduct as CoreProductKey,
      freeCompanionModule: row.includedCompanionKey,
      additionalModules: row.additionalModuleKeys.filter(isEligibleCompanionModuleKey),
      additionalSeats: row.additionalSeats,
    });
  } catch {
    return null;
  }
}
