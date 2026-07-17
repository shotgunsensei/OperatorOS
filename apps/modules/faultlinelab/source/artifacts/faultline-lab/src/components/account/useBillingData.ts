import { useEffect, useState } from 'react';
import {
  fetchBillingHistory,
  fetchSubscription,
  type BillingHistoryEntry,
} from '@/lib/api';
import type { SubscriptionInfo } from './formatters';

export function useBillingData(isSignedIn: boolean) {
  const [subscription, setSubscription] = useState<SubscriptionInfo>(null);
  const [subLoading, setSubLoading] = useState(false);
  const [history, setHistory] = useState<BillingHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    setSubLoading(true);
    fetchSubscription()
      .then((res) => {
        if (!cancelled) setSubscription(res.subscription);
      })
      .catch(() => {
        // Non-fatal: account screen still renders without server-side subscription info.
      })
      .finally(() => {
        if (!cancelled) setSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) {
      setHistory([]);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchBillingHistory()
      .then((res) => {
        if (!cancelled) setHistory(res.history || []);
      })
      .catch(() => {
        if (!cancelled) setHistoryError('Could not load your billing history.');
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  return { subscription, subLoading, history, historyLoading, historyError };
}
