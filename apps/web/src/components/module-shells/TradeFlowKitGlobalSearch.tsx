'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, BookmarkPlus, Loader2, Search, Trash2, X } from 'lucide-react';
import {
  moduleShellApi,
  type TradeFlowKitSavedView,
  type TradeFlowKitSearchItem,
} from '@/lib/auth';

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error) return error.message;
  return 'Search failed.';
}

export default function TradeFlowKitGlobalSearch({ tenantKey, canManage }: { tenantKey: string; canManage: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TradeFlowKitSearchItem[]>([]);
  const [savedViews, setSavedViews] = useState<TradeFlowKitSavedView[]>([]);
  const [viewName, setViewName] = useState('');
  const [shareView, setShareView] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError(null);
    moduleShellApi.tradeflowkit.savedViews('search')
      .then(response => setSavedViews(response.items))
      .catch(requestError => setError(errorMessage(requestError)));
  }, [tenantKey]);

  async function executeSearch(normalized: string) {
    if (normalized.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const response = await moduleShellApi.tradeflowkit.search(normalized);
      setResults(response.items);
      setSearched(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    await executeSearch(query.trim());
  }

  async function saveView(event: FormEvent) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!viewName.trim() || normalizedQuery.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const created = await moduleShellApi.tradeflowkit.createSavedView({
        resource: 'search',
        name: viewName.trim(),
        filters: { query: normalizedQuery },
        isShared: shareView,
      });
      setSavedViews(current => [...current, { ...created, owned: true }].sort((left, right) => left.name.localeCompare(right.name)));
      setViewName('');
      setShareView(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function removeView(view: TradeFlowKitSavedView) {
    setLoading(true);
    setError(null);
    try {
      await moduleShellApi.tradeflowkit.archiveSavedView(view.id, view.version);
      setSavedViews(current => current.filter(item => item.id !== view.id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  function applyView(view: TradeFlowKitSavedView) {
    const nextQuery = typeof view.filters.query === 'string' ? view.filters.query : '';
    setQuery(nextQuery);
    void executeSearch(nextQuery);
  }

  function clear() {
    setQuery('');
    setResults([]);
    setSearched(false);
    setError(null);
  }

  return (
    <section className="tfk-panel tfk-global-search" data-testid="tradeflowkit-global-search">
      <style>{css}</style>
      <form onSubmit={search}>
        <Search size={18} />
        <label htmlFor="tradeflowkit-global-query">Search the entire workspace</label>
        <input
          id="tradeflowkit-global-query"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Customer, job, task, quote, invoice, lead…"
          minLength={2}
          maxLength={100}
        />
        {query && <button type="button" className="clear" aria-label="Clear search" onClick={clear}><X size={15} /></button>}
        <button type="submit" disabled={loading || query.trim().length < 2}>
          {loading ? <Loader2 className="spin" size={15} /> : <Search size={15} />} Search
        </button>
      </form>
      {(savedViews.length > 0 || canManage) && <div className="tfk-saved-searches" data-testid="tradeflowkit-saved-views">
        <div className="tfk-saved-search-list">
          <strong>Saved searches</strong>
          {savedViews.length === 0 && <span>No saved searches yet.</span>}
          {savedViews.map(view => <div key={view.id}>
            <button type="button" className="saved" onClick={() => applyView(view)} disabled={loading}>
              {view.name}{view.isShared ? ' · shared' : ''}
            </button>
            {view.owned && <button type="button" className="remove" aria-label={`Remove saved view ${view.name}`} onClick={() => void removeView(view)} disabled={loading}><Trash2 size={12} /></button>}
          </div>)}
        </div>
        {canManage && <form className="tfk-save-search" onSubmit={saveView}>
          <BookmarkPlus size={15} />
          <input aria-label="Saved view name" value={viewName} onChange={event => setViewName(event.target.value)} placeholder="Name this search" maxLength={120} />
          <label><input type="checkbox" checked={shareView} onChange={event => setShareView(event.target.checked)} /> Share with tenant</label>
          <button type="submit" disabled={loading || !viewName.trim() || query.trim().length < 2}>Save view</button>
        </form>}
      </div>}
      {error && <div className="tfk-global-search-message error" role="alert" data-testid="tradeflowkit-global-search-error"><AlertTriangle size={15} />{error}</div>}
      {searched && !error && results.length === 0 && (
        <div className="tfk-global-search-message" data-testid="tradeflowkit-global-search-empty">No active records match “{query.trim()}”.</div>
      )}
      {results.length > 0 && (
        <div className="tfk-global-search-results" data-testid="tradeflowkit-global-search-results">
          {results.map(item => (
            <a key={`${item.kind}-${item.id}`} href={item.href} data-testid={`tradeflowkit-search-${item.kind}-${item.id}`}>
              <span>{item.kind}</span>
              <div><strong>{item.title}</strong><small>{item.detail || item.status || 'Active record'}{item.status && item.detail ? ` · ${item.status.replaceAll('_', ' ')}` : ''}</small></div>
              <ArrowRight size={15} />
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

const css = `
  .tfk-global-search { padding: 13px; }
  .tfk-global-search form { display: grid; grid-template-columns: auto auto minmax(180px,1fr) auto auto; align-items: center; gap: 9px; }
  .tfk-global-search form > svg { color: #047857; }
  .tfk-global-search label { color: #10231d; font-size: 12px; font-weight: 850; white-space: nowrap; }
  .tfk-global-search input { min-width: 0; border: 1px solid rgba(22,101,52,.2); border-radius: 7px; padding: 9px 10px; color: #10231d; background: #fbfefc; }
  .tfk-global-search button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid #047857; border-radius: 7px; padding: 9px 11px; background: #047857; color: #fff; font-weight: 800; cursor: pointer; }
  .tfk-global-search button.clear { border-color: rgba(22,101,52,.18); background: #fff; color: #587067; padding: 8px; }
  .tfk-global-search button:disabled { opacity: .45; cursor: not-allowed; }
  .tfk-global-search-message { margin-top: 10px; border-radius: 7px; padding: 9px 10px; background: #f6fbf8; color: #587067; font-size: 12px; }
  .tfk-global-search-message.error { display: flex; align-items: center; gap: 7px; color: #b91c1c; background: #fff1f2; }
  .tfk-global-search-results { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; margin-top: 10px; }
  .tfk-global-search-results a { display: grid; grid-template-columns: 64px minmax(0,1fr) auto; align-items: center; gap: 9px; border: 1px solid rgba(22,101,52,.13); border-radius: 7px; padding: 9px; color: #10231d; text-decoration: none; background: #fff; }
  .tfk-global-search-results a:hover { border-color: rgba(5,150,105,.45); background: #f6fbf8; }
  .tfk-global-search-results a > span { border-radius: 999px; padding: 4px 6px; color: #047857; background: #ecfdf5; text-align: center; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .tfk-global-search-results a > div { min-width: 0; display: grid; gap: 2px; }
  .tfk-global-search-results strong, .tfk-global-search-results small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tfk-global-search-results small { color: #587067; font-size: 11px; }
  .tfk-global-search-results svg { color: #0284c7; }
  .tfk-saved-searches { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 10px; margin-top: 10px; border-top: 1px solid rgba(22,101,52,.1); padding-top: 10px; }
  .tfk-saved-search-list { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .tfk-saved-search-list > strong, .tfk-saved-search-list > span { color: #587067; font-size: 11px; }
  .tfk-saved-search-list > div { display: inline-flex; }
  .tfk-saved-search-list button.saved { border-radius: 999px 0 0 999px; border-color: rgba(5,150,105,.18); background: #ecfdf5; color: #047857; padding: 5px 8px; font-size: 11px; }
  .tfk-saved-search-list button.remove { border-radius: 0 999px 999px 0; border-left: 0; border-color: rgba(5,150,105,.18); background: #fff; color: #b91c1c; padding: 5px 7px; }
  .tfk-save-search { display: grid !important; grid-template-columns: auto minmax(130px,180px) auto auto !important; gap: 6px !important; }
  .tfk-save-search label { display: flex; align-items: center; gap: 4px; color: #587067; font-size: 10px; }
  .tfk-save-search label input { min-width: auto; }
  .spin { animation: tfk-search-spin 1s linear infinite; }
  @keyframes tfk-search-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) {
    .tfk-global-search form { grid-template-columns: auto minmax(0,1fr) auto; }
    .tfk-global-search label { grid-column: 2 / -1; }
    .tfk-global-search input { grid-column: 1 / 3; }
    .tfk-global-search-results { grid-template-columns: 1fr; }
    .tfk-saved-searches { grid-template-columns: 1fr; }
    .tfk-save-search { grid-template-columns: auto minmax(0,1fr) !important; }
    .tfk-save-search label, .tfk-save-search button { grid-column: auto !important; }
  }
`;
