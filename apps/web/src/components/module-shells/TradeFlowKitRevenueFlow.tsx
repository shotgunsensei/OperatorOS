'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, BriefcaseBusiness, FileText, FileUp, Pencil, Plus, Receipt, Trash2, Users, X, type LucideIcon } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitCustomer,
  type TradeFlowKitCustomerImportResult,
  type TradeFlowKitCustomerImportRow,
  type TradeFlowKitInvoice,
  type TradeFlowKitJob,
  type TradeFlowKitLineItem,
  type TradeFlowKitQuote,
  type TradeFlowKitRevenueResponse,
} from '@/lib/auth';

const c = { ink: '#10231d', muted: '#587067', panel: '#fff', soft: '#eef8f2', border: 'rgba(22,101,52,.18)', green: '#059669', blue: '#0284c7', red: '#dc2626', gold: '#b7791f' };
const empty: TradeFlowKitRevenueResponse = { customers: [], jobs: [], quotes: [], invoices: [] };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const customerImportColumns = ['name', 'email', 'phone', 'address', 'notes'] as const;

function parseCustomerCsv(value: string): TradeFlowKitCustomerImportRow[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { record.push(field); field = ''; }
    else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      if (record.some(cell => cell.trim())) records.push(record);
      record = []; field = '';
    } else field += character;
  }
  if (quoted) throw new Error('The CSV contains an unterminated quoted field.');
  record.push(field.replace(/\r$/, ''));
  if (record.some(cell => cell.trim())) records.push(record);
  if (records.length < 2) throw new Error('The CSV needs a header and at least one customer row.');

  const headers = records[0].map(header => header.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('en-US'));
  if (!headers.includes('name')) throw new Error('The CSV header must include name.');
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column headers.');
  const allowed = new Set<string>(customerImportColumns);
  const unknown = headers.filter(header => !allowed.has(header));
  if (unknown.length > 0) throw new Error(`Unsupported CSV column: ${unknown[0]}.`);
  if (records.length - 1 > 100) throw new Error('Customer imports are limited to 100 rows.');

  return records.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length && cells.slice(headers.length).some(cell => cell.trim())) {
      throw new Error(`CSV row ${rowIndex + 2} contains data outside the declared columns.`);
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = (cells[index] ?? '').trim(); });
    return {
      name: row.name,
      ...(row.email ? { email: row.email } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.address ? { address: row.address } : {}),
      ...(row.notes ? { notes: row.notes } : {}),
    };
  });
}

export default function TradeFlowKitRevenueFlow({ tenantKey, canManage }: { tenantKey: string; canManage: boolean }) {
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
  const [documentKind, setDocumentKind] = useState<'quote' | 'invoice'>('quote');
  const [documentNotes, setDocumentNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customerImportRows, setCustomerImportRows] = useState<TradeFlowKitCustomerImportRow[]>([]);
  const [customerImportName, setCustomerImportName] = useState('');
  const [customerImportKey, setCustomerImportKey] = useState('');
  const [customerImportError, setCustomerImportError] = useState<string | null>(null);
  const [customerImportResult, setCustomerImportResult] = useState<TradeFlowKitCustomerImportResult | null>(null);

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

  async function selectCustomerImport(file?: File) {
    setCustomerImportRows([]);
    setCustomerImportName('');
    setCustomerImportKey('');
    setCustomerImportError(null);
    setCustomerImportResult(null);
    if (!file) return;
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) {
      setCustomerImportError('Select a .csv file.');
      return;
    }
    if (file.size > 256 * 1024) {
      setCustomerImportError('Customer CSV files are limited to 256 KB.');
      return;
    }
    try {
      const rows = parseCustomerCsv(await file.text());
      setCustomerImportRows(rows);
      setCustomerImportName(file.name);
      setCustomerImportKey(`customer-import:${crypto.randomUUID()}`);
    } catch (nextError) {
      setCustomerImportError(nextError instanceof Error ? nextError.message : 'Unable to parse the CSV.');
    }
  }

  function importCustomers(event: FormEvent) {
    event.preventDefault();
    if (customerImportRows.length === 0 || !customerImportKey) return;
    void run(async () => {
      const result = await moduleShellApi.tradeflowkit.importCustomers(customerImportRows, customerImportKey);
      setCustomerImportResult(result);
      setCustomerImportRows([]);
      setCustomerImportName('');
      setCustomerImportKey('');
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

  function createDocument(event: FormEvent) {
    event.preventDefault();
    const unitPriceCents = Math.round(Number(unitPrice) * 100);
    const taxRateBps = Math.round(Number(taxRate) * 100);
    if (!customerId || !Number.isFinite(unitPriceCents) || !Number.isFinite(taxRateBps)) return;
    void run(async () => {
      const document = {
        customerId, jobId: jobId || undefined, taxRateBps, notes: documentNotes || undefined,
        lineItems: [{ description: lineDescription, quantity: Number(quantity), unitPriceCents }],
      };
      if (documentKind === 'quote') await moduleShellApi.tradeflowkit.createQuote(document);
      else await moduleShellApi.tradeflowkit.createInvoice({ ...document, dueDate: dueDate || undefined });
      setLineDescription(''); setQuantity('1'); setUnitPrice('0.00'); setDocumentNotes(''); setDueDate('');
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
          {canManage ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <form onSubmit={createCustomer} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>1. Customer</strong><input required maxLength={160} placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={input} /><input type="email" placeholder="Email (optional)" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={input} /><button disabled={pending || customerName.trim().length < 2} style={button()}><Plus size={14} /> Add customer</button></form>
            <form onSubmit={importCustomers} data-testid="tradeflowkit-customer-import" style={{ ...panel, flex: '1 1 240px', display: 'grid', gap: 8 }}>
              <strong style={{ color: c.ink }}>Import customers</strong>
              <span style={{ color: c.muted, fontSize: 12 }}>CSV columns: name, email, phone, address, notes. Maximum 100 rows and 256 KB.</span>
              <label style={{ ...input, position: 'relative', overflow: 'hidden', display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer' }}><FileUp size={15} /><span>{customerImportName || 'Choose CSV'}</span><input aria-label="Customer CSV file" type="file" accept=".csv,text/csv" onChange={(event) => void selectCustomerImport(event.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
              {customerImportRows.length > 0 && <span style={{ color: c.green, fontSize: 12, fontWeight: 800 }}>{customerImportRows.length} rows ready for server validation.</span>}
              {customerImportError && <span role="alert" style={{ color: c.red, fontSize: 12 }}>{customerImportError}</span>}
              {customerImportResult && <div data-testid="tradeflowkit-customer-import-result" style={{ color: c.ink, fontSize: 12 }}>
                <div>Imported {customerImportResult.imported}; skipped {customerImportResult.skipped}; errors {customerImportResult.errors.length}.</div>
                {customerImportResult.errors.slice(0, 3).map(importError => <div key={`${importError.row}:${importError.code}`}>Row {importError.row}: {importError.code}{importError.field ? ` (${importError.field})` : ''}</div>)}
                {customerImportResult.errors.length > 3 && <div>{customerImportResult.errors.length - 3} more validation errors.</div>}
              </div>}
              <button disabled={pending || customerImportRows.length === 0} style={button(c.blue)}><FileUp size={14} /> Import validated rows</button>
            </form>
            <form onSubmit={createJob} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>2. Job</strong><select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} style={input}><option value="">Select customer</option>{data.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input required maxLength={200} placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={input} /><button disabled={pending || !customerId || jobTitle.trim().length < 2} style={button(c.blue)}><Plus size={14} /> Add job</button></form>
            <form onSubmit={createDocument} data-testid="tradeflowkit-document-create-form" style={{ ...panel, flex: '2 1 340px', display: 'grid', gap: 8 }}>
              <strong style={{ color: c.ink }}>3. Revenue document</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select aria-label="Document type" value={documentKind} onChange={(e) => setDocumentKind(e.target.value as 'quote' | 'invoice')} style={{ ...input, flex: '1 1 120px' }}><option value="quote">Quote</option><option value="invoice">Direct invoice</option></select>
                <select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} style={{ ...input, flex: '1 1 140px' }}><option value="">Customer</option>{data.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ ...input, flex: '1 1 140px' }}><option value="">No linked job</option>{jobsForCustomer.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
              </div>
              <input required maxLength={500} placeholder="Line-item description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} style={input} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input aria-label="Quantity" type="number" min="1" max="10000" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...input, flex: '1 1 90px' }} /><input aria-label="Unit price dollars" type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ ...input, flex: '1 1 120px' }} /><input aria-label="Tax percent" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={{ ...input, flex: '1 1 100px' }} />{documentKind === 'invoice' && <input aria-label="Invoice due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...input, flex: '1 1 150px' }} />}</div>
              <input maxLength={4000} placeholder="Notes (optional)" value={documentNotes} onChange={(e) => setDocumentNotes(e.target.value)} style={input} />
              <button disabled={pending || !customerId || !lineDescription.trim()} style={button(c.gold)}><Plus size={14} /> Create {documentKind}</button>
            </form>
          </div> : <div data-testid="tradeflowkit-revenue-readonly" style={{ color: c.muted, background: c.soft, borderRadius: 8, padding: 12, marginTop: 16 }}>Viewer access is read-only. Revenue mutations require module operator access.</div>}

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {data.quotes.length === 0 && data.invoices.length === 0 ? <div style={{ color: c.muted, textAlign: 'center', padding: 18, background: c.soft, borderRadius: 8 }}>No quotes or invoices yet. Build the first customer revenue flow above.</div> : null}
            {data.quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} customer={customerById.get(quote.customerId)} job={quote.jobId ? jobById.get(quote.jobId) : undefined} customers={data.customers} jobs={data.jobs} hasInvoice={invoiceQuoteIds.has(quote.id)} pending={pending} canManage={canManage} run={run} />)}
            {data.invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} customer={customerById.get(invoice.customerId)} customers={data.customers} jobs={data.jobs} pending={pending} canManage={canManage} run={run} />)}
          </div>
        </>
      )}
    </section>
  );
}

function QuoteRow({ quote, customer, job, customers, jobs, hasInvoice, pending, canManage, run }: {
  quote: TradeFlowKitQuote; customer?: TradeFlowKitCustomer; job?: TradeFlowKitJob;
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[]; hasInvoice: boolean;
  pending: boolean; canManage: boolean; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <DocumentEditor kind="quote" document={quote} customers={customers} jobs={jobs} pending={pending} onCancel={() => setEditing(false)} onSave={(input) => run(async () => {
      await moduleShellApi.tradeflowkit.updateQuote(quote.id, { ...input, expectedVersion: quote.version, expiresAt: input.documentDate });
      setEditing(false);
    })} />;
  }
  const archivable = ['draft', 'declined', 'expired', 'void'].includes(quote.status) && !hasInvoice;
  return (
    <div data-testid={`tradeflowkit-quote-${quote.id}`} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, background: '#fff', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ color: c.ink }}>Quote {quote.number ? `#${quote.number}` : ''} · {customer?.name ?? 'Customer'}</strong>
        <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{job?.title ?? 'Unlinked quote'} · {money(quote.totalCents)} · <b>{quote.status}</b> · v{quote.version}</div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {canManage && quote.status === 'draft' && <><Action disabled={pending} label="Edit" Icon={Pencil} tone={c.gold} onClick={() => setEditing(true)} /><Action disabled={pending} label="Send" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'sent'))} /></>}
        {canManage && quote.status === 'sent' && <><Action disabled={pending} label="Accept" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'accepted'))} /><Action disabled={pending} label="Decline" tone={c.red} onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionQuote(quote.id, quote.version, 'declined'))} /></>}
        {canManage && quote.status === 'accepted' && !quote.jobId && <Action disabled={pending} label="Create job" Icon={BriefcaseBusiness} tone={c.green} onClick={() => void run(() => moduleShellApi.tradeflowkit.quoteToJob(quote.id, quote.version))} />}
        {canManage && quote.status === 'accepted' && !hasInvoice && <Action disabled={pending} label="Create invoice" tone={c.gold} onClick={() => void run(() => moduleShellApi.tradeflowkit.invoiceQuote(quote.id, quote.version))} />}
        {canManage && archivable && <Action disabled={pending} label="Archive" Icon={Archive} tone={c.red} onClick={() => {
          if (window.confirm('Archive this quote? It will leave the active revenue workspace.')) void run(() => moduleShellApi.tradeflowkit.archiveQuote(quote.id, quote.version));
        }} />}
        {hasInvoice && <span style={{ color: c.green, fontWeight: 800, fontSize: 12 }}>Invoiced</span>}
      </div>
    </div>
  );
}

function InvoiceRow({ invoice, customer, customers, jobs, pending, canManage, run }: {
  invoice: TradeFlowKitInvoice; customer?: TradeFlowKitCustomer;
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[];
  pending: boolean; canManage: boolean; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <DocumentEditor kind="invoice" document={invoice} customers={customers} jobs={jobs} pending={pending} onCancel={() => setEditing(false)} onSave={(input) => run(async () => {
      await moduleShellApi.tradeflowkit.updateInvoice(invoice.id, { ...input, expectedVersion: invoice.version, dueDate: input.documentDate });
      setEditing(false);
    })} />;
  }
  const archivable = ['draft', 'void'].includes(invoice.status) && invoice.paidCents === 0;
  return (
    <div data-testid={`tradeflowkit-invoice-${invoice.id}`} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, background: '#f8fcfa', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ color: c.ink }}>Invoice {invoice.number ? `#${invoice.number}` : ''} · {customer?.name ?? 'Customer'}</strong>
        <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{money(invoice.totalCents)} · <b>{invoice.status}</b> · v{invoice.version}{invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {canManage && invoice.status === 'draft' && <><Action disabled={pending} label="Edit" Icon={Pencil} tone={c.gold} onClick={() => setEditing(true)} /><Action disabled={pending} label="Send invoice" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionInvoice(invoice.id, invoice.version, 'sent'))} /></>}
        {canManage && ['sent', 'processing'].includes(invoice.status) && <Action disabled={pending} label="Record payment" tone={c.green} onClick={() => { const ref = window.prompt('Payment reference (optional)') || undefined; void run(() => moduleShellApi.tradeflowkit.payInvoice(invoice.id, invoice.version, 'other', ref)); }} />}
        {canManage && archivable && <Action disabled={pending} label="Archive" Icon={Archive} tone={c.red} onClick={() => {
          if (window.confirm('Archive this unpaid invoice? It will leave the active revenue workspace.')) void run(() => moduleShellApi.tradeflowkit.archiveInvoice(invoice.id, invoice.version));
        }} />}
        {invoice.status === 'paid' && <span style={{ color: c.green, fontWeight: 900 }}>Paid</span>}
      </div>
    </div>
  );
}

type DocumentEditInput = {
  customerId: string; jobId?: string; lineItems: TradeFlowKitLineItem[];
  taxRateBps: number; discountCents: number; notes?: string; documentDate?: string;
};
type EditableLineItem = { description: string; quantity: string; unitPrice: string };

function DocumentEditor({ kind, document, customers, jobs, pending, onCancel, onSave }: {
  kind: 'quote' | 'invoice'; document: TradeFlowKitQuote | TradeFlowKitInvoice;
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[]; pending: boolean;
  onCancel: () => void; onSave: (input: DocumentEditInput) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(document.customerId);
  const [jobId, setJobId] = useState(document.jobId ?? '');
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(document.lineItems.map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: (item.unitPriceCents / 100).toFixed(2),
  })));
  const [taxRate, setTaxRate] = useState(String(document.taxRateBps / 100));
  const [discount, setDiscount] = useState((document.discountCents / 100).toFixed(2));
  const [notes, setNotes] = useState(document.notes ?? '');
  const rawDate = kind === 'quote' ? document.expiresAt : (document as TradeFlowKitInvoice).dueDate;
  const [documentDate, setDocumentDate] = useState(rawDate?.slice(0, 10) ?? '');
  const availableJobs = jobs.filter((job) => job.customerId === customerId);
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, padding: '8px 9px', background: '#fbfefc', color: c.ink };
  const updateLine = (index: number, patch: Partial<EditableLineItem>) => setLineItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const valid = !!customerId && lineItems.length > 0 && lineItems.every((item) =>
    item.description.trim().length > 0 && Number.isInteger(Number(item.quantity)) &&
    Number(item.quantity) >= 1 && Number(item.quantity) <= 10_000 &&
    Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0
  ) && Number.isFinite(Number(taxRate)) && Number(taxRate) >= 0 && Number(taxRate) <= 100 &&
    Number.isFinite(Number(discount)) && Number(discount) >= 0;

  return (
    <form data-testid={`tradeflowkit-${kind}-editor`} onSubmit={(event) => {
      event.preventDefault();
      if (!valid) return;
      void onSave({
        customerId, jobId: jobId || undefined,
        lineItems: lineItems.map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPriceCents: Math.round(Number(item.unitPrice) * 100),
        })),
        taxRateBps: Math.round(Number(taxRate) * 100),
        discountCents: Math.round(Number(discount) * 100),
        notes: notes || undefined, documentDate: documentDate || undefined,
      });
    }} style={{ border: `1px solid ${c.gold}`, borderRadius: 8, padding: 12, background: '#fffaf0', display: 'grid', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <strong style={{ color: c.ink }}>Edit {kind} #{document.number ?? document.id.slice(0, 8)}</strong>
        <button type="button" aria-label="Cancel editing" onClick={onCancel} style={{ border: 0, background: 'transparent', color: c.muted, cursor: 'pointer' }}><X size={18} /></button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select aria-label="Document customer" value={customerId} onChange={(event) => { setCustomerId(event.target.value); setJobId(''); }} style={{ ...inputStyle, flex: '1 1 180px' }}>{customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select aria-label="Document job" value={jobId} onChange={(event) => setJobId(event.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }}><option value="">No linked job</option>{availableJobs.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select>
        <input aria-label={kind === 'quote' ? 'Quote expiration date' : 'Invoice due date'} type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} style={{ ...inputStyle, flex: '1 1 150px' }} />
      </div>
      {lineItems.map((item, index) => (
        <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          <input aria-label={`Line ${index + 1} description`} required maxLength={500} value={item.description} onChange={(event) => updateLine(index, { description: event.target.value })} style={{ ...inputStyle, flex: '3 1 180px' }} />
          <input aria-label={`Line ${index + 1} quantity`} type="number" min="1" max="10000" step="1" value={item.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} style={{ ...inputStyle, flex: '1 1 90px' }} />
          <input aria-label={`Line ${index + 1} unit price`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} style={{ ...inputStyle, flex: '1 1 120px' }} />
          <button type="button" aria-label={`Remove line ${index + 1}`} disabled={lineItems.length === 1} onClick={() => setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ border: `1px solid ${c.border}`, borderRadius: 7, background: '#fff', color: c.red, opacity: lineItems.length === 1 ? .4 : 1 }}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => setLineItems((current) => [...current, { description: '', quantity: '1', unitPrice: '0.00' }])} style={{ justifySelf: 'start', border: `1px solid ${c.border}`, borderRadius: 7, padding: '7px 10px', background: c.soft, color: c.ink, fontWeight: 800 }}><Plus size={13} /> Add line item</button>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label="Edit tax percent" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
        <input aria-label="Edit discount dollars" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
        <input aria-label="Edit document notes" maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" style={{ ...inputStyle, flex: '3 1 240px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ border: `1px solid ${c.border}`, borderRadius: 7, padding: '8px 11px', background: '#fff', color: c.ink, fontWeight: 800 }}>Cancel</button>
        <button disabled={pending || !valid} style={{ border: 0, borderRadius: 7, padding: '8px 11px', background: c.green, color: '#fff', fontWeight: 800, opacity: pending || !valid ? .55 : 1 }}>Save {kind}</button>
      </div>
    </form>
  );
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) { return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: c.soft, color: c.ink, fontSize: 12 }}><Icon size={14} />{value} {label}</span>; }
function Action({ label, onClick, tone = c.blue, disabled, Icon }: { label: string; onClick: () => void; tone?: string; disabled: boolean; Icon?: LucideIcon }) { return <button type="button" disabled={disabled} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, borderRadius: 6, padding: '7px 10px', background: tone, color: '#fff', fontWeight: 800, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .6 : 1 }}>{Icon && <Icon size={13} />}{label}</button>; }
