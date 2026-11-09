'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { moduleShellApi, type TradeFlowKitCustomer, type TradeFlowKitJob } from '@/lib/auth';

type Choice = TradeFlowKitCustomer | TradeFlowKitJob;
const labelFor = (row: Choice) => 'name' in row ? row.name : row.title;
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--tfk-border)', borderRadius: 7, padding: '9px 10px', background: 'var(--tfk-panel-soft)', color: 'var(--tfk-foreground)' };

// A page replaces the previous page. Only the selected record is pinned separately.
// Historical/archived relationships are labels, never selectable active records.
export default function TradeFlowKitRecordPicker(props: {
  kind: 'customers' | 'jobs'; label: string; value: string; customerId?: string;
  onChange: (id: string) => void; current: () => boolean; disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
  historicalLabel?: string;
}) {
  return <RecordPicker key={`${props.kind}:${props.customerId ?? ''}`} {...props} />;
}

function RecordPicker({ kind, label, value, customerId, onChange, current, disabled, onValidityChange, historicalLabel }: {
  kind: 'customers' | 'jobs'; label: string; value: string; customerId?: string;
  onChange: (id: string) => void; current: () => boolean; disabled?: boolean;
  onValidityChange?: (valid: boolean) => void;
  historicalLabel?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<Choice[]>([]);
  const [selected, setSelected] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [retry, setRetry] = useState(0);
  const version = useRef(0);
  const enabled = kind === 'customers' || Boolean(customerId);

  useEffect(() => {
    const request = ++version.current;
    const controller = new AbortController();
    const valid = () => !controller.signal.aborted && version.current === request && current();
    setRows([]); setNextCursor(null); setError(''); setLoading(enabled);
    if (!enabled) return () => controller.abort();
    const timer = setTimeout(() => {
      void moduleShellApi.tradeflowkit.revenuePage(kind, { q: search.trim(), cursor, customerId, limit: 25 }, controller.signal)
        .then(result => { if (valid()) { setRows(result.items); setNextCursor(result.nextCursor); } })
        .catch(() => { if (valid()) setError(`Unable to load ${kind}. Try again.`); })
        .finally(() => { if (valid()) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, search, cursor, customerId, current, enabled, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setSelected(null); setSelectionError('');
    if (!value || !enabled) return () => controller.abort();
    void moduleShellApi.tradeflowkit.revenueRecord(kind, value, controller.signal).then(result => {
      if (controller.signal.aborted || !current()) return;
      if (kind === 'jobs' && (result.item as TradeFlowKitJob).customerId !== customerId) {
        setSelectionError('The selected job is unavailable for this customer.'); return;
      }
      setSelected(result.item);
    }).catch(() => {
      if (!controller.signal.aborted && current()) setSelectionError('The selected record is unavailable. Choose an active record or retry.');
    });
    return () => controller.abort();
  }, [kind, value, customerId, current, enabled, retry]);

  useEffect(() => {
    onValidityChange?.(current() && (!value ? kind === 'jobs' : selected?.id === value && !selectionError));
  }, [kind, value, selected, selectionError, current, onValidityChange]);

  return <div style={{ display: 'grid', gap: 5, flex: '1 1 180px' }}>
    <label htmlFor={`${id}-search`}>Find {label.toLowerCase()}</label>
    <input id={`${id}-search`} type="search" maxLength={160} value={search} disabled={disabled || !enabled}
      onChange={event => { setSearch(event.target.value); setCursors([undefined]); }} style={inputStyle} />
    <label htmlFor={`${id}-choice`}>{label}</label>
    <select id={`${id}-choice`} value={value} disabled={disabled || !enabled || loading || Boolean(error)}
      onChange={event => onChange(event.target.value)} style={inputStyle}>
      <option value="">{kind === 'jobs' ? 'No linked job' : 'Select customer'}</option>
      {value && !rows.some(row => row.id === value) && <option value={value} disabled={!selected}>{selected ? labelFor(selected) : historicalLabel ?? 'Selected record (loading or unavailable)'}</option>}
      {rows.map(row => <option key={row.id} value={row.id}>{labelFor(row)}</option>)}
    </select>
    {loading && <span role="status">Loading {kind}.</span>}
    {value && !selected && !selectionError && <span role="status">Checking selected {label.toLowerCase()}.</span>}
    {!enabled && <span>Choose a customer first.</span>}
    {error && <span role="alert">{error}</span>}
    {selectionError && <span role="alert">{selectionError}</span>}
    {(error || selectionError) && <button type="button" disabled={disabled} onClick={() => setRetry(n => n + 1)}>Retry {label.toLowerCase()}</button>}
    {enabled && !loading && !error && rows.length === 0 && <span role="status">No matching {kind}.</span>}
    {enabled && <div style={{ display: 'flex', gap: 8 }}>
      <button type="button" disabled={disabled || loading || cursors.length === 1} onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous {label.toLowerCase()}</button>
      <button type="button" disabled={disabled || loading || !nextCursor} onClick={() => { if (nextCursor) setCursors(previous => [...previous, nextCursor]); }}>More {label.toLowerCase()}</button>
    </div>}
  </div>;
}
