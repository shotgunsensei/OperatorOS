import { useEffect, useState } from 'react';
import { useClerk } from '@clerk/react';
import { toast } from 'sonner';
import { AlertCircle, Link2, Link2Off } from 'lucide-react';
import {
  fetchLinkedIdentities,
  fetchMe,
  linkClerkAccount,
  unlinkAccountIdentity,
  type LinkedIdentities,
} from '@/lib/api';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkConfigured = !!clerkPubKey;

export function LinkedAccountsSection() {
  const { openSignIn } = useClerk();
  const [identities, setIdentities] = useState<LinkedIdentities | null>(null);
  const [authSource, setAuthSource] = useState<'clerk' | 'operatoros' | 'unknown'>(
    'unknown'
  );
  const [busy, setBusy] = useState<null | 'link-clerk' | 'unlink-clerk' | 'unlink-operatoros'>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLinkedIdentities(), fetchMe()])
      .then(([res, me]) => {
        if (cancelled) return;
        setIdentities(res);
        const src = me.kind === 'session' ? me.user.authSource : null;
        setAuthSource(src === 'clerk' || src === 'operatoros' ? src : 'unknown');
      })
      .catch(() => {
        // Non-fatal — section just won't render.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!identities) return null;

  const clerkLinked = identities.clerk.linked;
  const operatorLinked = identities.operatoros.linked;

  const handleLinkClerk = async () => {
    setError(null);
    if (!clerkConfigured) {
      setError('Clerk sign-in is not available in this build.');
      return;
    }
    setBusy('link-clerk');
    try {
      // Open the Clerk modal so the user can authenticate. We don't await
      // the modal directly; instead we poll the identities endpoint once
      // they close it. To keep this simple, we let the user sign in, then
      // call the link endpoint when they close the modal.
      openSignIn();
      // Poll a few times to give Clerk time to attach its session cookie.
      const start = Date.now();
      let result: Awaited<ReturnType<typeof linkClerkAccount>> | null = null;
      while (Date.now() - start < 60_000) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          result = await linkClerkAccount();
          if (result.success) break;
        } catch (err: any) {
          const msg = String(err?.message ?? '');
          // 400 no_clerk_session means the user hasn't completed sign-in yet.
          if (!msg.includes('400')) throw err;
        }
      }
      if (result?.success) {
        setIdentities(result.identities);
        toast.success(
          result.alreadyLinked
            ? 'Clerk login already linked to this account.'
            : 'Clerk login linked. Your accounts are now unified.'
        );
      } else {
        setError('Linking timed out. Sign in with Clerk, then try again.');
      }
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('409')) {
        setError(
          'This account is already linked to a different Clerk login. Unlink it first.'
        );
      } else {
        setError('Could not link the Clerk login. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleUnlink = async (identity: 'clerk' | 'operatoros') => {
    setError(null);
    setBusy(identity === 'clerk' ? 'unlink-clerk' : 'unlink-operatoros');
    try {
      const res = await unlinkAccountIdentity(identity);
      setIdentities(res.identities);
      toast.success(
        identity === 'clerk'
          ? 'Clerk login unlinked. Progress and purchases stay on this account.'
          : 'OperatorOS unlinked. Progress and purchases stay on this account.'
      );
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      if (msg.includes('400')) {
        setError(
          identity === 'clerk'
            ? "You're signed in with Clerk right now. Sign in with OperatorOS first, then unlink."
            : "You're signed in with OperatorOS right now. Sign in with Clerk first, then unlink."
        );
      } else {
        setError('Could not unlink. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111822] p-4 sm:p-5">
      <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-4">
        Linked Sign-In Methods
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        Link both methods to keep one unified account with shared progress, subscription, and purchases.
      </p>

      {error && (
        <div className="flex items-start gap-2 mb-3 p-2.5 rounded border border-red-500/30 bg-red-500/10">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded border border-zinc-800/60 bg-zinc-900/40">
          <div className="min-w-0">
            <p className="text-sm text-zinc-200 flex items-center gap-2">
              Clerk login
              {authSource === 'clerk' && (
                <span className="text-[10px] font-mono uppercase text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5">
                  current
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {clerkLinked ? 'Linked.' : 'Not linked to this account.'}
            </p>
          </div>
          {clerkLinked ? (
            <button
              onClick={() => handleUnlink('clerk')}
              disabled={busy !== null || authSource === 'clerk'}
              title={
                authSource === 'clerk'
                  ? "You're signed in with Clerk right now."
                  : undefined
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Link2Off size={12} />
              {busy === 'unlink-clerk' ? 'Unlinking…' : 'Unlink'}
            </button>
          ) : (
            <button
              onClick={handleLinkClerk}
              disabled={busy !== null || !clerkConfigured}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Link2 size={12} />
              {busy === 'link-clerk' ? 'Waiting for Clerk…' : 'Link Clerk'}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-3 rounded border border-zinc-800/60 bg-zinc-900/40">
          <div className="min-w-0">
            <p className="text-sm text-zinc-200 flex items-center gap-2">
              OperatorOS
              {authSource === 'operatoros' && (
                <span className="text-[10px] font-mono uppercase text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5">
                  current
                </span>
              )}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {operatorLinked
                ? 'Linked. Launch from OperatorOS to use this method.'
                : 'Not linked. Launch Faultline Lab from OperatorOS while signed in here to link.'}
            </p>
          </div>
          {operatorLinked && (
            <button
              onClick={() => handleUnlink('operatoros')}
              disabled={busy !== null || authSource === 'operatoros'}
              title={
                authSource === 'operatoros'
                  ? "You're signed in with OperatorOS right now."
                  : undefined
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Link2Off size={12} />
              {busy === 'unlink-operatoros' ? 'Unlinking…' : 'Unlink'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
