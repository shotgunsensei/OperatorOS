'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BriefcaseBusiness, FileText, Plus, Receipt, Users, type LucideIcon } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitCustomer,
  type TradeFlowKitInvoice,
  type TradeFlowKitJob,
  type TradeFlowKitQuote,
  type TradeFlowKitRevenueResponse,
} from '@/lib/auth';

const c = { ink: '#10231d', muted: '#587067', panel: '#fff', soft: '#eef8f2', border: 'rgba(22,101,52,.18)', green: '#059669', blue: '#0284c7', red: '#dc2626', gold: '#b7791f' };
const empty: TradeFlowKitRevenueResponse = { customers: [], jobs: [], quotes: [], invoices: [] };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function TradeFlowKitRevenueFlow({ tenantKey }: { tenantKey: string }) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobId, setJobId] = useState('');
  const [lineDescription, setLineDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0.00');
  const [taxRate, setTaxRate] = useState('0');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const next = await moduleShellApi.tradeflowkit.revenue();
      setData(next);
      setCustomerId((current) => current || next.customers[0]?.id || '');
    } catch (err: any) {
      setError(err?.error || err?.message || 'Unable to load revenue workflow');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, tenantKey]);

  const customerById = useMemo(() => new Map(data.customers.map((row) => [row.id, row])), [data.customers]);
  const jobById = useMemo(() => new Map(data.jobs.map((row) => [row.id, row])), [data.jobs]);
  const invoiceQuoteIds = useMemo(() => new Set(data.invoices.map((row) => row.sourceQuoteId).filter(Boolean)), [data.invoices]);
  const jobsForCustomer = data.jobs.filter((row) => row.customerId === customerId);

  async function run(operation: () => Promise<unknown>) {
    setPending(true); setError(null);
    try { await operation(); await load(); }
    catch (err: any) { setError(err?.error || err?.message || 'Revenue workflow action failed'); }
    finally { setPending(false); }
  }

  function createCustomer(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const created = await moduleShellApi.tradeflowkit.createCustomer({ name: customerName, email: customerEmail || undefined });
      setCustomerName(''); setCustomerEmail(''); setCustomerId(created.id);
    });
  }

  function createJob(event: FormEvent) {
    event.preventDefault();
    if (!customerId) return;
    void run(async () => {
      const created = await moduleShellApi.tradeflowkit.createJob({ customerId, title: jobTitle });
      setJobTitle(''); setJobId(created.id);
    });
  }

  function createQuote(event: FormEvent) {
    event.preventDefault();
    const unitPriceCents = Math.round(Number(unitPrice) * 100);
    const taxRateBps = Math.round(Number(taxRate) * 100);
    if (!customerId || !Number.isFinite(unitPriceCents) || !Number.isFinite(taxRateBps)) return;
    void run(async () => {
      await moduleShellApi.tradeflowkit.createQuote({
        customerId, jobId: jobId || undefined, taxRateBps,
        lineItems: [{ description: lineDescription, quantity: Number(quantity), unitPriceCents }],
      });
      setLineDescription(''); setQuantity('1'); setUnitPrice('0.00');
    });
  }

  const panel: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 10, background: c.panel, padding: 16 };
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, padding: '9px 10px', background: '#fbfefc', color: c.ink };
  const button = (tone = c.green): React.CSSProperties => ({ border: 0, borderRadius: 7, padding: '9px 12px', background: tone, color: '#fff', fontWeight: 800, cursor: pending ? 'wait' : 'pointer', opacity: pending ? .6 : 1 });

  return (
    <section id="tradeflowkit-revenue-flow" data-testid="tradeflowkit-revenue-flow" style={{ ...panel, marginTop: 18, background: 'linear-gradient(135deg,#fff,#f3fbf6)' }} tabIndex={-1}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><div style={{ color: c.green, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Native revenue workflow</div><h2 style={{ margin: '4px 0 0', color: c.ink, fontSize: 20 }}>Customer → job → quote → invoice → payment</h2><p style={{ color: c.muted, margin: '6px 0 0', fontSize: 13 }}>Customer payments stay distinct from OperatorOS subscription billing.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Stat Icon={Users} label="Customers" value={data.customers.length} /><Stat Icon={BriefcaseBusiness} label="Jobs" value={data.jobs.length} /><Stat Icon={FileText} label="Quotes" value={data.quotes.length} /><Stat Icon={Receipt} label="Invoices" value={data.invoices.length} /></div>
      </div>

      {error && <div role="alert" style={{ marginTop: 12, padding: 10, borderRadius: 7, color: c.red, background: '#fff1f2', display: 'flex', gap: 8 }}><AlertTriangle size={16} />{error}</div>}
      {loading ? <div style={{ color: c.muted, padding: '18px 0' }}>Loading revenue records…</div> : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <form onSubmit={createCustomer} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>1. Customer</strong><input required maxLength={160} placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={input} /><input type="email" placeholder="Email (optional)" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={input} /><button disabled={pending || customerName.trim().length < 2} style={button()}><Plus size={14} /> Add customer</button></form>
            <form onSubmit={createJob} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>2. Job</strong><select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} style={input}><option value="">Select customer</option>{data.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input required maxLength={200} placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={input} /><button disabled={pending || !customerId || jobTitle.trim().length < 2} style={button(c.blue)}><Plus size={14} /> Add job</button></form>
            <form onSubmit={createQuote} style={{ ...panel, flex: '2 1 340px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>3. Quote</strong><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} style={{ ...input, flex: '1 1 140px' }}><option value="">Customer</option>{data.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ ...input, flex: '1 1 140px' }}><option value="">No linked job</option>{jobsForCustomer.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select></div><input required maxLength={500} placeholder="Line-item description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} style={input} /><div style={{ display: 'flex', gap: 8 }}><input aria-label="Quantity" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={input} /><input aria-label="Unit price dollars" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={input} /><input aria-label="Tax percent" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={input} /></div><button disabled={pending || !customerId || !lineDescription.trim()} style={button(c.gold)}><Plus size={14} /> Create quote</button></form>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {data.quotes.length === 0 && data.invoices.length === 0 ? <div style={{ color: c.muted, textAlign: 'center', padding: 18, background: c.soft, borderRadius: 8 }}>No quotes or invoices yet. Build the first customer revenue flow above.</div> : null}
            {data.quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} customer={customerById.get(quote.customerId)} job={quote.jobId ? jobById.get(quote.jobId) : undefined} hasInvoice={invoiceQuoteIds.has(quote.id)} pending={pending} run={run} />)}
            {data.invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} customer={customerById.get(invoice.customerId)} pending={pending} run={run} />)}
          </div>
        </>
      )}
    </section>
  );
}

function QuoteRow({ quote, customer, job, hasInvoice, pending, run }: { quote: TradeFlowKitQuote; customer?: TradeFlowKitCustomer; job?: TradeFlowKitJob; hasInvoice: boolean; pending: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  return <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong style={{ color: c.ink }}>Quote · {customer?.name ?? 'Customer'}</strong><div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{job?.title ?? 'Unlinked quote'} · {money(quote.totalCents)} · <b>{quote.status}</b> · v{quote.version}</div></div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{quote.status === 'draft' && <Action disabled={pending} label="Send" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'sent'))} />}{quote.status === 'sent' && <><Action disabled={pending} label="Accept" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'accepted'))} /><Action disabled={pending} label="Decline" tone={c.red} onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'declined'))} /></>}{quote.status === 'accepted' && !hasInvoice && <Action disabled={pending} label="Create invoice" tone={c.gold} onClick={() => void run(() => moduleShellApi.tradeflowkit.invoiceQuote(quote.id, quote.version))} />}{hasInvoice && <span style={{ color: c.green, fontWeight: 800, fontSize: 12 }}>Invoiced</span>}</div></div>;
}

function InvoiceRow({ invoice, customer, pending, run }: { invoice: TradeFlowKitInvoice; customer?: TradeFlowKitCustomer; pending: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  return <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, background: '#f8fcfa', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong style={{ color: c.ink }}>Invoice · {customer?.name ?? 'Customer'}</strong><div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{money(invoice.totalCents)} · <b>{invoice.status}</b> · v{invoice.version}{invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}</div></div><div style={{ display: 'flex', gap: 7 }}>{invoice.status === 'draft' && <Action disabled={pending} label="Send invoice" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionInvoice(invoice.id, invoice.version, 'sent'))} />}{['sent', 'processing'].includes(invoice.status) && <Action disabled={pending} label="Record payment" tone={c.green} onClick={() => { const ref = window.prompt('Payment reference (optional)') || undefined; void run(() => moduleShellApi.tradeflowkit.payInvoice(invoice.id, invoice.version, 'other', ref)); }} />}{invoice.status === 'paid' && <span style={{ color: c.green, fontWeight: 900 }}>Paid</span>}</div></div>;
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) { return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: c.soft, color: c.ink, fontSize: 12 }}><Icon size={14} />{value} {label}</span>; }
function Action({ label, onClick, tone = c.blue, disabled }: { label: string; onClick: () => void; tone?: string; disabled: boolean }) { return <button disabled={disabled} onClick={onClick} style={{ border: 0, borderRadius: 6, padding: '7px 10px', background: tone, color: '#fff', fontWeight: 800, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .6 : 1 }}>{label}</button>; }
