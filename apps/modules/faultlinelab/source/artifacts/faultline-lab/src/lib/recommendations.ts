import { CATALOG, type CatalogProduct } from '@/data/catalog';
import { getCaseEntryById } from '@/data/caseCatalog';
import { hasEntitlement } from '@/lib/entitlements';
import type { CaseDefinition, InvestigatorProfile } from '@/types';

export interface RecommendationReason {
  product: CatalogProduct;
  reason: string;
  weight: number;
}

interface BehaviorSignals {
  solvedByCategory: Record<string, number>;
  totalSolved: number;
  highEngagement: boolean;
  toolUsage: Record<string, number>;
}

const CATEGORY_TO_PRODUCT: Record<string, string> = {
  networking: 'pack-network-ops',
  servers: 'pack-server-graveyard',
  automotive: 'pack-garage-diagnostics',
  electronics: 'pack-sensor-mesh',
  mixed: 'pack-mixed-cascades',
  'windows-ad': 'upgrade-advanced-tools',
};

export function buildSignals(profile: InvestigatorProfile, toolUsage: Record<string, number> = {}): BehaviorSignals {
  const solvedByCategory: Record<string, number> = {};
  for (const id of profile.solvedCaseIds) {
    const entry = getCaseEntryById(id);
    if (!entry) continue;
    solvedByCategory[entry.category] = (solvedByCategory[entry.category] || 0) + 1;
  }
  return {
    solvedByCategory,
    totalSolved: profile.casesSolved,
    highEngagement: profile.casesSolved >= 3 || profile.totalScore >= 200,
    toolUsage,
  };
}

export function recommendProducts(
  profile: InvestigatorProfile,
  toolUsage: Record<string, number> = {},
  limit = 4
): RecommendationReason[] {
  const signals = buildSignals(profile, toolUsage);
  const recs: RecommendationReason[] = [];

  for (const [category, count] of Object.entries(signals.solvedByCategory)) {
    const productId = CATEGORY_TO_PRODUCT[category];
    if (!productId) continue;
    const product = CATALOG.find((p) => p.id === productId);
    if (!product || hasEntitlement(productId)) continue;
    recs.push({
      product,
      reason: `You solved ${count} ${category.replace('-', ' ')} ${count === 1 ? 'case' : 'cases'} — go deeper.`,
      weight: 50 + count * 10,
    });
  }

  const tu = signals.toolUsage || {};
  const telemetryHits = (tu['deep-telemetry'] || 0);
  if (telemetryHits >= 2 && !hasEntitlement('upgrade-deep-telemetry')) {
    const p = CATALOG.find((x) => x.id === 'upgrade-deep-telemetry');
    if (p) recs.push({ product: p, reason: 'You keep opening telemetry — unlock the full panel.', weight: 60 });
  }
  const sandboxHits = (tu['sandbox-pro'] || 0) + (tu['sandbox'] || 0);
  if (sandboxHits >= 2 && !hasEntitlement('upgrade-sandbox-pro')) {
    const p = CATALOG.find((x) => x.id === 'upgrade-sandbox-pro');
    if (p) recs.push({ product: p, reason: 'You tried the sandbox repeatedly — go pro.', weight: 60 });
  }
  const advancedHits =
    (tu['advanced-tools'] || 0) +
    (tu['wireshark-panel'] || 0) +
    (tu['registry-deep-dive'] || 0) +
    (tu['service-graph'] || 0) +
    (tu['metric-overlay'] || 0);
  if (advancedHits >= 2 && !hasEntitlement('upgrade-advanced-tools')) {
    const p = CATALOG.find((x) => x.id === 'upgrade-advanced-tools');
    if (p) recs.push({ product: p, reason: 'You hit advanced tool locks — unlock the full suite.', weight: 60 });
  }
  if ((tu['chaos-mode'] || 0) >= 2 && !hasEntitlement('upgrade-chaos-mode')) {
    const p = CATALOG.find((x) => x.id === 'upgrade-chaos-mode');
    if (p) recs.push({ product: p, reason: 'You keep poking at Chaos Mode — turn it on for real.', weight: 55 });
  }
  if ((tu['pro-analytics'] || 0) >= 2 && !hasEntitlement('upgrade-pro-analytics')) {
    const p = CATALOG.find((x) => x.id === 'upgrade-pro-analytics');
    if (p) recs.push({ product: p, reason: 'Analytics keeps catching your eye — unlock the full dashboard.', weight: 55 });
  }

  if (signals.highEngagement && !hasEntitlement('pro-subscription')) {
    const p = CATALOG.find((x) => x.id === 'pro-subscription');
    if (p) recs.push({ product: p, reason: 'High engagement — Pro Annual unlocks everything Pro-only.', weight: 70 });
  }
  if (signals.highEngagement && !hasEntitlement('bundle-master-investigator')) {
    const p = CATALOG.find((x) => x.id === 'bundle-master-investigator');
    if (p) recs.push({ product: p, reason: 'You play a lot — the Master Bundle is the best per-case value.', weight: 65 });
  }

  if (signals.totalSolved === 0) {
    const p = CATALOG.find((x) => x.id === 'pro-subscription');
    if (p && !hasEntitlement('pro-subscription'))
      recs.push({ product: p, reason: 'Try Pro to unlock cloud sync and the full archive.', weight: 30 });
  }

  // De-dupe by product id, keep highest weight
  const seen = new Map<string, RecommendationReason>();
  for (const r of recs) {
    const existing = seen.get(r.product.id);
    if (!existing || existing.weight < r.weight) seen.set(r.product.id, r);
  }

  return Array.from(seen.values())
    .filter((r) => r.product.status !== 'disabled')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

export function recommendForCase(
  solvedCase: CaseDefinition,
  profile: InvestigatorProfile,
  toolUsage: Record<string, number> = {},
  limit = 2
): RecommendationReason[] {
  const base = recommendProducts(profile, toolUsage, 8);
  const boosted: RecommendationReason[] = [];

  const categoryProductId = CATEGORY_TO_PRODUCT[solvedCase.category];
  if (categoryProductId && !hasEntitlement(categoryProductId)) {
    const product = CATALOG.find((p) => p.id === categoryProductId);
    if (product && product.status !== 'disabled') {
      boosted.push({
        product,
        reason: `You just cracked a ${solvedCase.category.replace('-', ' ')} case — more like it inside.`,
        weight: 100,
      });
    }
  }

  for (const r of base) {
    if (boosted.find((b) => b.product.id === r.product.id)) continue;
    boosted.push(r);
  }

  return boosted.slice(0, limit);
}
