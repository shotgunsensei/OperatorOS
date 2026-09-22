'use client';
import { useCallback, useEffect, useState } from 'react';
import { authApi, type AccountSession } from '@/lib/auth';

export default function AccountSessions() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setSessions((await authApi.sessions()).sessions); }
    catch { setSessions([]); setError('We could not load your signed-in browsers. Try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function revoke(id: string) {
    setPending(id); setError('');
    try { await authApi.revokeSession(id); await load(); }
    catch { setError('We could not sign out that browser. Try again.'); }
    finally { setPending(null); }
  }
  return <div data-testid="account-sessions" style={{ marginBottom: 18 }}>
    <p style={{ color: '#b9c7d8', fontSize: 13, lineHeight: 1.6 }}>Browsers appear here after using your account. Each app may have its own session. Use “Sign out everywhere” to include older sessions and other devices.</p>
    {loading ? <p role="status">Loading signed-in browsers…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()}>Try again</button></div> : <ul style={{ listStyle: 'none', padding: 0 }}>
      {sessions.map(session => <li key={session.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #435269' }}>
        <div><strong>{session.deviceLabel}{session.current ? ' · This browser' : ''}</strong>
          <div style={{ fontSize: 13, color: '#b9c7d8', marginTop: 5 }}>{session.moduleSlug || 'OperatorOS'} · Last used {new Date(session.lastSeenAt).toLocaleString()}</div>
        </div>
        {!session.current && <button type="button" disabled={pending !== null} onClick={() => void revoke(session.id)} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 7, background: '#223b57', color: '#fff', border: '1px solid #62758b', cursor: 'pointer' }}>
          {pending === session.id ? 'Signing out…' : 'Sign out this browser'}
        </button>}
      </li>)}
      {!sessions.length && <li>No active browsers are listed.</li>}
    </ul>}
  </div>;
}
