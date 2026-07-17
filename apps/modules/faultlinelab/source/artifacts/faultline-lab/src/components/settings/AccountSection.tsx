import { Crown, ShieldCheck, LogOut } from 'lucide-react';
import { useClerk } from '@clerk/react';
import { useAppStore } from '@/stores/useAppStore';
import {
  getCurrentPlanLabel,
  getEntitlements,
  subscribeEntitlements,
} from '@/lib/entitlements';
import { useSyncExternalStore } from 'react';
import { SettingsRow } from './SettingsRow';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkSignOutButton() {
  const { signOut } = useClerk();
  return (
    <button
      onClick={() => signOut()}
      className="px-4 py-1.5 rounded text-xs font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      Sign Out
    </button>
  );
}

export function AccountSection() {
  const setView = useAppStore(s => s.setView);
  const isSignedIn = useAppStore(s => s.isSignedIn);
  const ent = useSyncExternalStore(
    (cb) => subscribeEntitlements(cb),
    () => getEntitlements()
  );
  const planLabel = getCurrentPlanLabel();

  return (
    <>
      <SettingsRow
        icon={<Crown size={16} className={ent.isProUser ? 'text-amber-400' : 'text-zinc-500'} />}
        title="Current plan"
        description={planLabel}
        action={
          <button
            onClick={() => setView('store')}
            className="px-3 py-1.5 rounded text-xs font-mono uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          >
            {ent.isProUser ? 'Manage' : 'Upgrade'}
          </button>
        }
      />

      {ent.isAdmin && (
        <SettingsRow
          icon={<ShieldCheck size={16} className="text-emerald-400" />}
          title="Admin tools"
          description="Catalog management & user entitlements"
          action={
            <button
              onClick={() => setView('admin')}
              className="px-3 py-1.5 rounded text-xs font-mono uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              Open
            </button>
          }
        />
      )}

      {isSignedIn && clerkPubKey && (
        <SettingsRow
          className="mt-6"
          icon={<LogOut size={16} className="text-zinc-400" />}
          title="Sign Out"
          description="Progress will be saved locally"
          action={<ClerkSignOutButton />}
        />
      )}
    </>
  );
}
