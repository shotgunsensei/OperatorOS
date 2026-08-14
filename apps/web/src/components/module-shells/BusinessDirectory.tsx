'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, Building2, ContactRound, Link2, Loader2, MapPin, Plus, RefreshCw, Save, Search, ShieldAlert,
} from 'lucide-react';
import {
  directoryApi,
  type DirectoryContact,
  type DirectoryModuleSlug,
  type DirectoryOrganization,
  type DirectoryOrganizationDetail,
  type DirectorySite,
} from '@/lib/auth';

type Tab = 'organizations' | 'contacts' | 'sites';
type ApiError = { status?: number; code?: string; error?: string };

const moduleLabels: Record<DirectoryModuleSlug, string> = {
  tradeflowkit: 'TradeFlowKit customer', techdeck: 'TechDeck managed client', pulsedesk: 'PulseDesk service client',
};

function errorMessage(error: unknown) {
  const value = error as ApiError;
  return value?.error || 'We could not load the business directory. Check your access and try again.';
}

function routeSelection(moduleSlug: DirectoryModuleSlug): { tab: Tab; organizationId: string } {
  if (typeof window === 'undefined') return { tab: 'organizations', organizationId: '' };
  const path = window.location.pathname;
  if (/\/contacts(?:\/|$)/.test(path)) return { tab: 'contacts', organizationId: '' };
  if (/\/(?:sites|facilities)(?:\/|$)/.test(path)) return { tab: 'sites', organizationId: '' };
  const organizationMatch = path.match(/\/(?:clients|customers|vendors)\/([a-z0-9-]+)\/?$/);
  return {
    tab: 'organizations',
    organizationId: organizationMatch?.[1] ?? '',
  };
}

export default function BusinessDirectory({
  moduleSlug, tenantKey, canArchive,
}: { moduleSlug: DirectoryModuleSlug; tenantKey: string; canArchive: boolean }) {
  const [tab, setTab] = useState<Tab>('organizations');
  const [organizations, setOrganizations] = useState<DirectoryOrganization[]>([]);
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [sites, setSites] = useState<DirectorySite[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [detail, setDetail] = useState<DirectoryOrganizationDetail | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);

  const load = useCallback(async (query = search) => {
    setLoading(true); setError(''); setDenied(false);
    try {
      const [orgs, people, locations] = await Promise.all([
        directoryApi.organizations.list(moduleSlug, query), directoryApi.contacts.list(moduleSlug, query), directoryApi.sites.list(moduleSlug, query),
      ]);
      setOrganizations(orgs.organizations); setContacts(people.contacts); setSites(locations.sites);
      const requested = routeSelection(moduleSlug);
      setTab(requested.tab);
      setSelectedId(current => requested.organizationId && orgs.organizations.some(row => row.id === requested.organizationId)
        ? requested.organizationId
        : current && orgs.organizations.some(row => row.id === current) ? current : orgs.organizations[0]?.id ?? '');
    } catch (requestError) {
      const value = requestError as ApiError; setDenied(value.status === 403); setError(errorMessage(requestError));
    } finally { setLoading(false); }
  }, [moduleSlug, search]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    try { setDetail(await directoryApi.organizations.get(moduleSlug, id)); }
    catch (requestError) { setError(errorMessage(requestError)); }
  }, [moduleSlug]);

  useEffect(() => { void load(''); }, [tenantKey, moduleSlug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadDetail(selectedId); }, [loadDetail, selectedId]);

  async function run(action: () => Promise<unknown>, after?: () => void) {
    setSaving(true); setError(''); setDenied(false);
    try { await action(); after?.(); await load(search); if (selectedId) await loadDetail(selectedId); }
    catch (requestError) { const value = requestError as ApiError; setDenied(value.status === 403); setError(errorMessage(requestError)); }
    finally { setSaving(false); }
  }

  const selectedOrganization = useMemo(() => organizations.find(row => row.id === selectedId) ?? null, [organizations, selectedId]);

  return (
    <section className={`directory-root directory-${moduleSlug}`} data-testid={`${moduleSlug}-business-directory`}>
      <style>{directoryCss}</style>
      <header className="directory-header">
        <div><div className="directory-eyebrow">Connected workspace</div><h2>Business Directory</h2><p>Keep organizations, contacts, and sites in one place and reuse them throughout your work.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} /> Refresh</button>
      </header>
      <div className="directory-toolbar">
        <div className="directory-tabs" role="tablist" aria-label="Business Directory records">
          {(['organizations', 'contacts', 'sites'] as Tab[]).map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'organizations' ? <Building2 size={15} /> : value === 'contacts' ? <ContactRound size={15} /> : <MapPin size={15} />}{value}</button>)}
        </div>
        <form onSubmit={event => { event.preventDefault(); void load(search); }} className="directory-search"><Search size={15} /><label><span className="sr-only">Search directory</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this workspace" maxLength={200} /></label><button type="submit">Search</button></form>
      </div>

      {error && <div className={`directory-state ${denied ? 'denied' : 'error'}`} role="alert"><ShieldAlert size={17} /><div><strong>{denied ? 'Directory access denied' : 'Directory request failed'}</strong><p>{error}</p></div></div>}
      {loading ? <div className="directory-state" aria-busy="true"><Loader2 className="directory-spin" size={18} /><span>Loading your business directory…</span></div> : (
        <div className="directory-layout">
          <div className="directory-list" role="tabpanel">
            {tab === 'organizations' && <OrganizationList rows={organizations} selectedId={selectedId} onSelect={setSelectedId} />}
            {tab === 'contacts' && <ContactList rows={contacts} />}
            {tab === 'sites' && <SiteList rows={sites} />}
          </div>
          <div className="directory-editor">
            {tab === 'organizations' && <OrganizationEditor moduleSlug={moduleSlug} rows={organizations} contacts={contacts} detail={detail} selected={selectedOrganization} canArchive={canArchive} saving={saving} run={run} select={setSelectedId} />}
            {tab === 'contacts' && <ContactEditor rows={contacts} canArchive={canArchive} saving={saving} run={run} moduleSlug={moduleSlug} />}
            {tab === 'sites' && <SiteEditor rows={sites} organizations={organizations} contacts={contacts} canArchive={canArchive} saving={saving} run={run} moduleSlug={moduleSlug} />}
          </div>
        </div>
      )}
    </section>
  );
}

function OrganizationList({ rows, selectedId, onSelect }: { rows: DirectoryOrganization[]; selectedId: string; onSelect: (id: string) => void }) {
  if (!rows.length) return <Empty Icon={Building2} title="No organizations yet" body="Create your first customer, client, vendor, partner, or facility." />;
  return <>{rows.map(row => <button type="button" className="directory-row" data-active={row.id === selectedId} key={row.id} onClick={() => onSelect(row.id)}><span><strong>{row.name}</strong><small>{row.type} · {row.status}</small></span><Building2 size={16} /></button>)}</>;
}
function ContactList({ rows }: { rows: DirectoryContact[] }) {
  if (!rows.length) return <Empty Icon={ContactRound} title="No contacts yet" body="Contacts are shared records and can be associated with organizations and sites." />;
  return <>{rows.map(row => <div className="directory-row static" key={row.id}><span><strong>{row.firstName} {row.lastName}</strong><small>{row.title || 'Contact'}{row.email ? ` · ${row.email}` : ''}</small></span><ContactRound size={16} /></div>)}</>;
}
function SiteList({ rows }: { rows: DirectorySite[] }) {
  if (!rows.length) return <Empty Icon={MapPin} title="No sites yet" body="Sites connect a shared organization to a normalized service location." />;
  return <>{rows.map(row => <div className="directory-row static" key={row.id}><span><strong>{row.name}</strong><small>{row.organization.name}{row.address ? ` · ${row.address.city}, ${row.address.region}` : ''}</small></span><MapPin size={16} /></div>)}</>;
}

function OrganizationEditor(props: {
  moduleSlug: DirectoryModuleSlug; rows: DirectoryOrganization[]; contacts: DirectoryContact[]; detail: DirectoryOrganizationDetail | null;
  selected: DirectoryOrganization | null; canArchive: boolean; saving: boolean; run: (a: () => Promise<unknown>, b?: () => void) => Promise<void>; select: (id: string) => void;
}) {
  const [name, setName] = useState(''); const [type, setType] = useState<DirectoryOrganization['type']>('client');
  const [website, setWebsite] = useState(''); const [notes, setNotes] = useState('');
  const [contactId, setContactId] = useState(''); const [contactRole, setContactRole] = useState('');
  const [relatedId, setRelatedId] = useState(''); const [relationshipType, setRelationshipType] = useState('service_partner');
  useEffect(() => { setName(props.selected?.name ?? ''); setType(props.selected?.type ?? 'client'); setWebsite(props.selected?.website ?? ''); setNotes(props.selected?.notes ?? ''); }, [props.selected]);
  const createMode = !props.selected;
  const save = () => props.run(async () => {
    if (createMode) { const row = await directoryApi.organizations.create(props.moduleSlug, { name, type, website: website || undefined, notes: notes || undefined }); props.select(row.id); }
    else await directoryApi.organizations.update(props.moduleSlug, props.selected!.id, { expectedVersion: props.selected!.version, name, type, website: website || null, notes: notes || null });
  }, () => { if (createMode) { setName(''); setWebsite(''); setNotes(''); } });
  const profileDefaults = props.moduleSlug === 'tradeflowkit' ? { customerStatus: 'active' } : props.moduleSlug === 'techdeck' ? { serviceTier: 'managed' } : { facilityCategory: 'facility', phiRestricted: true };
  return <div className="directory-stack">
    <h3>{createMode ? 'Create organization' : 'Organization detail'}</h3>
    <label>Name<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={200} /></label>
    <label>Type<select value={type} onChange={e => setType(e.target.value as DirectoryOrganization['type'])}>{['customer','client','vendor','partner','facility','other'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Website<input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" /></label>
    <label>Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} /></label>
    <div className="directory-actions"><button type="button" className="primary" disabled={props.saving || name.trim().length < 2} onClick={() => void save()}><Save size={14} /> {createMode ? 'Create' : 'Save changes'}</button>{props.selected && <button type="button" onClick={() => props.select('')}><Plus size={14} /> New</button>}{props.selected && props.canArchive && <button type="button" className="danger" onClick={() => void props.run(() => directoryApi.organizations.archive(props.moduleSlug, props.selected!.id, props.selected!.version), () => props.select(''))}><Archive size={14} /> Archive</button>}</div>
    {props.selected && <>
      <div className="directory-subpanel"><h4>Module reference</h4><p>{props.detail?.profile ? `Connected as a ${moduleLabels[props.moduleSlug]}.` : `Reference this same organization from ${moduleLabels[props.moduleSlug]} without copying it.`}</p><button type="button" disabled={props.saving || !!props.detail?.profile} onClick={() => void props.run(() => directoryApi.organizations.profile(props.moduleSlug, props.selected!.id, profileDefaults))}><Link2 size={14} /> {props.detail?.profile ? 'Connected' : `Use in ${moduleLabels[props.moduleSlug]}`}</button></div>
      <div className="directory-subpanel"><h4>Organization contacts</h4>{props.detail?.contacts.map(row => <div className="directory-association" key={row.id}><span>{row.firstName} {row.lastName}<small>{row.association.role || 'Associated contact'}</small></span>{props.canArchive && <button type="button" onClick={() => void props.run(() => directoryApi.organizations.removeContact(props.moduleSlug, props.selected!.id, row.id))}>Remove</button>}</div>)}<div className="directory-inline"><select aria-label="Contact to associate" value={contactId} onChange={e => setContactId(e.target.value)}><option value="">Choose contact</option>{props.contacts.filter(row => !props.detail?.contacts.some(link => link.id === row.id)).map(row => <option key={row.id} value={row.id}>{row.firstName} {row.lastName}</option>)}</select><input aria-label="Association role" value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Role" /><button type="button" disabled={!contactId} onClick={() => void props.run(() => directoryApi.organizations.associateContact(props.moduleSlug, props.selected!.id, contactId, contactRole), () => { setContactId(''); setContactRole(''); })}>Associate</button></div></div>
      <div className="directory-subpanel"><h4>Organization relationship</h4><div className="directory-inline"><select aria-label="Related organization" value={relatedId} onChange={e => setRelatedId(e.target.value)}><option value="">Choose organization</option>{props.rows.filter(row => row.id !== props.selected!.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><input aria-label="Relationship type" value={relationshipType} onChange={e => setRelationshipType(e.target.value)} /><button type="button" disabled={!relatedId || relationshipType.trim().length < 2} onClick={() => void props.run(() => directoryApi.relationships.create(props.moduleSlug, { fromOrganizationId: props.selected!.id, toOrganizationId: relatedId, type: relationshipType }), () => setRelatedId(''))}>Link</button></div>{props.detail?.relationships.map(row => <small key={row.id}>{row.type} · {row.fromOrganizationId === props.selected!.id ? 'outbound' : 'inbound'}</small>)}</div>
    </>}
  </div>;
}

function ContactEditor({ rows, canArchive, saving, run, moduleSlug }: { rows: DirectoryContact[]; canArchive: boolean; saving: boolean; run: (a: () => Promise<unknown>) => Promise<void>; moduleSlug: DirectoryModuleSlug }) {
  const [selected, setSelected] = useState(''); const row = rows.find(value => value.id === selected);
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [title, setTitle] = useState('');
  useEffect(() => { setFirstName(row?.firstName ?? ''); setLastName(row?.lastName ?? ''); setEmail(row?.email ?? ''); setPhone(row?.phone ?? ''); setTitle(row?.title ?? ''); }, [row]);
  const save = async () => { if (row) await run(() => directoryApi.contacts.update(moduleSlug, row.id, { expectedVersion: row.version, firstName, lastName, email: email || null, phone: phone || null, title: title || null })); else await run(() => directoryApi.contacts.create(moduleSlug, { firstName, lastName, email: email || undefined, phone: phone || undefined, title: title || undefined })); if (!row) { setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setTitle(''); } };
  return <div className="directory-stack"><h3>{row ? 'Edit contact' : 'Create contact'}</h3><label>Existing contact<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">New contact</option>{rows.map(value => <option key={value.id} value={value.id}>{value.firstName} {value.lastName}</option>)}</select></label><div className="directory-columns"><label>First name<input value={firstName} onChange={e => setFirstName(e.target.value)} /></label><label>Last name<input value={lastName} onChange={e => setLastName(e.target.value)} /></label></div><label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Phone<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label><label>Title<input value={title} onChange={e => setTitle(e.target.value)} /></label><div className="directory-actions"><button type="button" className="primary" disabled={saving || !firstName.trim()} onClick={() => void save()}><Save size={14} /> {row ? 'Save changes' : 'Create contact'}</button>{row && canArchive && <button type="button" className="danger" onClick={() => void run(() => directoryApi.contacts.archive(moduleSlug, row.id, row.version))}><Archive size={14} /> Archive</button>}</div></div>;
}

function SiteEditor({ rows, organizations, contacts, canArchive, saving, run, moduleSlug }: { rows: DirectorySite[]; organizations: DirectoryOrganization[]; contacts: DirectoryContact[]; canArchive: boolean; saving: boolean; run: (a: () => Promise<unknown>) => Promise<void>; moduleSlug: DirectoryModuleSlug }) {
  const [selected, setSelected] = useState(''); const row = rows.find(value => value.id === selected); const [organizationId, setOrganizationId] = useState(''); const [name, setName] = useState(''); const [line1, setLine1] = useState(''); const [city, setCity] = useState(''); const [region, setRegion] = useState(''); const [postalCode, setPostalCode] = useState(''); const [contactId, setContactId] = useState('');
  useEffect(() => { setOrganizationId(row?.organizationId ?? organizations[0]?.id ?? ''); setName(row?.name ?? ''); setLine1(row?.address?.line1 ?? ''); setCity(row?.address?.city ?? ''); setRegion(row?.address?.region ?? ''); setPostalCode(row?.address?.postalCode ?? ''); }, [row, organizations]);
  const address = line1 && city && region && postalCode ? { line1, city, region, postalCode, countryCode: 'US' } : null;
  const save = async () => { if (row) await run(() => directoryApi.sites.update(moduleSlug, row.id, { expectedVersion: row.version, name, address })); else await run(() => directoryApi.sites.create(moduleSlug, { organizationId, name, type: 'office', address })); if (!row) setName(''); };
  return <div className="directory-stack"><h3>{row ? 'Edit site' : 'Create site'}</h3><label>Existing site<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">New site</option>{rows.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label>Organization<select value={organizationId} disabled={!!row} onChange={e => setOrganizationId(e.target.value)}><option value="">Choose organization</option>{organizations.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label>Site name<input value={name} onChange={e => setName(e.target.value)} /></label><label>Address line<input value={line1} onChange={e => setLine1(e.target.value)} /></label><div className="directory-columns"><label>City<input value={city} onChange={e => setCity(e.target.value)} /></label><label>State/region<input value={region} onChange={e => setRegion(e.target.value)} /></label></div><label>Postal code<input value={postalCode} onChange={e => setPostalCode(e.target.value)} /></label><div className="directory-actions"><button type="button" className="primary" disabled={saving || !name.trim() || !organizationId} onClick={() => void save()}><Save size={14} /> {row ? 'Save changes' : 'Create site'}</button>{row && canArchive && <button type="button" className="danger" onClick={() => void run(() => directoryApi.sites.archive(moduleSlug, row.id, row.version))}><Archive size={14} /> Archive</button>}</div>{row && <div className="directory-subpanel"><h4>Site contact</h4><div className="directory-inline"><select aria-label="Site contact" value={contactId} onChange={e => setContactId(e.target.value)}><option value="">Choose contact</option>{contacts.map(value => <option key={value.id} value={value.id}>{value.firstName} {value.lastName}</option>)}</select><button type="button" disabled={!contactId} onClick={() => void run(() => directoryApi.sites.associateContact(moduleSlug, row.id, contactId, 'Site contact'))}>Associate</button></div></div>}</div>;
}

function Empty({ Icon, title, body }: { Icon: typeof Building2; title: string; body: string }) { return <div className="directory-empty"><Icon size={22} /><strong>{title}</strong><p>{body}</p></div>; }

const directoryCss = `
  .directory-root{--d-bg:#fff;--d-panel:#f8fafc;--d-text:#14213d;--d-muted:#64748b;--d-border:rgba(100,116,139,.25);--d-accent:#2563eb;--d-danger:#b91c1c;border:1px solid var(--d-border);border-radius:10px;background:var(--d-bg);color:var(--d-text);padding:18px;display:grid;gap:14px}
  .directory-techdeck{--d-bg:#0d1320;--d-panel:#101826;--d-text:#e5edf8;--d-muted:#94a3b8;--d-border:rgba(148,163,184,.24);--d-accent:#38bdf8}
  .directory-tradeflowkit{--d-bg:#fff;--d-panel:#eef8f2;--d-text:#10231d;--d-accent:#15803d}.directory-pulsedesk{--d-bg:#fff;--d-panel:#eef6fb;--d-text:#102033;--d-accent:#0284c7}
  .directory-root *{box-sizing:border-box}.directory-header,.directory-toolbar,.directory-actions,.directory-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.directory-header h2{margin:3px 0;font-size:20px}.directory-header p,.directory-subpanel p,.directory-empty p,.directory-state p{margin:4px 0 0;color:var(--d-muted);font-size:13px;line-height:1.45}.directory-eyebrow{text-transform:uppercase;font-size:11px;font-weight:800;color:var(--d-accent)}
  .directory-root button,.directory-root input,.directory-root select,.directory-root textarea{font:inherit}.directory-root button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--d-border);border-radius:7px;background:var(--d-panel);color:var(--d-text);padding:8px 10px;cursor:pointer;font-weight:700}.directory-root button:disabled{opacity:.55;cursor:not-allowed}.directory-root button.primary{background:var(--d-accent);color:#fff;border-color:transparent}.directory-root button.danger{color:var(--d-danger)}
  .directory-tabs{display:flex;gap:6px;flex-wrap:wrap}.directory-tabs button[aria-selected=true]{background:var(--d-accent);color:#fff}.directory-search{display:flex;align-items:center;gap:7px}.directory-search input{min-width:180px}.directory-root input,.directory-root select,.directory-root textarea{width:100%;border:1px solid var(--d-border);border-radius:7px;padding:8px 9px;background:var(--d-bg);color:var(--d-text)}.directory-root textarea{min-height:76px;resize:vertical}.directory-root label{display:grid;gap:5px;color:var(--d-muted);font-size:12px;font-weight:700}
  .directory-layout{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(300px,1.4fr);gap:14px}.directory-list,.directory-editor{border:1px solid var(--d-border);border-radius:8px;background:var(--d-panel);padding:10px;min-width:0}.directory-list{display:grid;align-content:start;gap:7px;max-height:720px;overflow:auto}.directory-row{width:100%;text-align:left;display:flex!important;justify-content:space-between!important;background:var(--d-bg)!important}.directory-row[data-active=true]{border-color:var(--d-accent);box-shadow:0 0 0 1px var(--d-accent)}.directory-row.static{display:flex;justify-content:space-between;gap:10px;border:1px solid var(--d-border);border-radius:7px;padding:10px;background:var(--d-bg)}.directory-row span,.directory-association span{display:grid;gap:3px}.directory-row small,.directory-association small,.directory-subpanel>small{color:var(--d-muted);font-size:11px}
  .directory-stack{display:grid;gap:10px}.directory-stack h3,.directory-subpanel h4{margin:0}.directory-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.directory-subpanel{display:grid;gap:9px;border-top:1px solid var(--d-border);padding-top:12px}.directory-association{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--d-border);border-radius:7px;padding:8px;background:var(--d-bg)}.directory-inline>*{flex:1 1 120px}.directory-inline button{flex:0 0 auto}.directory-state,.directory-empty{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--d-border);border-radius:8px;padding:12px;background:var(--d-panel)}.directory-state.error,.directory-state.denied{border-color:rgba(185,28,28,.45)}.directory-empty{display:grid;text-align:center;justify-items:center;padding:28px}.directory-spin{animation:dspin 1s linear infinite}@keyframes dspin{to{transform:rotate(360deg)}}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:760px){.directory-layout{grid-template-columns:1fr}.directory-list{max-height:320px}.directory-toolbar{align-items:stretch}.directory-search{width:100%}.directory-search label{flex:1}.directory-columns{grid-template-columns:1fr}}`;
