import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Calendar, X } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { getEntitlements, subscribeEntitlements } from '@/lib/entitlements';
import { createBillingPortalSession, fetchSubscription } from '@/lib/api';
import { toast } from 'sonner';

const RENEWAL_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

type SubInfo = {
  id: string;
  status: string;
  current_period_end: number | string | null;
  cancel_at_period_end?: boolean | null;
} | null;

function toMillis(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) return null;
  return num > 1e12 ? num : num * 1000;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatAmount(interval: 'month' | 'year' | null | undefined): string | null {
  if (interval === 'month') return '$8.99';
  if (interval === 'year') return '$79';
  return null;
}

export default function RenewalBanner() {
  const isSignedIn = useAppStore((s) => s.isSignedIn);
  const setView = useAppStore((s) => s.setView);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );

  const [subscription, setSubscription] = useState<SubInfo>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !ent.isProUser) {
      setSubscription(null);
      return;
    }
    let cancelled = false;
    fetchSubscription()
      .then((res) => {
        if (!cancelled) setSubscription(res.subscription);
      })
      .catch(() => {
        // Silent: banner just won't render.
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, ent.isProUser]);

  if (!isSignedIn || !ent.isProUser || !subscription) return null;

  const renewMs = toMillis(subscription.current_period_end);
  if (!renewMs) return null;

  const cancelAtEnd = !!subscription.cancel_at_period_end;
  const msUntil = renewMs - Date.now();
  // Show within the final 5-day window for both the renewal heads-up and
  // the cancel-at-period-end expiration warning. We don't want to surface
  // a cancellation notice weeks ahead — it should land when it matters.
  const withinWindow = msUntil > 0 && msUntil <= RENEWAL_WINDOW_MS;

  if (!withinWindow) return null;

  const noticeKey = `${subscription.id}:${subscription.current_period_end}:${cancelAtEnd ? 'cancel' : 'renew'}`;
  if (settings.dismissedRenewalNoticeKey === noticeKey) return null;

  const dismiss = () => {
    updateSettings({ dismissedRenewalNoticeKey: noticeKey });
  };

  const handleResume = async () => {
    setPortalLoading(true);
    try {
      const { url } = await createBillingPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        toast.error('Could not open the billing portal. Please try again.');
      }
    } catch {
      toast.error('Could not open the billing portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };

  const dateLabel = formatDate(renewMs);

  if (cancelAtEnd) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6 p-4 bg-gradient-to-r from-rose-500/10 to-transparent border border-rose-500/30 rounded-lg flex items-start gap-3"
        role="status"
        aria-live="polite"
      >
        <div className="p-2 rounded bg-rose-500/10 text-rose-300 shrink-0">
          <AlertCircle size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 font-medium">
            Your Pro access ends on {dateLabel}.
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            You won't be charged again. Resume your subscription to keep every case and Pro feature unlocked.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResume}
            disabled={portalLoading}
            className="text-xs text-rose-200 hover:text-rose-100 font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {portalLoading ? 'Opening…' : 'Resume Subscription'}
          </button>
          <button
            onClick={dismiss}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </motion.div>
    );
  }

  const amount = formatAmount(ent.subscriptionInterval);
  const intervalLabel =
    ent.subscriptionInterval === 'year' ? 'annually' : ent.subscriptionInterval === 'month' ? 'monthly' : null;
  const amountFragment = amount
    ? ` ${amount}${intervalLabel ? ` ${intervalLabel}` : ''} will be charged to your card on file.`
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6 p-4 bg-gradient-to-r from-cyan-500/10 to-transparent border border-cyan-500/30 rounded-lg flex items-start gap-3"
      role="status"
      aria-live="polite"
    >
      <div className="p-2 rounded bg-cyan-500/10 text-cyan-300 shrink-0">
        <Calendar size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-100 font-medium">
          Your Pro subscription renews on {dateLabel}.
        </div>
        <div className="text-xs text-zinc-400 mt-0.5">
          {amountFragment.trim() || 'Heads up so there are no surprises.'} Manage your plan anytime in Account.
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setView('account')}
          className="text-xs text-cyan-300 hover:text-cyan-200 font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5"
        >
          Manage
          <ArrowRight size={12} />
        </button>
        <button
          onClick={dismiss}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
          aria-label="Dismiss"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
