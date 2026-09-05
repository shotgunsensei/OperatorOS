'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

type PublicRecord = Record<string, any>;
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function TradeFlowKitPublicDocument({ params }: { params: { documentType: string; token: string } }) {
  const [record, setRecord] = useState<PublicRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentReturn = params.documentType === 'payment' && ['success', 'canceled'].includes(params.token);
  const supported = (
    ['quotes', 'invoices', 'customers', 'leads'].includes(params.documentType)
    && /^[A-Za-z0-9_-]{32,200}$/.test(params.token)
  ) || paymentReturn;

  async function load() {
    if (!supported) { setError('This secure link is invalid.'); setLoading(false); return; }
    if (paymentReturn) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const apiPath = params.documentType === 'leads'
        ? `/api/public/tradeflowkit/leads/capture/${encodeURIComponent(params.token)}`
        : `/api/public/tradeflowkit/${params.documentType}/${encodeURIComponent(params.token)}`;
      const response = await fetch(apiPath, { credentials: 'omit', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This document is unavailable.');
      setRecord(data);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'This document is unavailable.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [params.documentType, params.token]);

  async function respond(responseValue: 'accepted' | 'declined') {
    if (!record) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/public/tradeflowkit/quotes/${encodeURIComponent(params.token)}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ expectedVersion: record.version, response: responseValue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The quote response could not be saved.');
      setRecord({ ...record, status: data.status, version: data.version });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'The quote response could not be saved.'); }
    finally { setPending(false); }
  }

  const title = params.documentType === 'quotes' ? 'Estimate / Quote'
    : params.documentType === 'invoices' ? 'Invoice'
    : params.documentType === 'customers' ? 'Customer Portal'
    : params.documentType === 'leads' ? (record?.name || 'Request Service')
    : params.token === 'success' ? 'Payment received' : 'Payment canceled';
  return <main style={{ ...styles.main, ...publicTheme }} data-testid="tradeflowkit-public-document"><section style={styles.card}>
    <header style={styles.header}><div style={styles.identity}><Image src="/brand/tradeflowkit-logo.png" alt="TradeFlowKit" width={52} height={52} priority /><div><span style={styles.brand}>TradeFlow · secured by OperatorOS</span><h1 style={styles.title}>{title}</h1></div></div><span style={styles.secure}>Secure link</span></header>
    {loading ? <div style={styles.state} aria-busy="true">Loading…</div> : error ? <div style={{ ...styles.state, color: '#991b1b' }} role="alert">{error}</div> : paymentReturn ? <PaymentReturn successful={params.token === 'success'} /> : record && params.documentType === 'leads' ? <LeadCapture form={record} token={params.token} /> : record && params.documentType === 'customers' ? <Portal record={record} /> : record ? <Document record={record} type={params.documentType} pending={pending} respond={respond} /> : null}
    <footer style={styles.footer}>{params.documentType === 'leads' ? 'Your request goes directly to this business. OperatorOS protects the form from abuse and never exposes sign-in details.' : paymentReturn ? 'The payment service confirms payment separately; returning to this page does not mark an invoice paid.' : 'This private link opens one shared document. Do not forward it. It never contains your sign-in password or session.'}</footer>
  </section></main>;
}

function PaymentReturn({ successful }: { successful: boolean }) {
  return <div style={styles.content}><div style={styles.state} role="status">
    <div style={{ fontSize: 42, marginBottom: 10 }}>{successful ? '✓' : '↩'}</div>
    <h2 style={{ margin: '0 0 8px' }}>{successful ? 'Thank you. Your payment was submitted.' : 'No payment was submitted.'}</h2>
    <p style={{ margin: 0 }}>{successful ? 'The invoice will update after Stripe confirms settlement.' : 'You can close this page or return to the invoice link to try again.'}</p>
  </div></div>;
}

function LeadCapture({ form, token }: { form: PublicRecord; token: string }) {
  const [fields, setFields] = useState({ name: '', email: '', phone: '', serviceType: form.defaultService || '', description: '', consentToSms: false, privacyConsent: false, website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (field: string, value: string | boolean) => setFields(current => ({ ...current, [field]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/public/tradeflowkit/leads/capture/${encodeURIComponent(token)}`, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ ...fields, consentVersion: form.consentVersion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your request could not be submitted.');
      setSubmitted(true);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Your request could not be submitted.'); }
    finally { setSubmitting(false); }
  }

  if (submitted) return <div style={styles.content}><div style={styles.state} role="status"><h2 style={{ marginTop: 0 }}>Request received</h2>{form.successMessage}</div></div>;
  return <form style={styles.content} onSubmit={submit} data-testid="tradeflowkit-public-lead-form">
    <p style={{ margin: 0, color: '#587067' }}>Tell us what you need and how to reach you. Fields marked * are required.</p>
    <div style={styles.formGrid}>
      <label style={styles.label}>Name *<input required maxLength={120} autoComplete="name" value={fields.name} onChange={event => update('name', event.target.value)} style={styles.input} /></label>
      <label style={styles.label}>Email<input type="email" maxLength={254} autoComplete="email" value={fields.email} onChange={event => update('email', event.target.value)} style={styles.input} /></label>
      <label style={styles.label}>Phone<input type="tel" maxLength={40} autoComplete="tel" value={fields.phone} onChange={event => update('phone', event.target.value)} style={styles.input} /></label>
      <label style={styles.label}>Service<input maxLength={160} value={fields.serviceType} onChange={event => update('serviceType', event.target.value)} style={styles.input} /></label>
    </div>
    <label style={styles.label}>How can we help?<textarea maxLength={4000} rows={5} value={fields.description} onChange={event => update('description', event.target.value)} style={{ ...styles.input, resize: 'vertical' }} /></label>
    <label style={styles.checkbox}><input type="checkbox" checked={fields.consentToSms} onChange={event => update('consentToSms', event.target.checked)} /> I agree to receive service-related SMS messages. Reply STOP to opt out.</label>
    <label style={styles.checkbox}><input required type="checkbox" checked={fields.privacyConsent} onChange={event => update('privacyConsent', event.target.checked)} /> <span>{form.consentText} <a href={form.privacyNoticeUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tfk-primary-hover)', fontWeight: 700 }}>Privacy notice</a></span></label>
    <label aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}>Website<input tabIndex={-1} autoComplete="off" value={fields.website} onChange={event => update('website', event.target.value)} /></label>
    {error && <div style={{ ...styles.state, padding: 12, color: '#991b1b' }} role="alert">{error}</div>}
    <button disabled={submitting || !fields.privacyConsent} style={{ ...styles.button, background: submitting ? '#789189' : 'var(--tfk-primary)', justifySelf: 'end' }}>{submitting ? 'Submitting…' : 'Submit request'}</button>
  </form>;
}

function Document({ record, type, pending, respond }: { record: PublicRecord; type: string; pending: boolean; respond: (value: 'accepted' | 'declined') => void }) {
  return <div style={styles.content}><div style={styles.summary}><div><span>Document</span><strong>{record.number ? `#${record.number}` : 'Draft'}</strong></div><div><span>Status</span><strong style={{ textTransform: 'capitalize' }}>{String(record.status).replaceAll('_', ' ')}</strong></div><div><span>Total</span><strong>{money(record.totalCents)}</strong></div>{type === 'invoices' && <div><span>Balance</span><strong>{money(record.balanceCents)}</strong></div>}</div>
    <div style={styles.lines}>{(record.lineItems || []).map((item: PublicRecord, index: number) => <div key={index} style={styles.line}><span>{item.description}</span><span>{item.quantity} × {money(item.unitPriceCents)}</span><strong>{money(item.quantity * item.unitPriceCents)}</strong></div>)}</div>
    <div style={styles.totals}><span>Subtotal <strong>{money(record.subtotalCents)}</strong></span><span>Tax <strong>{money(record.taxCents)}</strong></span>{record.discountCents > 0 && <span>Discount <strong>−{money(record.discountCents)}</strong></span>}<span style={{ fontSize: 18 }}>Total <strong>{money(record.totalCents)}</strong></span></div>
    {record.notes && <div style={styles.note}><strong>Notes</strong><p>{record.notes}</p></div>}
    {type === 'quotes' && record.status === 'sent' && <div style={styles.actions}><button disabled={pending} onClick={() => respond('accepted')} style={{ ...styles.button, background: 'var(--tfk-primary-hover)' }}>Accept quote</button><button disabled={pending} onClick={() => respond('declined')} style={{ ...styles.button, background: '#b91c1c' }}>Decline</button></div>}
    {type === 'quotes' && ['accepted','declined','expired'].includes(record.status) && <div style={styles.state}>Response recorded: <strong>{record.status}</strong></div>}
  </div>;
}

function Portal({ record }: { record: PublicRecord }) {
  return <div style={styles.content}><h2 style={{ margin: 0 }}>{record.customer?.name}</h2><PortalList label="Jobs" rows={record.jobs} render={(row: PublicRecord) => `${row.title} · ${String(row.status).replaceAll('_', ' ')}`} /><PortalList label="Quotes" rows={record.quotes} render={(row: PublicRecord) => `Quote ${row.number || ''} · ${money(row.totalCents)} · ${row.status}`} /><PortalList label="Invoices" rows={record.invoices} render={(row: PublicRecord) => `Invoice ${row.number || ''} · ${money(row.balanceCents)} due · ${row.status}`} /></div>;
}

function PortalList({ label, rows, render }: { label: string; rows: PublicRecord[]; render: (row: PublicRecord) => string }) { return <section><h3>{label}</h3>{rows.length === 0 ? <div style={styles.state}>No {label.toLowerCase()} yet.</div> : <div style={styles.lines}>{rows.map(row => <div key={row.id} style={styles.line}><span>{render(row)}</span></div>)}</div>}</section>; }

const publicTheme = {
  '--tfk-primary': 'hsl(25 95% 44%)',
  '--tfk-primary-hover': 'hsl(25 95% 38%)',
  '--tfk-primary-soft': 'hsl(25 95% 95%)',
  '--tfk-card': 'hsl(0 0% 98%)',
  '--tfk-navy': 'hsl(220 45% 14%)',
  '--tfk-muted': 'hsl(215 16% 40%)',
} as React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight:'100vh', background:'linear-gradient(135deg,var(--tfk-primary-soft),hsl(214 25% 96%))', padding:24, color:'var(--tfk-navy)', fontFamily:'"Open Sans Variable",ui-sans-serif,system-ui,sans-serif' },
  card: { maxWidth:820, margin:'0 auto', background:'white', border:'1px solid color-mix(in srgb, var(--tfk-primary) 22%, transparent)', borderRadius:10, boxShadow:'0 24px 70px hsl(220 45% 14% / .12)', overflow:'hidden' },
  header: { display:'flex', justifyContent:'space-between', gap:16, padding:24, borderBottom:'1px solid color-mix(in srgb, var(--tfk-primary) 13%, transparent)', background:'var(--tfk-card)' }, identity:{ display:'flex', alignItems:'center', gap:12 }, brand:{ color:'var(--tfk-primary-hover)', fontSize:11, fontWeight:900, letterSpacing:1, textTransform:'uppercase' }, title:{ margin:'5px 0 0', fontSize:26, color:'var(--tfk-navy)' }, secure:{ height:'fit-content', borderRadius:999, padding:'6px 10px', background:'#dcfce7', color:'#166534', fontSize:12, fontWeight:800 },
  content:{ padding:24, display:'grid', gap:20 }, state:{ padding:24, textAlign:'center', color:'var(--tfk-muted)' }, summary:{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:8 }, lines:{ display:'grid', gap:7 }, line:{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:10, border:'1px solid color-mix(in srgb, var(--tfk-primary) 12%, transparent)', borderRadius:7, padding:11 }, totals:{ display:'grid', gap:6, justifyContent:'end', textAlign:'right' }, note:{ background:'var(--tfk-card)', borderRadius:8, padding:14 }, actions:{ display:'flex', gap:10, justifyContent:'flex-end' }, button:{ border:0, borderRadius:7, minHeight:44, padding:'11px 16px', color:'white', fontWeight:800, cursor:'pointer' }, footer:{ padding:'14px 24px', borderTop:'1px solid color-mix(in srgb, var(--tfk-primary) 10%, transparent)', color:'var(--tfk-muted)', fontSize:11, lineHeight:1.5 },
  formGrid:{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14 }, label:{ display:'grid', gap:6, fontSize:13, fontWeight:800 }, input:{ width:'100%', boxSizing:'border-box', minHeight:42, border:'1px solid color-mix(in srgb, var(--tfk-primary) 25%, transparent)', borderRadius:7, padding:'10px 11px', background:'var(--tfk-card)', color:'var(--tfk-navy)', font:'inherit' }, checkbox:{ display:'flex', alignItems:'flex-start', gap:9, color:'var(--tfk-muted)', fontSize:13, lineHeight:1.5 },
};
