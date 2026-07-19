'use client';

import React, { useEffect, useState } from 'react';

type PublicRecord = Record<string, any>;
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function TradeFlowKitPublicDocument({ params }: { params: { documentType: string; token: string } }) {
  const [record, setRecord] = useState<PublicRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = ['quotes', 'invoices', 'customers'].includes(params.documentType) && /^[A-Za-z0-9_-]{32,64}$/.test(params.token);

  async function load() {
    if (!supported) { setError('This document link is invalid.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/public/tradeflowkit/${params.documentType}/${encodeURIComponent(params.token)}`, { credentials: 'omit', cache: 'no-store' });
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

  return <main style={styles.main} data-testid="tradeflowkit-public-document"><section style={styles.card}>
    <header style={styles.header}><div><span style={styles.brand}>OperatorOS · TradeFlowKit</span><h1 style={styles.title}>{params.documentType === 'quotes' ? 'Estimate / Quote' : params.documentType === 'invoices' ? 'Invoice' : 'Customer Portal'}</h1></div><span style={styles.secure}>Secure link</span></header>
    {loading ? <div style={styles.state} aria-busy="true">Loading your document…</div> : error ? <div style={{ ...styles.state, color: '#991b1b' }} role="alert">{error}</div> : record && params.documentType === 'customers' ? <Portal record={record} /> : record ? <Document record={record} type={params.documentType} pending={pending} respond={respond} /> : null}
    <footer style={styles.footer}>This link contains an opaque access token. Do not forward it. OperatorOS never places a login credential or bearer token in this URL.</footer>
  </section></main>;
}

function Document({ record, type, pending, respond }: { record: PublicRecord; type: string; pending: boolean; respond: (value: 'accepted' | 'declined') => void }) {
  return <div style={styles.content}><div style={styles.summary}><div><span>Document</span><strong>{record.number ? `#${record.number}` : 'Draft'}</strong></div><div><span>Status</span><strong style={{ textTransform: 'capitalize' }}>{String(record.status).replaceAll('_', ' ')}</strong></div><div><span>Total</span><strong>{money(record.totalCents)}</strong></div>{type === 'invoices' && <div><span>Balance</span><strong>{money(record.balanceCents)}</strong></div>}</div>
    <div style={styles.lines}>{(record.lineItems || []).map((item: PublicRecord, index: number) => <div key={index} style={styles.line}><span>{item.description}</span><span>{item.quantity} × {money(item.unitPriceCents)}</span><strong>{money(item.quantity * item.unitPriceCents)}</strong></div>)}</div>
    <div style={styles.totals}><span>Subtotal <strong>{money(record.subtotalCents)}</strong></span><span>Tax <strong>{money(record.taxCents)}</strong></span>{record.discountCents > 0 && <span>Discount <strong>−{money(record.discountCents)}</strong></span>}<span style={{ fontSize: 18 }}>Total <strong>{money(record.totalCents)}</strong></span></div>
    {record.notes && <div style={styles.note}><strong>Notes</strong><p>{record.notes}</p></div>}
    {type === 'quotes' && record.status === 'sent' && <div style={styles.actions}><button disabled={pending} onClick={() => respond('accepted')} style={{ ...styles.button, background: '#047857' }}>Accept quote</button><button disabled={pending} onClick={() => respond('declined')} style={{ ...styles.button, background: '#b91c1c' }}>Decline</button></div>}
    {type === 'quotes' && ['accepted','declined','expired'].includes(record.status) && <div style={styles.state}>Response recorded: <strong>{record.status}</strong></div>}
  </div>;
}

function Portal({ record }: { record: PublicRecord }) {
  return <div style={styles.content}><h2 style={{ margin: 0 }}>{record.customer?.name}</h2><PortalList label="Jobs" rows={record.jobs} render={(row: PublicRecord) => `${row.title} · ${String(row.status).replaceAll('_', ' ')}`} /><PortalList label="Quotes" rows={record.quotes} render={(row: PublicRecord) => `Quote ${row.number || ''} · ${money(row.totalCents)} · ${row.status}`} /><PortalList label="Invoices" rows={record.invoices} render={(row: PublicRecord) => `Invoice ${row.number || ''} · ${money(row.balanceCents)} due · ${row.status}`} /></div>;
}

function PortalList({ label, rows, render }: { label: string; rows: PublicRecord[]; render: (row: PublicRecord) => string }) { return <section><h3>{label}</h3>{rows.length === 0 ? <div style={styles.state}>No {label.toLowerCase()} yet.</div> : <div style={styles.lines}>{rows.map(row => <div key={row.id} style={styles.line}><span>{render(row)}</span></div>)}</div>}</section>; }

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight:'100vh', background:'linear-gradient(135deg,#ecfdf5,#f8fafc)', padding:24, color:'#10231d', fontFamily:'system-ui,sans-serif' },
  card: { maxWidth:820, margin:'0 auto', background:'white', border:'1px solid rgba(5,150,105,.22)', borderRadius:14, boxShadow:'0 24px 70px rgba(17,76,57,.12)', overflow:'hidden' },
  header: { display:'flex', justifyContent:'space-between', gap:16, padding:24, borderBottom:'1px solid rgba(22,101,52,.13)', background:'#f6fbf8' }, brand:{ color:'#047857', fontSize:11, fontWeight:900, letterSpacing:1, textTransform:'uppercase' }, title:{ margin:'5px 0 0', fontSize:26 }, secure:{ height:'fit-content', borderRadius:999, padding:'6px 10px', background:'#dcfce7', color:'#166534', fontSize:12, fontWeight:800 },
  content:{ padding:24, display:'grid', gap:20 }, state:{ padding:24, textAlign:'center', color:'#587067' }, summary:{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:8 }, lines:{ display:'grid', gap:7 }, line:{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', gap:10, border:'1px solid rgba(22,101,52,.12)', borderRadius:7, padding:11 }, totals:{ display:'grid', gap:6, justifyContent:'end', textAlign:'right' }, note:{ background:'#f8fafc', borderRadius:8, padding:14 }, actions:{ display:'flex', gap:10, justifyContent:'flex-end' }, button:{ border:0, borderRadius:7, padding:'11px 16px', color:'white', fontWeight:800, cursor:'pointer' }, footer:{ padding:'14px 24px', borderTop:'1px solid rgba(22,101,52,.1)', color:'#789189', fontSize:11, lineHeight:1.5 },
};
