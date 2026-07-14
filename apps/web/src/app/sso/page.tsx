'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OperatorLoader from '@/components/brand/OperatorLoader';
import { brand } from '@/lib/brand';

type ExchangeResponse = {
  ok?: boolean;
  returnTo?: string;
  error?: string;
  code?: string;
};

export default function SsoCallbackPage() {
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setError('This authorization callback is incomplete. Start the module launch again.');
      return;
    }

    void fetch('/api/sso/browser-exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as ExchangeResponse;
      if (!response.ok || !payload.ok || !payload.returnTo) {
        throw new Error(payload.error || 'OperatorOS could not establish the module session.');
      }

      // Remove the one-time code before navigating into the authenticated
      // module surface. The server has already atomically consumed it.
      window.history.replaceState({}, '', '/sso');
      window.location.replace(payload.returnTo);
    }).catch((reason: unknown) => {
      window.history.replaceState({}, '', '/sso');
      setError(reason instanceof Error ? reason.message : 'OperatorOS could not establish the module session.');
    });
  }, [params]);

  if (!error) {
    return (
      <main style={{ minHeight: '100vh', background: brand.bgPrimary, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', color: brand.textSecondary }}>
          <OperatorLoader />
          <p>Establishing your secure OperatorOS session…</p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: brand.bgPrimary, display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ width: 'min(560px, 100%)', padding: 28, borderRadius: 16, background: brand.bgSecondary, border: `1px solid ${brand.borderSoft}` }}>
        <p style={{ margin: '0 0 8px', color: brand.accentRed, fontWeight: 700, letterSpacing: '0.04em' }}>AUTHORIZATION FAILED</p>
        <h1 style={{ margin: '0 0 12px', color: brand.textPrimary }}>Module session was not established</h1>
        <p style={{ color: brand.textSecondary, lineHeight: 1.6 }}>{error}</p>
        <button
          type="button"
          onClick={() => window.location.replace('/')}
          style={{ border: 0, borderRadius: 10, padding: '11px 16px', background: brand.accentCyan, color: brand.accentInk, cursor: 'pointer', fontWeight: 700 }}
        >
          Restart module launch
        </button>
      </section>
    </main>
  );
}
