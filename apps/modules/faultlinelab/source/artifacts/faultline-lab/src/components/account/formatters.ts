import type { BillingHistoryEntry } from '@/lib/api';
import { CATALOG } from '@/data/catalog';

const PRODUCT_NAME_BY_ID = new Map(CATALOG.map((p) => [p.id, p.name]));

export function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null || amount === undefined) return '—';
  const cur = (currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${cur}`;
  }
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function statusStyles(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s === 'paid' || s === 'completed' || s === 'fulfilled') {
    return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  }
  if (s === 'refunded') {
    return 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30';
  }
  if (s === 'open' || s === 'pending') {
    return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
  }
  if (s === 'void' || s === 'uncollectible' || s === 'failed') {
    return 'text-red-300 bg-red-500/10 border-red-500/30';
  }
  return 'text-zinc-400 bg-zinc-800 border-zinc-700';
}

export function entryLabel(entry: BillingHistoryEntry): string {
  if (entry.kind === 'invoice') {
    return entry.number ? `Invoice ${entry.number}` : 'Subscription invoice';
  }
  if (entry.productId) {
    return PRODUCT_NAME_BY_ID.get(entry.productId) || entry.productId;
  }
  return 'Purchase';
}

export function formatRenewalDate(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) return null;
  const ms = num > 1e12 ? num : num * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export type SubscriptionInfo = {
  id: string;
  status: string;
  current_period_end: number | string | null;
  cancel_at_period_end?: boolean | null;
} | null;
