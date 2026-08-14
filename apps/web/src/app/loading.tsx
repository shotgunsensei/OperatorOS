import { brand } from '@/lib/brand';
import OperatorLoader from '@/components/brand/OperatorLoader';

// Marketing-redesign Phase 1 — branded route-level loading state.
//
// Next.js renders this `loading.tsx` automatically whenever any
// segment under `/` is suspending (initial nav, fast-refresh, route
// segment fetches). Wrapping the OperatorLoader in the same near-black
// brand canvas keeps the first paint on `/`, `/modules`, `/pricing`,
// and `/how-it-works` consistent with the marketing chrome rather
// than flashing the default Next.js white blank.
//
// `/app` defines its own loading state inside ConsolePage (the
// signed-out branch needs its own auth-aware splash), so this only
// affects the public marketing tree.
export default function MarketingLoading() {
  return (
    <div
      data-testid="marketing-loading"
      style={{
        minHeight: '100vh',
        background: brand.bgPrimary,
        color: brand.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <OperatorLoader label="Loading OperatorOS…" />
    </div>
  );
}
