'use client';

import { useEffect, useState } from 'react';

export default function PulseDeskPublicIntake({ params }: { params: { slug: string } }) {
  const [intake, setIntake] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const valid = /^[a-z0-9-]{8,64}$/.test(params.slug);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/pulsedesk-sw.js', { scope: '/public/pulsedesk/' });
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (!valid) { setError('This intake link is invalid.'); return; }
    void fetch(`/api/public/pulsedesk/intake/${params.slug}`, { credentials: 'omit', cache: 'no-store' })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; })
      .then(setIntake)
      .catch(cause => setError(navigator.onLine ? cause.message : 'You are offline. This form remains open and can be submitted after reconnecting.'));
  }, [params.slug, valid]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!navigator.onLine) { setOnline(false); setError('You are offline. Reconnect to submit this operational issue.'); return; }
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch(`/api/public/pulsedesk/intake/${params.slug}`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: data.get('summary'), priority: data.get('priority'), location: data.get('location') }),
      });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error || 'Request could not be submitted.'); return; }
      setMessage(`Request accepted. Reference ${payload.reference}.`);
      form.reset();
    } catch {
      setOnline(navigator.onLine);
      setError('The connection was interrupted. Your form has been preserved; reconnect and submit again.');
    }
  }

  return <main style={s.main}>
    <section style={s.card} data-testid="pulsedesk-public-intake">
      <span style={s.brand}>PulseDesk · healthcare operations</span>
      <h1>Report an operational issue</h1>
      <p>{intake?.notice || 'Loading secure intake…'}</p>
      {!online && <p role="status" style={s.offline}>Offline · the form stays in this tab and submission resumes after reconnect.</p>}
      <aside style={s.warning}>Do not include patient names, medical record numbers, diagnoses, dates of birth, or clinical details.</aside>
      {error && <p role="alert" style={s.error}>{error}</p>}
      {message && <p role="status" style={s.success}>{message}</p>}
      {intake && <form onSubmit={submit} style={s.form}>
        <label>Operational summary<input name="summary" minLength={5} maxLength={160} required placeholder="Imaging room door will not latch" /></label>
        <label>Location<input name="location" maxLength={120} placeholder="Building / floor / room" /></label>
        <label>Urgency<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical operational impact</option><option value="low">Low</option></select></label>
        <button disabled={!online}>{online ? 'Submit issue' : 'Reconnect to submit'}</button>
      </form>}
      <footer>Submissions are rate-limited, tenant-routed, privacy-filtered, and recorded in the operational audit trail.</footer>
    </section>
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', padding: 24, background: 'linear-gradient(145deg,#f4fbff,#dceef8)', fontFamily: 'ui-sans-serif,system-ui', color: '#15364b' },
  card: { maxWidth: 680, margin: '5vh auto', padding: 28, borderRadius: 22, background: '#fff', boxShadow: '0 20px 60px rgba(32,90,120,.15)' },
  brand: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4, color: '#087ca8', fontWeight: 900 },
  warning: { padding: 14, borderRadius: 12, background: '#fff4e5', color: '#7b4711', fontWeight: 700 },
  form: { display: 'grid', gap: 16, margin: '22px 0' },
  error: { padding: 12, background: '#fee2e2', color: '#8b1d1d' },
  success: { padding: 12, background: '#dcfce7', color: '#166534' },
  offline: { padding: 12, background: '#e0f2fe', color: '#075985', fontWeight: 700 },
};
