'use client';

import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
        id: row.id, label: row.number ? `Quote #${row.number}` : 'Draft quote',
        detail: `${row.customerName} · ${row.status} · ${money(row.totalCents)}`,
        href: `/quotes/${row.id}`,
      })),
    },
    {
      key: 'invoices', label: 'Invoices', Icon: Receipt,
      hits: data.invoices.map(row => ({
        id: row.id, label: row.number ? `Invoice #${row.number}` : 'Draft invoice',
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

export default function TradeFlowKitGlobalSearch({ tenantKey, hrefFor = path => path }: { tenantKey: string; hrefFor?: (path: string) => string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<TradeFlowKitSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const resultGroups = useMemo(() => groups(result), [result]);

  useEffect(() => {
    requestVersion.current++;
    setQuery(''); setResult(null); setError(''); setLoading(false);
    return () => { requestVersion.current++; };
  }, [tenantKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value || loading) return;
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const next = await moduleShellApi.tradeflowkit.search(value);
      if (version === requestVersion.current) setResult(next);
    } catch (searchError) {
      if (version === requestVersion.current) { setResult(null); setError(requestError(searchError)); }
    } finally { if (version === requestVersion.current) setLoading(false); }
  }

  function clear() {
    requestVersion.current++;
    setQuery(''); setResult(null); setError(''); setLoading(false);
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
            requestVersion.current++;
            setQuery(event.target.value);
            setResult(null); setError(''); setLoading(false);
          }}
          placeholder="Search leads, customers, jobs, tasks, directory, quotes, and invoices"
          data-testid="tradeflowkit-global-search-input"
        />
        {query && <button className="clear" type="button" onClick={clear} aria-label="Clear TradeFlowKit search"><X size={15} /></button>}
        <button className="submit" aria-label="Search TradeFlowKit records" disabled={loading || !query.trim()} data-testid="tradeflowkit-global-search-submit">
          {loading ? <><Loader2 className="spin" size={15} aria-hidden="true" /> Searching</> : 'Search'}
        </button>
      </form>

      <div className="tfk-global-search-status" aria-live="polite">
        {loading ? 'Searching organization records…' : result ? `${result.total} result${result.total === 1 ? '' : 's'} for “${result.query}”` : ''}
      </div>
      {error && <div className="tfk-global-search-error" role="alert" data-testid="tradeflowkit-global-search-error">{error}</div>}
      {result && !loading && result.total === 0 && (
        <div className="tfk-global-search-empty" data-testid="tradeflowkit-global-search-empty">
          No active organization records match “{result.query}”.
        </div>
      )}
      {resultGroups.length > 0 && (
        <div className="tfk-global-search-results" data-testid="tradeflowkit-global-search-results">
          {resultGroups.map(({ key, label, Icon, hits }) => (
            <section key={key} aria-labelledby={`tfk-search-${key}`}>
              <h2 id={`tfk-search-${key}`}><Icon size={14} /> {label}</h2>
              <div>
                {hits.map(hit => (
                  <a key={hit.id} href={hrefFor(hit.href)} data-testid={`tradeflowkit-search-result-${key}-${hit.id}`}>
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
  .tfk-global-search form { display: grid; grid-template-columns:18px minmax(0,1fr) auto auto; align-items: center; gap: 8px; border: 1px solid color-mix(in srgb, var(--tfk-primary) 28%, transparent); border-radius: 10px; padding: 7px 8px 7px 11px; background: var(--tfk-card); color: var(--tfk-muted-foreground); }
  .tfk-global-search form:focus-within { border-color:var(--tfk-focus,var(--tfk-primary)); box-shadow:0 0 0 3px color-mix(in srgb,var(--tfk-focus,var(--tfk-primary)) 16%,transparent); }
  .tfk-global-search input { flex: 1; min-width: 120px; min-height:44px; border: 0; outline: 0; background: transparent; color: var(--tfk-foreground); font: inherit; font-size: 14px; }
  .tfk-global-search button { border: 0; cursor: pointer; }
  .tfk-global-search button:disabled { cursor: not-allowed; opacity: .55; }
  .tfk-global-search .clear { display: grid; place-items: center; min-width:44px; min-height:44px; padding: 5px; border-radius: 8px; background: transparent; color: var(--tfk-muted-foreground); }
  .tfk-global-search button:focus-visible { outline:2px solid var(--tfk-focus,var(--tfk-primary)); outline-offset:2px; }
  .tfk-global-search .submit { min-width: 86px; min-height:44px; display: flex; gap:7px; justify-content: center; align-items: center; border-radius: 8px; padding: 9px 14px; background: var(--tfk-primary); color: var(--tfk-primary-foreground,#fff); font-weight: 750; }
  .tfk-global-search-status { min-height: 16px; color: var(--tfk-muted-foreground); font-size: 12px; }
  .tfk-global-search-error, .tfk-global-search-empty { border-radius: 7px; padding: 9px 11px; font-size: 13px; }
  .tfk-global-search-error { border: 1px solid rgba(220,38,38,.3); background: #fef2f2; color: #991b1b; }
  .tfk-global-search-empty { border: 1px solid color-mix(in srgb, var(--tfk-primary) 14%, transparent); background: var(--tfk-primary-soft); color: var(--tfk-muted-foreground); }
  .tfk-global-search-results { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; max-height: 360px; overflow: auto; padding-right: 2px; }
  .tfk-global-search-results section { min-width: 0; border: 1px solid color-mix(in srgb, var(--tfk-primary) 14%, transparent); border-radius: 10px; background: var(--tfk-panel); overflow: hidden; }
  .tfk-global-search-results h2 { margin: 0; padding: 10px 12px; display: flex; gap: 7px; align-items: center; background: var(--tfk-primary-soft); color: var(--tfk-primary-hover); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
  .tfk-global-search-results section > div { display: grid; }
  .tfk-global-search-results a { min-width: 0; min-height:44px; display: grid; align-content:center; gap: 3px; padding: 10px 12px; color: var(--tfk-foreground); text-decoration: none; border-top: 1px solid color-mix(in srgb, var(--tfk-primary) 10%, transparent); }
  .tfk-global-search-results a:hover, .tfk-global-search-results a:focus-visible { background: var(--tfk-card); outline: 2px solid rgba(2,132,199,.35); outline-offset: -2px; }
  .tfk-global-search-results strong, .tfk-global-search-results span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tfk-global-search-results strong { font-size: 13px; }
  .tfk-global-search-results span { color: var(--tfk-muted-foreground); font-size: 12px; }
  .tfk-global-search .spin { animation: tfk-global-search-spin .9s linear infinite; }
  @keyframes tfk-global-search-spin { to { transform: rotate(360deg); } }
  @media (max-width: 620px) {
    .tfk-global-search form { grid-template-columns:18px minmax(0,1fr) 44px; }
    .tfk-global-search input { min-width:0; width:100%; font-size:16px; }
    .tfk-global-search .submit { grid-column:1/-1; width: 100%; }
    .tfk-global-search-results { grid-template-columns: 1fr; max-height: 440px; }
  }
`;
