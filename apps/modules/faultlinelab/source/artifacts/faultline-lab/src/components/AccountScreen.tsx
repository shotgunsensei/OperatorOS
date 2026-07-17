import { useState, useSyncExternalStore } from 'react';
import { motion } from 'framer-motion';
import { useClerk } from '@clerk/react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import {
  getCurrentPlanLabel,
  getEntitlements,
  subscribeEntitlements,
} from '@/lib/entitlements';
import { createBillingPortalSession } from '@/lib/api';
import { ProfileCard } from './account/ProfileCard';
import { SubscriptionCard } from './account/SubscriptionCard';
import { BillingHistoryCard } from './account/BillingHistoryCard';
import ManagedByOperatorOS from './ManagedByOperatorOS';
import { LinkedAccountsSection } from './account/LinkedAccountsSection';
import { EmailPreferencesCard } from './account/EmailPreferencesCard';
import { useBillingData } from './account/useBillingData';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkSignOutRow() {
  const { signOut } = useClerk();
  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LogOut size={16} className="text-zinc-400" />
          <div>
            <p className="text-sm text-zinc-200">Sign out</p>
            <p className="text-xs text-zinc-600">Progress will remain saved locally.</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="px-4 py-1.5 rounded text-xs font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </section>
  );
}

export default function AccountScreen() {
  const setView = useAppStore((s) => s.setView);
  const isSignedIn = useAppStore((s) => s.isSignedIn);
  const authUser = useAppStore((s) => s.authUser);
  const profile = useAppStore((s) => s.profile);
  const managedByOperatorOs = useAppStore((s) => s.managedByOperatorOs);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );
  const planLabel = getCurrentPlanLabel();

  const { subscription, subLoading, history, historyLoading, historyError } =
    useBillingData(isSignedIn);

  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManageBilling = async () => {
    setError(null);
    setPortalLoading(true);
    try {
      const { url } = await createBillingPortalSession();
      if (url) {
        window.location.href = url;
      } else {
        setError('Could not open the billing portal. Please try again.');
      }
    } catch (err: any) {
      const msg =
        typeof err?.message === 'string' && err.message.includes('400')
          ? "You don't have any billing history yet. Make a purchase first to manage billing."
          : 'Could not open the billing portal. Please try again.';
      setError(msg);
    } finally {
      setPortalLoading(false);
    }
  };

  const displayName = authUser?.name?.trim() || profile.name || 'Investigator';
  const email = authUser?.email || null;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setView('incident-board')}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
            Account
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 pb-20 sm:pb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {!isSignedIn && (
            <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 p-4">
              <p className="text-sm text-zinc-300 mb-3">
                Sign in to view your account, manage your subscription, and sync progress.
              </p>
              <button
                onClick={() => setView('auth')}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Sign In
              </button>
            </div>
          )}

          <ProfileCard
            displayName={displayName}
            email={email}
            avatarUrl={authUser?.avatarUrl ?? null}
          />

          {managedByOperatorOs ? (
            <ManagedByOperatorOS variant="account" />
          ) : (
            <>
              <SubscriptionCard
                planLabel={planLabel}
                isProUser={ent.isProUser}
                isSignedIn={isSignedIn}
                subscription={subscription}
                subLoading={subLoading}
                portalLoading={portalLoading}
                error={error}
                onManageBilling={handleManageBilling}
                onVisitStore={() => setView('store')}
              />

              {isSignedIn && (
                <BillingHistoryCard
                  history={history}
                  historyLoading={historyLoading}
                  historyError={historyError}
                  portalLoading={portalLoading}
                  onManageBilling={handleManageBilling}
                />
              )}
            </>
          )}

          {isSignedIn && <EmailPreferencesCard />}

          {isSignedIn && <LinkedAccountsSection />}

          {isSignedIn && clerkPubKey && <ClerkSignOutRow />}
        </motion.div>
      </main>
    </div>
  );
}
