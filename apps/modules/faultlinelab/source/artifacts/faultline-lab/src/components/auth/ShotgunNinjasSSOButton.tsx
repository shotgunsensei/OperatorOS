import { useSignIn } from '@clerk/react';
import { useState } from 'react';

const FLAG_ENABLED = import.meta.env.VITE_ENABLE_SHOTGUN_NINJAS_SSO === '1';
const STRATEGY =
  (import.meta.env.VITE_SHOTGUN_NINJAS_OIDC_STRATEGY as string | undefined) ||
  'oauth_custom_shotgun_ninjas_id';

export interface ShotgunNinjasSSOButtonProps {
  productSlug: string;
}

export default function ShotgunNinjasSSOButton({ productSlug }: ShotgunNinjasSSOButtonProps) {
  const { signIn, fetchStatus } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!FLAG_ENABLED) return null;

  async function handleClick() {
    if (!signIn) return;
    setError(null);
    setBusy(true);
    try {
      const callbackUrl = `${window.location.origin}/sso-callback`;
      const result = await signIn.sso({
        strategy: STRATEGY as `oauth_custom_${string}`,
        redirectUrl: `${window.location.origin}/`,
        redirectCallbackUrl: callbackUrl,
      });
      if (result?.error) {
        setError(result.error.message ?? 'Sign-in failed');
        setBusy(false);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sign-in failed';
      setError(message);
      setBusy(false);
    }
  }

  const disabled = busy || fetchStatus === 'fetching';

  return (
    <div className="w-full mt-4">
      <div className="relative my-3 flex items-center">
        <div className="flex-grow border-t border-zinc-800" />
        <span className="mx-3 text-xs uppercase tracking-wider text-zinc-500 font-mono">
          or
        </span>
        <div className="flex-grow border-t border-zinc-800" />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="w-full flex items-center justify-center gap-2 rounded-md border border-cyan-700/50 bg-zinc-900/80 px-4 py-2.5 text-sm font-medium text-cyan-300 hover:bg-zinc-800/80 hover:text-cyan-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="button-shotgun-ninjas-sso"
      >
        <span
          aria-hidden
          className="inline-block w-4 h-4 rounded-sm bg-gradient-to-br from-cyan-400 to-emerald-500"
        />
        {busy ? 'Redirecting…' : 'Continue with Shotgun Ninjas'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-400 font-mono" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 text-[11px] text-zinc-500 font-mono text-center">
        Staging proof-of-concept · OIDC via Shotgun Ninjas ID
      </p>
    </div>
  );
}
