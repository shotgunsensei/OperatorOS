import type { CaseCatalogEntry } from '@/data/caseCatalog';

export function getUtcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function pickDailyCase(
  cases: CaseCatalogEntry[],
  date: Date = new Date()
): CaseCatalogEntry | null {
  if (cases.length === 0) return null;
  const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));
  const idx = hashString(getUtcDateKey(date)) % sorted.length;
  return sorted[idx];
}

export function utcDateDiffInDays(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
