'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, BriefcaseBusiness, FileText, FileUp, Pencil, Plus, Receipt, Trash2, Users, X, type LucideIcon } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitCustomer,
  type TradeFlowKitCustomerImportResult,
  type TradeFlowKitCustomerImportRow,
  type TradeFlowKitInvoiceImportRow,
  type TradeFlowKitInvoice,
  type TradeFlowKitJob,
  type TradeFlowKitJobImportRow,
  type TradeFlowKitLineItem,
  type TradeFlowKitQuote,
  type TradeFlowKitRecordImportResult,
  type TradeFlowKitRevenueResponse,
} from '@/lib/auth';

const c = { ink: '#eaf7f0', muted: '#9ab6aa', panel: '#0f1b17', soft: '#14241e', border: 'rgba(134,239,172,.18)', green: '#34d399', blue: '#38bdf8', red: '#fb7185', gold: '#fbbf24' };
const empty: TradeFlowKitRevenueResponse = { customers: [], jobs: [], quotes: [], invoices: [] };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const customerImportColumns = ['name', 'email', 'phone', 'address', 'notes'] as const;
const jobImportColumns = ['customername', 'title', 'description', 'status', 'priority', 'scheduledstart', 'scheduledend', 'internalnotes'] as const;
const invoiceImportColumns = ['invoiceref', 'customername', 'status', 'duedate', 'taxrate', 'discount', 'notes', 'itemdescription', 'itemqty', 'itemunitprice'] as const;

function parseCsvTable(value: string, input: {
  label: string; allowedColumns: readonly string[]; requiredColumns: readonly string[];
}): Array<Record<string, string>> {
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
  if (records.length < 2) throw new Error(`The CSV needs a header and at least one ${input.label} row.`);

  const headers = records[0].map(header => header.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('en-US'));
  const missing = input.requiredColumns.find(column => !headers.includes(column));
  if (missing) throw new Error(`The CSV header must include ${missing}.`);
  if (new Set(headers).size !== headers.length) throw new Error('The CSV contains duplicate column headers.');
  const allowed = new Set<string>(input.allowedColumns);
  const unknown = headers.filter(header => !allowed.has(header));
  if (unknown.length > 0) throw new Error(`Unsupported CSV column: ${unknown[0]}.`);
  if (records.length - 1 > 100) throw new Error(`${input.label[0].toUpperCase()}${input.label.slice(1)} imports are limited to 100 rows.`);

  return records.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length && cells.slice(headers.length).some(cell => cell.trim())) {
      throw new Error(`CSV row ${rowIndex + 2} contains data outside the declared columns.`);
    }
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = (cells[index] ?? '').trim(); });
    return row;
  });
}

function parseCustomerCsv(value: string): TradeFlowKitCustomerImportRow[] {
  return parseCsvTable(value, { label: 'customer', allowedColumns: customerImportColumns, requiredColumns: ['name'] }).map(row => ({
      name: row.name,
      ...(row.email ? { email: row.email } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(row.address ? { address: row.address } : {}),
      ...(row.notes ? { notes: row.notes } : {}),
  }));
}

function parseJobCsv(value: string): TradeFlowKitJobImportRow[] {
  return parseCsvTable(value, { label: 'job', allowedColumns: jobImportColumns, requiredColumns: ['customername', 'title'] }).map(row => ({
    customerName: row.customername,
    title: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.status ? { status: row.status } : {}),
    ...(row.priority ? { priority: row.priority } : {}),
    ...(row.scheduledstart ? { scheduledStart: row.scheduledstart } : {}),
    ...(row.scheduledend ? { scheduledEnd: row.scheduledend } : {}),
    ...(row.internalnotes ? { internalNotes: row.internalnotes } : {}),
  }));
}

function parseInvoiceCsv(value: string): TradeFlowKitInvoiceImportRow[] {
  return parseCsvTable(value, { label: 'invoice', allowedColumns: invoiceImportColumns, requiredColumns: ['customername', 'itemdescription'] }).map(row => ({
    ...(row.invoiceref ? { invoiceRef: row.invoiceref } : {}),
    customerName: row.customername,
    ...(row.status ? { status: row.status } : {}),
    ...(row.duedate ? { dueDate: row.duedate } : {}),
    ...(row.taxrate ? { taxRate: row.taxrate } : {}),
    ...(row.discount ? { discount: row.discount } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    itemDescription: row.itemdescription,
    ...(row.itemqty ? { itemQty: row.itemqty } : {}),
    ...(row.itemunitprice ? { itemUnitPrice: row.itemunitprice } : {}),
  }));
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
  const [jobImportRows, setJobImportRows] = useState<TradeFlowKitJobImportRow[]>([]);
  const [jobImportName, setJobImportName] = useState('');
  const [jobImportKey, setJobImportKey] = useState('');
  const [jobImportError, setJobImportError] = useState<string | null>(null);
  const [jobImportResult, setJobImportResult] = useState<TradeFlowKitRecordImportResult | null>(null);
  const [invoiceImportRows, setInvoiceImportRows] = useState<TradeFlowKitInvoiceImportRow[]>([]);
  const [invoiceImportName, setInvoiceImportName] = useState('');
  const [invoiceImportKey, setInvoiceImportKey] = useState('');
  const [invoiceImportError, setInvoiceImportError] = useState<string | null>(null);
  const [invoiceImportResult, setInvoiceImportResult] = useState<TradeFlowKitRecordImportResult | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState('other');
  const [bulkPaymentReference, setBulkPaymentReference] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [next, provider] = await Promise.all([
        moduleShellApi.tradeflowkit.revenue(),
        moduleShellApi.tradeflowkit.paymentProvider(),
      ]);
      setData(next);
      setPaymentProvider(provider);
      setSelectedInvoiceIds(new Set());
      const nestedCustomerId = typeof window === 'undefined'
        ? ''
        : window.location.pathname.match(/\/customers\/([a-z0-9-]+)$/i)?.[1] || '';
      setCustomerId((current) => {
        const candidate = nestedCustomerId || current;
        return next.customers.some(customer => customer.id === candidate) ? candidate : next.customers[0]?.id || '';
      });
    } catch (err: any) {
      setError(err?.error || err?.message || 'Unable to load revenue workflow');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, tenantKey]);

  const customerById = useMemo(() => new Map(data.customers.map((row) => [row.id, row])), [data.customers]);
  const jobById = useMemo(() => new Map(data.jobs.map((row) => [row.id, row])), [data.jobs]);
  const invoiceQuoteIds = useMemo(() => new Set(data.invoices.map((row) => row.sourceQuoteId).filter(Boolean)), [data.invoices]);
  const jobsForCustomer = data.jobs.filter((row) => row.customerId === customerId);
  const deepQuoteId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/quotes\/([a-z0-9-]+)$/i)?.[1] || '';
  const deepInvoiceId = typeof window === 'undefined' ? '' : window.location.pathname.match(/\/invoices\/([a-z0-9-]+)$/i)?.[1] || '';

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

  async function selectJobImport(file?: File) {
    setJobImportRows([]); setJobImportName(''); setJobImportKey(''); setJobImportError(null); setJobImportResult(null);
    if (!file) return;
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) { setJobImportError('Select a .csv file.'); return; }
    if (file.size > 256 * 1024) { setJobImportError('Job CSV files are limited to 256 KB.'); return; }
    try {
      const rows = parseJobCsv(await file.text());
      setJobImportRows(rows); setJobImportName(file.name); setJobImportKey(`job-import:${crypto.randomUUID()}`);
    } catch (nextError) {
      setJobImportError(nextError instanceof Error ? nextError.message : 'Unable to parse the CSV.');
    }
  }

  function importJobs(event: FormEvent) {
    event.preventDefault();
    if (jobImportRows.length === 0 || !jobImportKey) return;
    void run(async () => {
      const result = await moduleShellApi.tradeflowkit.importJobs(jobImportRows, jobImportKey);
      setJobImportResult(result); setJobImportRows([]); setJobImportName(''); setJobImportKey('');
    });
  }

  async function selectInvoiceImport(file?: File) {
    setInvoiceImportRows([]); setInvoiceImportName(''); setInvoiceImportKey(''); setInvoiceImportError(null); setInvoiceImportResult(null);
    if (!file) return;
    if (!file.name.toLocaleLowerCase('en-US').endsWith('.csv')) { setInvoiceImportError('Select a .csv file.'); return; }
    if (file.size > 256 * 1024) { setInvoiceImportError('Invoice CSV files are limited to 256 KB.'); return; }
    try {
      const rows = parseInvoiceCsv(await file.text());
      setInvoiceImportRows(rows); setInvoiceImportName(file.name); setInvoiceImportKey(`invoice-import:${crypto.randomUUID()}`);
    } catch (nextError) {
      setInvoiceImportError(nextError instanceof Error ? nextError.message : 'Unable to parse the CSV.');
    }
  }

  function importInvoices(event: FormEvent) {
    event.preventDefault();
    if (invoiceImportRows.length === 0 || !invoiceImportKey) return;
    void run(async () => {
      const result = await moduleShellApi.tradeflowkit.importInvoices(invoiceImportRows, invoiceImportKey);
      setInvoiceImportResult(result); setInvoiceImportRows([]); setInvoiceImportName(''); setInvoiceImportKey('');
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

  function toggleInvoice(id: string) {
    setSelectedInvoiceIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 25) next.add(id);
      return next;
    });
  }

  function recordSelectedPayments() {
    const invoices = data.invoices.filter(invoice => selectedInvoiceIds.has(invoice.id));
    const records = invoices.map(invoice => ({ id: invoice.id, expectedVersion: invoice.version }));
    if (records.length === 0) return;
    const total = invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0);
    if (!window.confirm(`Record ${money(total)} in full offline payments across ${records.length} invoice${records.length === 1 ? '' : 's'}? The batch is all-or-nothing.`)) return;
    void run(() => moduleShellApi.tradeflowkit.bulkMarkInvoicesPaid(records, {
      method: bulkPaymentMethod,
      reference: bulkPaymentReference || undefined,
    }, `invoice-bulk-payment:${crypto.randomUUID()}`));
  }

  function connectPaymentProvider() {
    void run(async () => {
      const result = await moduleShellApi.tradeflowkit.authorizePaymentProvider();
      if (!result.authorizeUrl.startsWith('https://connect.stripe.com/')) throw new Error('Stripe authorization URL was not accepted.');
      window.location.assign(result.authorizeUrl);
    });
  }

  function disconnectPaymentProvider() {
    if (!window.confirm('Disconnect this organization’s Stripe account? Existing payment history remains, but new checkout links will stop.')) return;
    void run(() => moduleShellApi.tradeflowkit.disconnectPaymentProvider());
  }

  const panel: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 10, background: c.panel, padding: 16 };
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, padding: '9px 10px', background: '#0b1512', color: c.ink };
  const button = (tone = c.green): React.CSSProperties => ({ border: 0, borderRadius: 7, padding: '9px 12px', background: tone, color: '#fff', fontWeight: 800, cursor: pending ? 'wait' : 'pointer', opacity: pending ? .6 : 1 });

  return (
    <section id="tradeflowkit-revenue-flow" data-testid="tradeflowkit-revenue-flow" style={{ ...panel, marginTop: 18, background: 'linear-gradient(135deg,#0f1b17,#0a1511)' }} tabIndex={-1}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><div style={{ color: c.green, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Native revenue workflow</div><h2 style={{ margin: '4px 0 0', color: c.ink, fontSize: 20 }}>Customer → job → quote → invoice → payment</h2><p style={{ color: c.muted, margin: '6px 0 0', fontSize: 13 }}>Customer payments stay distinct from OperatorOS subscription billing.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Stat Icon={Users} label="Customers" value={data.customers.length} /><Stat Icon={BriefcaseBusiness} label="Jobs" value={data.jobs.length} /><Stat Icon={FileText} label="Quotes" value={data.quotes.length} /><Stat Icon={Receipt} label="Invoices" value={data.invoices.length} /></div>
      </div>

      {error && <div role="alert" style={{ marginTop: 12, padding: 10, borderRadius: 7, color: c.red, background: 'rgba(251,113,133,.10)', border: `1px solid ${c.red}55`, display: 'flex', gap: 8 }}><AlertTriangle size={16} />{error}</div>}
      {canManage && paymentProvider && <div data-testid="tradeflowkit-payment-provider" style={{ ...panel, marginTop: 12, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div><strong style={{ color: c.ink }}>Business payments · Stripe Connect</strong><div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{paymentProvider.ready ? `Ready for ${paymentProvider.mode} payments` : paymentProvider.account ? `Connected account needs attention: charges ${paymentProvider.account.chargesEnabled ? 'enabled' : 'restricted'}.` : paymentProvider.reason || 'Connect an organization-owned Stripe account to create customer checkout links.'}</div></div>
        <div style={{ display: 'flex', gap: 7 }}>{paymentProvider.account?.status !== 'disconnected' && paymentProvider.account ? <button type="button" disabled={pending} onClick={disconnectPaymentProvider} style={button(c.red)}>Disconnect</button> : <button type="button" disabled={pending || !paymentProvider.configured} onClick={connectPaymentProvider} style={button(c.blue)}>Connect Stripe</button>}</div>
      </div>}
      {loading ? <div style={{ color: c.muted, padding: '18px 0' }}>Loading revenue records…</div> : (
        <>
          {canManage ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <form data-testid="tradeflowkit-customer-create" onSubmit={createCustomer} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>1. Customer</strong><input required maxLength={160} placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={input} /><input type="email" placeholder="Email (optional)" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={input} /><button disabled={pending || customerName.trim().length < 2} style={button()}><Plus size={14} /> Add customer</button></form>
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
            <form onSubmit={importJobs} data-testid="tradeflowkit-job-import" style={{ ...panel, flex: '1 1 260px', display: 'grid', gap: 8 }}>
              <strong style={{ color: c.ink }}>Import jobs</strong>
              <span style={{ color: c.muted, fontSize: 12 }}>CSV columns: customerName, title, description, status, priority, scheduledStart, scheduledEnd, internalNotes. Active customer names must match exactly.</span>
              <label style={{ ...input, position: 'relative', overflow: 'hidden', display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer' }}><FileUp size={15} /><span>{jobImportName || 'Choose job CSV'}</span><input aria-label="Job CSV file" type="file" accept=".csv,text/csv" onChange={(event) => void selectJobImport(event.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
              {jobImportRows.length > 0 && <span style={{ color: c.green, fontSize: 12, fontWeight: 800 }}>{jobImportRows.length} rows ready for server validation.</span>}
              {jobImportError && <span role="alert" style={{ color: c.red, fontSize: 12 }}>{jobImportError}</span>}
              {jobImportResult && <div data-testid="tradeflowkit-job-import-result" style={{ color: c.ink, fontSize: 12 }}>
                <div>Imported {jobImportResult.imported}; skipped {jobImportResult.skipped}; errors {jobImportResult.errors.length}.</div>
                {jobImportResult.errors.slice(0, 3).map(importError => <div key={`${importError.row}:${importError.code}:${importError.field || ''}`}>Row {importError.row}: {importError.code}{importError.field ? ` (${importError.field})` : ''}</div>)}
              </div>}
              <button disabled={pending || jobImportRows.length === 0} style={button(c.blue)}><FileUp size={14} /> Import validated jobs</button>
            </form>
            <form data-testid="tradeflowkit-job-create" onSubmit={createJob} style={{ ...panel, flex: '1 1 220px', display: 'grid', gap: 8 }}><strong style={{ color: c.ink }}>2. Job</strong><select required value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }} style={input}><option value="">Select customer</option>{data.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input required maxLength={200} placeholder="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} style={input} /><button disabled={pending || !customerId || jobTitle.trim().length < 2} style={button(c.blue)}><Plus size={14} /> Add job</button></form>
            <form onSubmit={importInvoices} data-testid="tradeflowkit-invoice-import" style={{ ...panel, flex: '1 1 280px', display: 'grid', gap: 8 }}>
              <strong style={{ color: c.ink }}>Import invoices</strong>
              <span style={{ color: c.muted, fontSize: 12 }}>CSV columns: invoiceRef, customerName, status, dueDate, taxRate, discount, notes, itemDescription, itemQty, itemUnitPrice. Repeat invoiceRef for multiple lines. Paid status is rejected so payment history stays authoritative.</span>
              <label style={{ ...input, position: 'relative', overflow: 'hidden', display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer' }}><FileUp size={15} /><span>{invoiceImportName || 'Choose invoice CSV'}</span><input aria-label="Invoice CSV file" type="file" accept=".csv,text/csv" onChange={(event) => void selectInvoiceImport(event.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label>
              {invoiceImportRows.length > 0 && <span style={{ color: c.green, fontSize: 12, fontWeight: 800 }}>{invoiceImportRows.length} rows ready for server validation.</span>}
              {invoiceImportError && <span role="alert" style={{ color: c.red, fontSize: 12 }}>{invoiceImportError}</span>}
              {invoiceImportResult && <div data-testid="tradeflowkit-invoice-import-result" style={{ color: c.ink, fontSize: 12 }}>
                <div>Imported {invoiceImportResult.imported}; skipped {invoiceImportResult.skipped}; errors {invoiceImportResult.errors.length}.</div>
                {invoiceImportResult.errors.slice(0, 3).map(importError => <div key={`${importError.row}:${importError.code}:${importError.field || ''}`}>Row {importError.row}: {importError.code}{importError.field ? ` (${importError.field})` : ''}</div>)}
              </div>}
              <button disabled={pending || invoiceImportRows.length === 0} style={button(c.gold)}><FileUp size={14} /> Import validated invoices</button>
            </form>
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

          <div data-testid="tradeflowkit-customer-records" style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <div><strong style={{ color: c.ink }}>Customer records</strong><div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>Edit the shared business profile here. Archiving is blocked while active jobs or revenue documents remain.</div></div>
              <span style={{ color: c.muted, fontSize: 12 }}>{data.customers.length} active</span>
            </div>
            {data.customers.length === 0
              ? <div style={{ color: c.muted, textAlign: 'center', padding: 18, background: c.soft, borderRadius: 8 }}>No customers yet.</div>
              : data.customers.map(customer => <CustomerRow key={customer.id} customer={customer} selected={customer.id === customerId} pending={pending} canManage={canManage} run={run} onSelect={() => setCustomerId(customer.id)} />)}
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            {canManage && data.invoices.some(invoice => ['sent', 'processing'].includes(invoice.status) && invoice.balanceCents > 0) && <section data-testid="tradeflowkit-invoice-bulk-payment" aria-label="Invoice batch payment" style={{ border: '1px solid rgba(56,189,248,.28)', borderRadius: 8, background: 'rgba(56,189,248,.08)', padding: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', display: 'grid', color: c.ink }}><strong>{selectedInvoiceIds.size} payable invoices selected</strong><span style={{ color: c.muted, fontSize: 11 }}>Records the exact current balance as first-class offline payment history. Maximum 25.</span></div>
              <select aria-label="Bulk payment method" value={bulkPaymentMethod} onChange={event => setBulkPaymentMethod(event.target.value)} style={{ ...input, flex: '0 1 150px' }}><option value="other">Other</option><option value="cash">Cash</option><option value="check">Check</option><option value="card_external">External card</option><option value="bank_transfer">Bank transfer</option></select>
              <input aria-label="Bulk payment reference" value={bulkPaymentReference} onChange={event => setBulkPaymentReference(event.target.value)} maxLength={200} placeholder="Reference (optional)" style={{ ...input, flex: '1 1 180px' }} />
              <button type="button" disabled={pending || selectedInvoiceIds.size === 0} onClick={recordSelectedPayments} style={button(c.blue)}>Record selected balances</button>
              {selectedInvoiceIds.size > 0 && <button type="button" disabled={pending} onClick={() => setSelectedInvoiceIds(new Set())} style={button(c.muted)}>Clear</button>}
            </section>}
            {data.quotes.length === 0 && data.invoices.length === 0 ? <div style={{ color: c.muted, textAlign: 'center', padding: 18, background: c.soft, borderRadius: 8 }}>No quotes or invoices yet. Build the first customer revenue flow above.</div> : null}
            {data.quotes.map((quote) => <QuoteRow key={quote.id} quote={quote} customer={customerById.get(quote.customerId)} job={quote.jobId ? jobById.get(quote.jobId) : undefined} customers={data.customers} jobs={data.jobs} hasInvoice={invoiceQuoteIds.has(quote.id)} selected={quote.id === deepQuoteId} pending={pending} canManage={canManage} run={run} />)}
            {data.invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} customer={customerById.get(invoice.customerId)} customers={data.customers} jobs={data.jobs} selected={invoice.id === deepInvoiceId} batchSelected={selectedInvoiceIds.has(invoice.id)} batchSelectionFull={selectedInvoiceIds.size >= 25} pending={pending} canManage={canManage} run={run} onToggleBatch={() => toggleInvoice(invoice.id)} />)}
          </div>
        </>
      )}
    </section>
  );
}

function CustomerRow({ customer, selected, pending, canManage, run, onSelect }: {
  customer: TradeFlowKitCustomer; selected: boolean; pending: boolean; canManage: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>; onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');

  useEffect(() => {
    setName(customer.name);
    setEmail(customer.email ?? '');
    setPhone(customer.phone ?? '');
    setAddress(customer.address ?? '');
    setNotes(customer.notes ?? '');
  }, [customer]);

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, padding: '8px 9px', background: '#0b1512', color: c.ink };
  const frame: React.CSSProperties = { border: `1px solid ${selected ? c.green : c.border}`, borderRadius: 8, padding: 12, background: selected ? 'rgba(52,211,153,.10)' : c.panel, boxShadow: selected ? `inset 3px 0 ${c.green}` : 'none' };

  if (editing) {
    return <form data-testid={`tradeflowkit-customer-editor-${customer.id}`} style={{ ...frame, display: 'grid', gap: 8 }} onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        await moduleShellApi.tradeflowkit.updateCustomer(customer.id, {
          expectedVersion: customer.version,
          name,
          email: email || undefined,
          phone: phone || undefined,
          address: address || undefined,
          notes: notes || undefined,
        });
        setEditing(false);
      });
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,2fr) minmax(180px,1.5fr) minmax(140px,1fr)', gap: 8 }}>
        <input aria-label="Customer name" required minLength={2} maxLength={160} value={name} onChange={event => setName(event.target.value)} style={inputStyle} />
        <input aria-label="Customer email" type="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" style={inputStyle} />
        <input aria-label="Customer phone" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} placeholder="Phone" style={inputStyle} />
      </div>
      <input aria-label="Customer address" maxLength={500} value={address} onChange={event => setAddress(event.target.value)} placeholder="Address" style={inputStyle} />
      <textarea aria-label="Customer notes" maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Internal notes" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Action disabled={pending} label="Cancel" Icon={X} tone={c.muted} onClick={() => setEditing(false)} />
        <button disabled={pending || name.trim().length < 2} style={{ border: 0, borderRadius: 6, padding: '7px 10px', background: c.green, color: '#fff', fontWeight: 800 }}>Save customer · v{customer.version}</button>
      </div>
    </form>;
  }

  return <article id={`tradeflowkit-customer-${customer.id}`} data-testid={`tradeflowkit-customer-${customer.id}`} style={{ ...frame, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }} onClick={onSelect}>
    <div>
      <strong style={{ color: c.ink }}>{customer.name}</strong>
      <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{customer.email || 'No email'} · {customer.phone || 'No phone'} · v{customer.version}</div>
      {(customer.address || customer.notes) && <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{customer.address || customer.notes}</div>}
    </div>
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
      <a href={`/customers/${customer.id}`} onClick={event => event.stopPropagation()} style={{ color: c.blue, fontSize: 12 }}>Record deep link</a>
      {canManage && <Action disabled={pending} label="Edit" Icon={Pencil} tone={c.gold} onClick={() => { onSelect(); setEditing(true); }} />}
      {canManage && <Action disabled={pending} label="Archive" Icon={Archive} tone={c.red} onClick={() => {
        if (window.confirm('Archive this customer? Active jobs, quotes, or invoices must be archived first.')) void run(() => moduleShellApi.tradeflowkit.archiveCustomer(customer.id, customer.version));
      }} />}
    </div>
  </article>;
}

function QuoteRow({ quote, customer, job, customers, jobs, hasInvoice, selected, pending, canManage, run }: {
  quote: TradeFlowKitQuote; customer?: TradeFlowKitCustomer; job?: TradeFlowKitJob;
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[]; hasInvoice: boolean; selected: boolean;
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
    <div data-testid={`tradeflowkit-quote-${quote.id}`} style={{ border: `1px solid ${selected ? c.green : c.border}`, borderRadius: 8, padding: 12, background: selected ? 'rgba(52,211,153,.10)' : c.panel, boxShadow: selected ? `inset 3px 0 ${c.green}` : 'none', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ color: c.ink }}>Quote {quote.number ? `#${quote.number}` : ''} · {customer?.name ?? 'Customer'}</strong>
        <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{job?.title ?? 'Unlinked quote'} · {money(quote.totalCents)} · <b>{quote.status}</b> · v{quote.version}</div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <a href={`/quotes/${quote.id}`} style={{ color: c.blue, fontSize: 12 }}>Record deep link</a>
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

function InvoiceRow({ invoice, customer, customers, jobs, selected, batchSelected, batchSelectionFull, pending, canManage, run, onToggleBatch }: {
  invoice: TradeFlowKitInvoice; customer?: TradeFlowKitCustomer;
  customers: TradeFlowKitCustomer[]; jobs: TradeFlowKitJob[]; selected: boolean; batchSelected: boolean; batchSelectionFull: boolean;
  pending: boolean; canManage: boolean; run: (fn: () => Promise<unknown>) => Promise<void>; onToggleBatch: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <DocumentEditor kind="invoice" document={invoice} customers={customers} jobs={jobs} pending={pending} onCancel={() => setEditing(false)} onSave={(input) => run(async () => {
      await moduleShellApi.tradeflowkit.updateInvoice(invoice.id, { ...input, expectedVersion: invoice.version, dueDate: input.documentDate });
      setEditing(false);
    })} />;
  }
  const archivable = ['draft', 'void'].includes(invoice.status) && invoice.paidCents === 0;
  const payable = ['sent', 'processing'].includes(invoice.status) && invoice.balanceCents > 0;
  return (
    <div data-testid={`tradeflowkit-invoice-${invoice.id}`} style={{ border: `1px solid ${selected ? c.green : c.border}`, borderRadius: 8, padding: 12, background: selected ? 'rgba(52,211,153,.10)' : c.panel, boxShadow: selected ? `inset 3px 0 ${c.green}` : 'none', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        {canManage && payable && <input type="checkbox" aria-label={`Select invoice ${invoice.number ?? invoice.id} for batch payment`} checked={batchSelected} disabled={pending || (!batchSelected && batchSelectionFull)} onChange={onToggleBatch} style={{ marginTop: 3, accentColor: c.green }} />}
        <div>
        <strong style={{ color: c.ink }}>Invoice {invoice.number ? `#${invoice.number}` : ''} · {customer?.name ?? 'Customer'}</strong>
        <div style={{ color: c.muted, fontSize: 12, marginTop: 3 }}>{money(invoice.totalCents)} · balance {money(invoice.balanceCents)} · <b>{invoice.status}</b> · v{invoice.version}{invoice.paymentReference ? ` · ${invoice.paymentReference}` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <a href={`/invoices/${invoice.id}`} style={{ color: c.blue, fontSize: 12 }}>Record deep link</a>
        {canManage && invoice.status === 'draft' && <><Action disabled={pending} label="Edit" Icon={Pencil} tone={c.gold} onClick={() => setEditing(true)} /><Action disabled={pending} label="Send invoice" onClick={() => void run(() => moduleShellApi.tradeflowkit.transitionInvoice(invoice.id, invoice.version, 'sent'))} /></>}
        {canManage && ['sent', 'processing'].includes(invoice.status) && <Action disabled={pending} label="Record payment" tone={c.green} onClick={() => { const ref = window.prompt('Payment reference (optional)') || undefined; void run(() => moduleShellApi.tradeflowkit.payInvoice(invoice.id, invoice.version, 'other', ref)); }} />}
        {canManage && payable && <Action disabled={pending} label="Stripe payment link" tone={c.blue} onClick={() => void run(async () => {
          const result = await moduleShellApi.tradeflowkit.createPaymentLink(invoice.id, invoice.version, `payment-link:${crypto.randomUUID()}`);
          if (!result.checkoutUrl?.startsWith('https://')) throw new Error(result.replay ? 'This request was already used. Create a new payment link.' : 'Stripe did not return a checkout URL.');
          window.location.assign(result.checkoutUrl);
        })} />}
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
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${c.border}`, borderRadius: 7, padding: '8px 9px', background: '#0b1512', color: c.ink };
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
    }} style={{ border: `1px solid ${c.gold}`, borderRadius: 8, padding: 12, background: 'rgba(251,191,36,.08)', display: 'grid', gap: 9 }}>
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
          <button type="button" aria-label={`Remove line ${index + 1}`} disabled={lineItems.length === 1} onClick={() => setLineItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={{ border: `1px solid ${c.border}`, borderRadius: 7, background: c.soft, color: c.red, opacity: lineItems.length === 1 ? .4 : 1 }}><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => setLineItems((current) => [...current, { description: '', quantity: '1', unitPrice: '0.00' }])} style={{ justifySelf: 'start', border: `1px solid ${c.border}`, borderRadius: 7, padding: '7px 10px', background: c.soft, color: c.ink, fontWeight: 800 }}><Plus size={13} /> Add line item</button>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input aria-label="Edit tax percent" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
        <input aria-label="Edit discount dollars" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} style={{ ...inputStyle, flex: '1 1 130px' }} />
        <input aria-label="Edit document notes" maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" style={{ ...inputStyle, flex: '3 1 240px' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ border: `1px solid ${c.border}`, borderRadius: 7, padding: '8px 11px', background: c.soft, color: c.ink, fontWeight: 800 }}>Cancel</button>
        <button disabled={pending || !valid} style={{ border: 0, borderRadius: 7, padding: '8px 11px', background: c.green, color: '#fff', fontWeight: 800, opacity: pending || !valid ? .55 : 1 }}>Save {kind}</button>
      </div>
    </form>
  );
}

function Stat({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) { return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '6px 8px', borderRadius: 7, background: c.soft, color: c.ink, fontSize: 12 }}><Icon size={14} />{value} {label}</span>; }
function Action({ label, onClick, tone = c.blue, disabled, Icon }: { label: string; onClick: () => void; tone?: string; disabled: boolean; Icon?: LucideIcon }) { return <button type="button" disabled={disabled} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, borderRadius: 6, padding: '7px 10px', background: tone, color: '#fff', fontWeight: 800, cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? .6 : 1 }}>{Icon && <Icon size={13} />}{label}</button>; }
