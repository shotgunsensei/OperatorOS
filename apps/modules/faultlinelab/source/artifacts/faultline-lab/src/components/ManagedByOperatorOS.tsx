import { useAppStore } from '@/stores/useAppStore';
import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';

const OPERATOROS_RETURN_URL =
  import.meta.env.VITE_OPERATOROS_BASE_URL ||
  'https://operatoros.app';

interface Props {
  variant: 'store' | 'pricing';
}

/**
 * Read-only panel rendered in place of the Store / Pricing screens when the
 * signed-in user is managed by OperatorOS (entitlement pivot, Task #108).
 * Plans, seats, subscriptions, and module access are all owned by the parent
 * app — the child app must not present a billing surface.
 */
type Variant = 'store' | 'pricing' | 'account';

interface PropsExt extends Omit<Props, 'variant'> {
  variant: Variant;
}

export default function ManagedByOperatorOS({ variant }: PropsExt) {
  const setView = useAppStore((s) => s.setView);
  const operator = useAppStore((s) => s.operatorIdentity);
  const planSlug = operator?.planSlug ?? '—';
  const accessLevel = operator?.accessLevel ?? 'standard';
  const subscriptionStatus = operator?.subscriptionStatus ?? null;
  const localRole = operator?.localRole ?? 'standard';
  const features = operator?.features ?? [];
  const billingUrl = `${OPERATOROS_RETURN_URL.replace(/\/+$/, '')}/billing`;
  const heading =
    variant === 'pricing'
      ? 'Plans & pricing'
      : variant === 'account'
        ? 'Subscription'
        : 'Store';

  return (
    <div className="min-h-screen bg-[#0a0e14] text-cyan-100 font-mono">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <button
          onClick={() => setView('incident-board')}
          className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200 text-sm"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back to incidents
        </button>

        <header className="space-y-2">
          <div className="flex items-center gap-3 text-cyan-400">
            <ShieldCheck className="w-6 h-6" aria-hidden />
            <span className="text-xs uppercase tracking-[0.2em] text-cyan-400/70">
              Managed by OperatorOS
            </span>
          </div>
          <h1 className="text-3xl text-cyan-200">{heading}</h1>
          <p className="text-sm text-cyan-100/70 max-w-prose">
            Your Faultline Lab access is provisioned by your OperatorOS
            workspace. Plans, seats, and add-ons are managed in OperatorOS —
            changes there are reflected here automatically.
          </p>
        </header>

        <section className="border border-cyan-400/20 bg-cyan-400/5 rounded-md p-6 space-y-4">
          <h2 className="text-sm uppercase tracking-wider text-cyan-300">
            Current entitlement
          </h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-cyan-100/60">Plan</dt>
            <dd className="text-cyan-100">{planSlug}</dd>
            <dt className="text-cyan-100/60">Access level</dt>
            <dd className="text-cyan-100 capitalize">{accessLevel}</dd>
            {subscriptionStatus ? (
              <>
                <dt className="text-cyan-100/60">Subscription</dt>
                <dd className="text-cyan-100 capitalize">{subscriptionStatus}</dd>
              </>
            ) : null}
            {operator?.tenantId ? (
              <>
                <dt className="text-cyan-100/60">Tenant</dt>
                <dd className="text-cyan-100 truncate" title={operator.tenantId}>
                  {operator.tenantId}
                </dd>
              </>
            ) : null}
            {operator?.moduleRole ? (
              <>
                <dt className="text-cyan-100/60">Module role</dt>
                <dd className="text-cyan-100">{operator.moduleRole}</dd>
              </>
            ) : null}
            <dt className="text-cyan-100/60">App role</dt>
            <dd className="text-cyan-100 capitalize">{localRole}</dd>
          </dl>
        </section>

        <section className="border border-cyan-400/20 bg-cyan-400/5 rounded-md p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-cyan-300">
            Enabled features
          </h2>
          {features.length === 0 ? (
            <p className="text-sm text-cyan-100/60">
              No add-on features granted by OperatorOS for this account.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-xs">
              {features.map((f) => (
                <li
                  key={f}
                  className="px-2 py-1 rounded border border-emerald-400/40 text-emerald-300 bg-emerald-400/5"
                >
                  {f}
                </li>
              ))}
            </ul>
          )}
        </section>

        <a
          href={billingUrl}
          className="inline-flex items-center gap-2 px-5 py-3 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-400/10 rounded transition-colors text-sm uppercase tracking-wider"
        >
          Manage billing in OperatorOS
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
