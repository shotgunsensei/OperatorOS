'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';

const VALUE = /^[A-Za-z0-9_-]{24,160}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export default function TorqueShedNativeAuthorizePanel() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    return {
      state: query.get('state') ?? '', nonce: query.get('nonce') ?? '',
      codeChallenge: query.get('code_challenge') ?? '', codeChallengeMethod: query.get('code_challenge_method') ?? '',
      deviceId: query.get('device_id') ?? '', deviceName: (query.get('device_name') ?? 'TorqueShed mobile device').slice(0, 120),
      redirectUri: query.get('redirect_uri') ?? '',
    };
  }, []);
  const valid = VALUE.test(request.state) && VALUE.test(request.nonce) && CHALLENGE.test(request.codeChallenge) && request.codeChallengeMethod === 'S256' && VALUE.test(request.deviceId) && request.redirectUri === 'torqueshed://sso';
  const authorize = async () => {
    setBusy(true); setError('');
    try { const result = await moduleShellApi.torqueshed.authorizeNative(request); window.location.assign(result.redirectUri); }
    catch { setError('OperatorOS could not authorize this device. Confirm the tenant entitlement and try again from the TorqueShed app.'); setBusy(false); }
  };
  return <main id="torqueshed-native-authorize" data-testid="torqueshed-native-authorize" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24, colorScheme: 'dark' }}>
    <section style={{ width: 'min(100%,620px)', border: '1px solid #704b18', borderRadius: 20, padding: 28, background: 'linear-gradient(145deg,#2a1a0d,#121518 55%)', color: '#f8fafc', boxShadow: '0 24px 80px rgba(0,0,0,.38)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fbbf24', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 12 }}><Smartphone size={21} /> TorqueShed native access</div>
      <h1 style={{ margin: '18px 0 10px', fontSize: 'clamp(30px,7vw,48px)', lineHeight: 1 }}>Connect this garage device?</h1>
      <p style={{ color: '#a8a29e', lineHeight: 1.65 }}>This grants the TorqueShed iOS or Android app an opaque, device-bound session for the current OperatorOS tenant. It cannot access another module or tenant.</p>
      <div style={{ margin: '20px 0', padding: 16, border: '1px solid #374151', borderRadius: 12, background: '#111315', display: 'grid', gap: 8 }}>
        <strong>{request.deviceName || 'TorqueShed mobile device'}</strong>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>PKCE S256 · rotating access · revocable refresh · secure-storage client</span>
        <span style={{ color: '#9ca3af', fontSize: 13 }}>Module: TorqueShed · tenant and entitlement checked now and on refresh</span>
      </div>
      {!valid && <p role="alert" style={{ color: '#fca5a5' }}>This authorization request is incomplete or invalid. Return to the native app and start again.</p>}
      {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
      <button type="button" disabled={!valid || busy} onClick={() => void authorize()} style={{ width: '100%', minHeight: 50, border: 0, borderRadius: 12, background: '#f59e0b', color: '#18130a', fontWeight: 900, cursor: valid ? 'pointer' : 'not-allowed', opacity: !valid || busy ? .55 : 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}><ShieldCheck size={19} />{busy ? 'Authorizing…' : 'Authorize this device'}</button>
      <p style={{ color: '#787f86', fontSize: 12, marginBottom: 0 }}>No password, JWT, state proof, or provider credential is returned to the app URL. The one-use code expires in 60 seconds.</p>
    </section>
  </main>;
}
