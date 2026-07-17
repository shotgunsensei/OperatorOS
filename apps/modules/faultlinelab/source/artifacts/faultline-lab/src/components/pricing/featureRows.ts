import { CATALOG, FREE_FEATURES, PRO_FEATURES } from '@/data/catalog';

const FEATURE_LABELS: Record<string, { label: string; helper?: string }> = {
  'standard-tools': {
    label: 'Standard diagnostic tools',
    helper: 'Terminal, evidence pinning, scoring engine',
  },
  'local-progress': { label: 'Local progress tracking' },
  'guest-mode': { label: 'Play without an account' },
  'cloud-sync': {
    label: 'Cloud sync across devices',
    helper: 'Resume an investigation from any browser',
  },
  'daily-challenge': {
    label: 'Daily challenge rotation',
    helper: 'A new scored case every day',
  },
  'full-archive': {
    label: 'Full case archive access',
    helper: 'Every active case across every pack',
  },
  'advanced-stats': {
    label: 'Advanced investigator stats',
    helper: 'Per-category mastery and time-to-diagnosis trends',
  },
  'priority-access': { label: 'Priority access to new packs' },
  'wireshark-panel': {
    label: 'Advanced Tool Suite',
    helper: 'Wireshark, registry deep-dive, service graph, metric overlays',
  },
  'chaos-mode': {
    label: 'Chaos Mode',
    helper: 'Randomized evidence, red herrings, time pressure',
  },
  'deep-telemetry': { label: 'Deep Telemetry' },
  'sandbox-pro': {
    label: 'Sandbox Pro authoring',
    helper: 'Build and share your own scenarios',
  },
  'pro-analytics': { label: 'Pro Investigator Analytics' },
};

const ADVANCED_FEATURE_GROUP_KEYS = new Set([
  'wireshark-panel',
  'registry-deep-dive',
  'service-graph',
  'metric-overlay',
]);

export interface FeatureRow {
  key: string;
  label: string;
  helper?: string;
  free: boolean;
  pro: boolean;
  bundle: boolean;
}

export function buildFeatureRows(): FeatureRow[] {
  const bundleProduct = CATALOG.find((p) => p.id === 'bundle-master-investigator');
  const bundledIds = new Set(bundleProduct?.bundledProductIds ?? []);

  const bundleFeatures = new Set<string>();
  if (bundleProduct) {
    for (const inner of bundleProduct.bundledProductIds ?? []) {
      const innerProduct = CATALOG.find((p) => p.id === inner);
      for (const f of innerProduct?.includedFeatures ?? []) {
        bundleFeatures.add(f);
      }
    }
  }

  const proFeatures = new Set<string>(PRO_FEATURES);
  const freeFeatures = new Set<string>(FREE_FEATURES);
  // Anything Pro entitles, the bundle (which includes Pro) also entitles.
  for (const f of proFeatures) bundleFeatures.add(f);
  for (const f of freeFeatures) bundleFeatures.add(f);

  // Order: starter cases, free features, pro features, bundle-only features,
  // then a derived "every general content pack" row for the bundle.
  const orderedKeys: string[] = [
    'starter-cases',
    ...FREE_FEATURES,
    ...PRO_FEATURES,
    'wireshark-panel',
    'chaos-mode',
    'deep-telemetry',
    'sandbox-pro',
    'pro-analytics',
    'general-packs',
  ];

  const rows: FeatureRow[] = [];
  for (const key of orderedKeys) {
    if (key === 'starter-cases') {
      rows.push({
        key,
        label: 'Hand-crafted starter cases',
        helper: '4 included, free forever',
        free: true,
        pro: true,
        bundle: true,
      });
      continue;
    }
    if (key === 'general-packs') {
      const generalPackIds = (bundleProduct?.bundledProductIds ?? []).filter((id) => {
        const p = CATALOG.find((cp) => cp.id === id);
        return p?.entitlementType === 'content-pack';
      });
      if (generalPackIds.length === 0) continue;
      rows.push({
        key,
        label: 'Every general content pack included',
        helper: `${generalPackIds.length} packs across networking, servers, automotive, IoT, and cascades`,
        free: false,
        pro: false,
        bundle: true,
      });
      continue;
    }
    // Skip the duplicate sub-feature rows that roll up into Advanced Tool Suite
    if (ADVANCED_FEATURE_GROUP_KEYS.has(key) && key !== 'wireshark-panel') continue;
    const meta = FEATURE_LABELS[key];
    if (!meta) continue;
    rows.push({
      key,
      label: meta.label,
      helper: meta.helper,
      free: freeFeatures.has(key),
      pro: freeFeatures.has(key) || proFeatures.has(key),
      bundle:
        freeFeatures.has(key) ||
        proFeatures.has(key) ||
        bundleFeatures.has(key) ||
        // Advanced tool sub-features are bundled via upgrade-advanced-tools
        (key === 'wireshark-panel' && bundledIds.has('upgrade-advanced-tools')),
    });
  }
  return rows;
}
