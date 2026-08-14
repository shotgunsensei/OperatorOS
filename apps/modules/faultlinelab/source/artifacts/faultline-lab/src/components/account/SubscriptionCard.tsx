import { AlertCircle, Calendar, CreditCard, Crown, ExternalLink, ShoppingBag } from 'lucide-react';
import { formatRenewalDate, type SubscriptionInfo } from './formatters';

interface SubscriptionCardProps {
  planLabel: string;
  isProUser: boolean;
  isSignedIn: boolean;
  subscription: SubscriptionInfo;
  subLoading: boolean;
  portalLoading: boolean;
  error: string | null;
  onManageBilling: () => void;
  onVisitStore: () => void;
}

export function SubscriptionCard({
  planLabel,
  isProUser,
  isSignedIn,
  subscription,
  subLoading,
  portalLoading,
  error,
  onManageBilling,
  onVisitStore,
}: SubscriptionCardProps) {
  const renewalDate = formatRenewalDate(subscription?.current_period_end);
  const cancelAtEnd = !!subscription?.cancel_at_period_end;
  const subStatus = subscription?.status ?? null;

  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-4">
        Subscription
      </h2>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <Crown
            size={18}
            className={
              isProUser
                ? 'text-amber-400 shrink-0 mt-0.5'
                : 'text-zinc-500 shrink-0 mt-0.5'
            }
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">{planLabel}</p>
            {subLoading && isSignedIn ? (
              <p className="text-xs text-zinc-500 mt-1">Loading subscription details…</p>
            ) : subscription ? (
              <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
                {subStatus && (
                  <p>
                    Status:{' '}
                    <span className="font-mono uppercase text-zinc-300">{subStatus}</span>
                  </p>
                )}
                {renewalDate && (
                  <p className="flex items-center gap-1.5">
                    <Calendar size={11} />
                    {cancelAtEnd ? 'Ends' : 'Renews'} on {renewalDate}
                  </p>
                )}
              </div>
            ) : isSignedIn ? (
              <p className="text-xs text-zinc-500 mt-1">
                No active subscription. Browse the store to upgrade.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 mb-3 p-2.5 rounded border border-red-500/30 bg-red-500/10">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={onManageBilling}
          disabled={!isSignedIn || portalLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <CreditCard size={12} />
          {portalLoading ? 'Opening…' : 'Manage Billing'}
          <ExternalLink size={11} className="opacity-60" />
        </button>
        <button
          onClick={onVisitStore}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          <ShoppingBag size={12} />
          Visit Store
        </button>
      </div>
      <p className="text-[11px] text-zinc-600 mt-3">
        Plan changes, payment methods, and invoices are handled in Stripe's secure customer portal.
      </p>
    </section>
  );
}
