'use client';

import React, { FormEvent, useMemo, useState } from 'react';
import {
  Building2, BriefcaseBusiness, ContactRound, FileText, ListChecks, Loader2,
  Receipt, Search, UserRound, X, type LucideIcon,
} from 'lucide-react';
import { moduleShellApi, type TradeFlowKitSearchResponse } from '@/lib/auth';

type SearchHit = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

type SearchGroup = {
  key: string;
  label: string;
  Icon: LucideIcon;
  hits: SearchHit[];
};

const money = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(cents / 100);

function groups(data: TradeFlowKitSearchResponse | null): SearchGroup[] {
  if (!data) return [];
  return [
    {
      key: 'leads', label: 'Leads', Icon: UserRound,
      hits: data.leads.map(row => ({
        id: row.id, label: row.name, detail: `${row.status.replaceAll('_', ' ')} · ${row.serviceType || 'Service not set'}`,
        href: `/leads/${row.id}`,
      })),
    },
    {
      key: 'customers', label: 'Customers', Icon: UserRound,
      hits: data.customers.map(row => ({
        id: row.id, label: row.name, detail: row.email || row.phone || 'Customer record',
        href: `/customers/${row.id}`,
      })),
    },
    {
      key: 'jobs', label: 'Jobs', Icon: BriefcaseBusiness,
      hits: data.jobs.map(row => ({
        id: row.id, label: row.number ? `Job #${row.number} · ${row.title}` : row.title,
        detail: `${row.customerName} · ${row.status.replaceAll('_', ' ')}`,
        href: `/jobs/${row.id}`,
      })),
    },
    {
      key: 'tasks', label: 'Tasks', Icon: ListChecks,
      hits: data.tasks.map(row => ({
        id: row.id, label: row.title, detail: `${row.jobTitle} · ${row.status.replaceAll('_', ' ')} · ${row.priority}`,
        href: `/tasks/${row.id}`,
      })),
    },
    {
      key: 'organizations', label: 'Directory organizations', Icon: Building2,
      hits: data.organizations.map(row => ({
        id: row.id, label: row.name, detail: `${row.type} · ${row.status}`,
        href: `/clients/${row.id}`,
      })),
    },
    {
      key: 'contacts', label: 'Directory contacts', Icon: ContactRound,
      hits: data.contacts.map(row => ({
        id: row.id, label: `${row.firstName} ${row.lastName}`.trim(), detail: row.email || row.phone || 'Directory contact',
        href: '/contacts',
      })),
    },
    {
      key: 'quotes', label: 'Quotes', Icon: FileText,
      hits: data.quotes.map(row => ({
        id: row.id, label: row.number ? `Quote #${row.number}` : `Quote ${row.id.slice(0, 8)}`,
        detail: `${row.customerName} · ${row.status} · ${money(row.totalCents)}`,
        href: `/quotes/${row.id}`,
      })),
    },
    {
      key: 'invoices', label: 'Invoices', Icon: Receipt,
      hits: data.invoices.map(row => ({
        id: row.id, label: row.number ? `Invoice #${row.number}` : `Invoice ${row.id.slice(0, 8)}`,
        detail: `${row.customerName} · ${row.status} · ${money(row.balanceCents)} due`,
        href: `/invoices/${row.id}`,
      })),
    },
  ].filter(group => group.hits.length > 0);
}

function requestError(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error && error.message) return error.message;
  return 'Search is unavailable. Retry or verify your TradeFlowKit access.';
}

export default function TradeFlowKitGlobalSearch({ tenantKey }: { tenantKey: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TradeFlowKitSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const resultGroups = useMemo(() => groups(result), [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading) return;
    setLoading(true); setError('');
    try { setResult(await moduleShellApi.tradeflowkit.search(value)); }
    catch (searchError) { setResult(null); setError(requestError(searchError)); }
    finally { setLoading(false); }
  }

  function clear() {
    setQuery(''); setResult(null); setError('');
  }

  return (
    <div className="tfk-global-search" data-testid="tradeflowkit-global-search" data-tenant-key={tenantKey}>
      <style>{css}</style>
      <form onSubmit={submit} role="search" aria-label="Search TradeFlowKit records">
        <Search size={17} aria-hidden="true" />
        <label className="sr-only" htmlFor="tradeflowkit-global-search-input">Search TradeFlowKit records</label>
        <input
          id="tradeflowkit-global-search-input"
          value={query}
          maxLength={100}
          onChange={event => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) { setResult(null); setError(''); }
          }}
          placeholder="Search leads, customers, jobs, tasks, directory, quotes, and invoices"
          data-testid="tradeflowkit-global-search-input"
        />
        {query && <button className="clear" type="button" onClick={clear} aria-label="Clear TradeFlowKit search"><X size={15} /></button>}
        <button className="submit" disabled={loading || !query.trim()} data-testid="tradeflowkit-global-search-submit">
          {loading ? <Loader2 className="spin" size={15} /> : 'Search'}
        </button>
      </form>

      <div className="tfk-global-search-status" aria-live="polite">
        {loading ? 'Searching tenant records…' : result ? `${result.total} result${result.total === 1 ? '' : 's'} for “${result.query}”` : ''}
      </div>
      {error && <div className="tfk-global-search-error" role="alert" data-testid="tradeflowkit-global-search-error">{error}</div>}
      {result && !loading && result.total === 0 && (
        <div className="tfk-global-search-empty" data-testid="tradeflowkit-global-search-empty">
          No active tenant records match “{result.query}”.
        </div>
      )}
      {resultGroups.length > 0 && (
        <div className="tfk-global-search-results" data-testid="tradeflowkit-global-search-results">
          {resultGroups.map(({ key, label, Icon, hits }) => (
            <section key={key} aria-labelledby={`tfk-search-${key}`}>
              <h2 id={`tfk-search-${key}`}><Icon size={14} /> {label}</h2>
              <div>
                {hits.map(hit => (
                  <a key={hit.id} href={hit.href} data-testid={`tradeflowkit-search-result-${key}-${hit.id}`}>
                    <strong>{hit.label}</strong>
                    <span>{hit.detail}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const css = `
  .tfk-global-search { display: grid; gap: 8px; }
  .tfk-global-search form { display: flex; align-items: center; gap: 8px; border: 1px solid rgba(5,150,105,.28); border-radius: 8px; padding: 7px 8px 7px 11px; background: #f8fcfa; color: #587067; }
  .tfk-global-search input { flex: 1; min-width: 120px; border: 0; outline: 0; background: transparent; color: #10231d; font: inherit; font-size: 14px; }
  .tfk-global-search button { border: 0; cursor: pointer; }
  .tfk-global-search button:disabled { cursor: not-allowed; opacity: .55; }
  .tfk-global-search .clear { display: grid; place-items: center; padding: 5px; border-radius: 6px; background: transparent; color: #587067; }
  .tfk-global-search .submit { min-width: 74px; display: flex; justify-content: center; align-items: center; border-radius: 6px; padding: 7px 11px; background: #059669; color: #fff; font-weight: 800; }
  .tfk-global-search-status { min-height: 16px; color: #587067; font-size: 12px; }
  .tfk-global-search-error, .tfk-global-search-empty { border-radius: 7px; padding: 9px 11px; font-size: 13px; }
  .tfk-global-search-error { border: 1px solid rgba(220,38,38,.3); background: #fef2f2; color: #991b1b; }
  .tfk-global-search-empty { border: 1px solid rgba(22,101,52,.14); background: #eef8f2; color: #587067; }
  .tfk-global-search-results { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; max-height: 360px; overflow: auto; padding-right: 2px; }
  .tfk-global-search-results section { min-width: 0; border: 1px solid rgba(22,101,52,.14); border-radius: 7px; background: #fff; overflow: hidden; }
  .tfk-global-search-results h2 { margin: 0; padding: 8px 10px; display: flex; gap: 6px; align-items: center; background: #eef8f2; color: #166534; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .tfk-global-search-results section > div { display: grid; }
  .tfk-global-search-results a { min-width: 0; display: grid; gap: 2px; padding: 8px 10px; color: #10231d; text-decoration: none; border-top: 1px solid rgba(22,101,52,.1); }
  .tfk-global-search-results a:hover, .tfk-global-search-results a:focus-visible { background: #f6fbf8; outline: 2px solid rgba(2,132,199,.35); outline-offset: -2px; }
  .tfk-global-search-results strong, .tfk-global-search-results span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tfk-global-search-results strong { font-size: 13px; }
  .tfk-global-search-results span { color: #587067; font-size: 11px; }
  .tfk-global-search .spin { animation: tfk-global-search-spin .9s linear infinite; }
  @keyframes tfk-global-search-spin { to { transform: rotate(360deg); } }
  @media (max-width: 620px) {
    .tfk-global-search form { flex-wrap: wrap; }
    .tfk-global-search input { flex-basis: calc(100% - 34px); }
    .tfk-global-search .submit { width: 100%; }
    .tfk-global-search-results { grid-template-columns: 1fr; max-height: 440px; }
  }
`;
