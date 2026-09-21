'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useTenant } from '@/components/TenantProvider';
import { sharedCustomersApi, type SharedCustomer } from '@/lib/auth';
import styles from './SharedCustomerPicker.module.css';

export default function SharedCustomerPicker(props: {
  moduleSlug: string; onSelect?: (customer: SharedCustomer | null) => void; value?: string;
}) {
  const { activeTenant } = useTenant();
  return <CustomerSearch key={`${activeTenant?.id ?? ''}:${props.moduleSlug}`} {...props} />;
}

function CustomerSearch({ moduleSlug, onSelect, value }: {
  moduleSlug: string; onSelect?: (customer: SharedCustomer | null) => void; value?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<SharedCustomer[]>([]);
  const [selected, setSelected] = useState<SharedCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState<SharedCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    const version = ++request.current;
    setLoading(true); setError(false); setRows([]);
    const timer = setTimeout(() => {
      void sharedCustomersApi.list(moduleSlug, search, offset).then(result => {
        if (version !== request.current) return;
        setRows(result.customers); setHasMore(result.pagination.hasMore); setCanWrite(result.canWrite);
        setSelected(previous => result.customers.find(row => row.id === previous?.id) ?? previous);
      }).catch(() => { if (version === request.current) setError(true); })
        .finally(() => { if (version === request.current) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [moduleSlug, search, offset, retry]);
  const current = onSelect ? rows.find(row => row.id === value) ?? (selected?.id === value ? selected : null) : selected;

  return <section className={styles.panel} aria-label="Shared customers" data-testid="shared-customer-picker">
    <strong>Shared customers</strong>
    <p>Use a customer already saved by your organization. Contact details are shared across your available apps.</p>
    <label htmlFor={`${id}-search`}>Find a customer</label>
    <input id={`${id}-search`} type="search" value={search} maxLength={200} placeholder="Search by name or email"
      onChange={event => { setSearch(event.target.value); setOffset(0); }} />
    {loading ? <p role="status">Loading customers…</p> : error ? <div role="alert"><p>Customers could not be loaded.</p>
      <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : <>
      <label htmlFor={`${id}-customer`}>{onSelect ? 'Use saved customer' : 'Customer details'}</label>
      <select id={`${id}-customer`} value={current?.id ?? ''} onChange={event => {
        const customer = rows.find(row => row.id === event.target.value) ?? null;
        setSelected(customer); setDraft(null); setSaveError(''); onSelect?.(customer);
      }}>
        <option value="">Choose a saved customer</option>
        {current && !rows.some(row => row.id === current.id) && <option value={current.id}>{current.name}</option>}
        {rows.map(row => <option key={row.id} value={row.id}>{row.name}{row.email ? ` · ${row.email}` : ''}</option>)}
      </select>
      {!rows.length && <p>No matching customers. Try another name or add a customer in your business directory.</p>}
      {(offset > 0 || hasMore) && <div className={styles.pages}>
        <button type="button" disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 50))}>Previous</button>
        <button type="button" disabled={!hasMore} onClick={() => setOffset(n => n + 50)}>More customers</button>
      </div>}
    </>}
    {current && <dl className={styles.details}>
      <dt>Customer</dt><dd>{current.name}</dd>
      <dt>Email</dt><dd>{current.email || 'Not added'}</dd>
      <dt>Phone</dt><dd>{current.phone || 'Not added'}</dd>
      <dt>Address</dt><dd>{current.address || 'Not added'}</dd>
      <dt>Website</dt><dd>{current.website || 'Not added'}</dd>
    </dl>}
    {current && !onSelect && canWrite && !draft && <button type="button" style={{ marginTop: 16 }} onClick={() => { setDraft({ ...current }); setSaveError(''); }}>Edit shared details</button>}
    {draft && <form onSubmit={event => {
      event.preventDefault(); setSaving(true); setSaveError('');
      void sharedCustomersApi.update(moduleSlug, draft).then(customer => {
        setSelected(customer); setRows(previous => previous.map(row => row.id === customer.id ? customer : row)); setDraft(null);
      }).catch((failure: { code?: string }) => setSaveError(failure.code === 'SHARED_CUSTOMER_CHANGED' ? 'Someone updated this customer. Cancel, reload, and review their changes before saving.' : 'These details could not be saved. Check for an existing customer with the same name or email, or try again.'))
        .finally(() => setSaving(false));
    }}>
      <p>Changes apply to this shared customer across your organization’s apps. Issued reports and invoices are not rewritten.</p>
      {(['name', 'email', 'phone', 'address', 'website'] as const).map(field => <label key={field} htmlFor={`${id}-edit-${field}`}>
        {({ name: 'Customer name', email: 'Email', phone: 'Phone', address: 'Address', website: 'Website' })[field]}
        <input id={`${id}-edit-${field}`} type={field === 'email' ? 'email' : field === 'website' ? 'url' : 'text'}
          required={field === 'name'} minLength={field === 'name' ? 2 : undefined} maxLength={field === 'name' ? 160 : field === 'address' ? 2000 : field === 'phone' ? 40 : field === 'email' ? 320 : 500}
          value={draft[field] ?? ''} onChange={event => setDraft({ ...draft, [field]: event.target.value })} />
      </label>)}
      {saveError && <p role="alert">{saveError}</p>}
      <div className={styles.pages}><button type="button" disabled={saving} onClick={() => { setDraft(null); setSaveError(''); setRetry(n => n + 1); }}>Cancel and reload</button>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save shared details'}</button></div>
    </form>}
  </section>;
}
