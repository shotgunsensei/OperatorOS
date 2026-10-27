'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, ChevronRight, ContactRound, FileCheck2, MapPin, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import ModuleLaunchLink from '@/components/ModuleLaunchLink';
import { customerWorkspaceApi, type CustomerWorkspaceDetail, type CustomerWorkspaceJob, type CustomerWorkspaceList, type CustomerWorkspaceRunResult } from '@/lib/auth';
import { customerWorkspaceHref, customerWorkspaceResultLink, EMPTY_CUSTOMER_SELECTION, isWorkspaceId, readCustomerWorkspaceSelection, type CustomerWorkspaceSelection } from '@/lib/customer-workspace-route';
import styles from './CustomerWorkspacePage.module.css';

type ReadState<T> = { key: string; owns: () => boolean; value?: T; error?: unknown };
type ApiFailure = { status?: number; code?: string; error?: string };
const PAGE_SIZE = 30;

function failureMessage(error: unknown, action = false): string {
  const failure = error as ApiFailure;
  if (failure.code === 'FABRIC_CUSTOMER_LINK_AMBIGUOUS') return 'More than one SnapProof customer matches these saved details. Ask an administrator to reconcile the records, then reload. No customer was merged automatically.';
  if (failure.code === 'FABRIC_IDEMPOTENCY_CONFLICT') return 'A handoff already exists for this job version with different saved details. Open the original TradeFlow job and ask an administrator to reconcile its existing handoff before requesting a different report.';
  if (failure.code === 'CUSTOMER_CONTEXT_CHANGED' || failure.code === 'FABRIC_SOURCE_VERSION_CHANGED') return 'The customer details or job changed. Reload and review the current selection. If a handoff already exists for this job version, open the original TradeFlow job and reconcile that handoff before requesting another.';
  if (failure.status === 401) return 'Your session needs to be renewed. Sign in through OperatorOS, then reopen this workspace.';
  if (failure.status === 403) return action ? 'Your current access does not allow this handoff. Creating field proof requires write access in both TradeFlowKit and SnapProof.' : 'Customer Workspace uses your existing TradeFlowKit Directory access. It is not available with your current access in this organization.';
  if (failure.status === 404) return 'This customer, contact, site or job is no longer available in the selected organization. Choose a current record or reload.';
  if (failure.status === 409) return 'The saved records are not ready for this handoff. Reload and review the current details.';
  return action ? 'The handoff could not be confirmed. Retrying uses the same request so an uncertain result is not submitted as a new intent.' : 'The permitted customer records could not be loaded. Try again in a moment.';
}

function validateDetail(value: CustomerWorkspaceDetail, selection: CustomerWorkspaceSelection): boolean {
  return value.customer?.id === selection.organizationId
    && value.selection?.organizationId === selection.organizationId
    && value.selection.siteId === selection.siteId
    && value.selection.contactId === selection.contactId
    && Array.isArray(value.contacts) && Array.isArray(value.sites) && Array.isArray(value.jobs)
    && value.capabilities?.sourceModule === 'tradeflowkit' && value.capabilities.destinationModule === 'snapproofos';
}

function actionableJob(job: CustomerWorkspaceJob, detail: CustomerWorkspaceDetail): boolean {
  const context = job.directoryContext;
  return !job.handoffBlocker && isWorkspaceId(job.id) && Number.isSafeInteger(job.version) && job.version > 0
    && Boolean(context && context.organizationId === detail.customer.id && /^[a-f0-9]{64}$/.test(context.revision)
      && (!context.siteId || isWorkspaceId(context.siteId)) && (!context.contactId || isWorkspaceId(context.contactId))
      && (!detail.selection.siteId || context.siteId === detail.selection.siteId)
      && (!detail.selection.contactId || context.contactId === detail.selection.contactId));
}

function ReadNotice({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className={styles.notice} role="alert"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Customer records unavailable</strong><p>{failureMessage(error)}</p><button type="button" onClick={retry}>Try again</button></div></div>;
}

export default function CustomerWorkspacePage() {
  const { user, loading: authLoading } = useAuth();
  const { activeTenant, loading: tenantLoading } = useTenant();
  if (authLoading || tenantLoading) return <div className={styles.state} role="status" aria-busy="true">Loading your organization…</div>;
  if (!user || !activeTenant) return <section className={styles.state}><Building2 size={28} aria-hidden="true" /><h1>Choose an organization</h1><p>Select your organization in the workspace header to open its authorized customer records.</p></section>;
  return <CustomerWorkspaceContent key={activeTenant.id} tenantId={activeTenant.id} tenantName={activeTenant.name} />;
}

function CustomerWorkspaceContent({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { user, captureIdentity } = useAuth();
  const [route, setRoute] = useState(() => readCustomerWorkspaceSelection(typeof window === 'undefined' ? '' : window.location.search, tenantId));
  const selection = route.selection;
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [listState, setListState] = useState<ReadState<CustomerWorkspaceList> | null>(null);
  const [detailState, setDetailState] = useState<ReadState<CustomerWorkspaceDetail> | null>(null);
  const listVersion = useRef(0), detailVersion = useRef(0);
  const pendingCustomerFocus = useRef<string | null>(null);
  const listKey = `${tenantId}:${query}:${offset}:${refresh}`;
  const detailKey = `${tenantId}:${selection.organizationId}:${selection.siteId}:${selection.contactId}:${refresh}`;

  const navigate = useCallback((next: CustomerWorkspaceSelection) => {
    const href = customerWorkspaceHref(tenantId, next);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href);
    setRoute(readCustomerWorkspaceSelection(window.location.search, tenantId));
  }, [tenantId]);
  useEffect(() => {
    const restore = () => setRoute(readCustomerWorkspaceSelection(window.location.search, tenantId));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [tenantId]);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController(), version = ++listVersion.current;
    const identityCurrent = captureIdentity(user);
    const owns = () => !controller.signal.aborted && listVersion.current === version && identityCurrent();
    void customerWorkspaceApi.list(tenantId, { search: query || undefined, limit: PAGE_SIZE, offset }, controller.signal)
      .then(value => {
        if (value.sourceModule !== 'tradeflowkit' || !Array.isArray(value.customers) || !value.pagination) throw new Error('Unconfirmed customer response');
        if (owns()) setListState({ key: listKey, owns, value });
      })
      .catch(error => { if (owns()) setListState({ key: listKey, owns, error }); });
    return () => controller.abort();
  }, [tenantId, user, captureIdentity, query, offset, refresh, listKey]);

  useEffect(() => {
    const controller = new AbortController(), version = ++detailVersion.current;
    const identityCurrent = captureIdentity(user);
    const owns = () => !controller.signal.aborted && detailVersion.current === version && identityCurrent();
    if (selection.organizationId) {
      void customerWorkspaceApi.detail(tenantId, selection.organizationId, { siteId: selection.siteId, contactId: selection.contactId }, controller.signal)
        .then(value => {
          if (!validateDetail(value, { organizationId: selection.organizationId, siteId: selection.siteId, contactId: selection.contactId, jobId: null })) throw { status: 404, code: 'CUSTOMER_CONTEXT_NOT_FOUND' };
          if (owns()) setDetailState({ key: detailKey, owns, value });
        }).catch(error => { if (owns()) setDetailState({ key: detailKey, owns, error }); });
    }
    return () => controller.abort();
  }, [tenantId, user, captureIdentity, selection.organizationId, selection.siteId, selection.contactId, refresh, detailKey]); // selection.jobId does not alter the server's Directory filter.

  const list = listState?.key === listKey && listState.owns() ? listState : null;
  const detail = detailState?.key === detailKey && detailState.owns() ? detailState : null;
  const selectedJob = detail?.value?.jobs.find(job => job.id === selection.jobId) ?? null;
  const reload = () => setRefresh(value => value + 1);
  useEffect(() => {
    if (!detail?.value || pendingCustomerFocus.current !== detail.value.customer.id) return;
    pendingCustomerFocus.current = null;
    if (window.innerWidth <= 850) {
      const heading = document.getElementById('selected-customer-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [detail, route]);
  const changeCustomer = () => {
    const searchInput = document.getElementById('customer-name-search');
    searchInput?.focus({ preventScroll: true });
    searchInput?.scrollIntoView({ block: 'center', behavior: 'auto' });
  };

  return <div className={styles.workspace} data-testid="customer-workspace">
    <header className={styles.hero}><div><span className={styles.eyebrow}>One customer. Connected work.</span><h1>Customer Workspace</h1><p>Choose a business, keep its contacts and sites in view, and prepare field proof from an existing TradeFlow job.</p><span className={styles.organization}><Building2 size={15} aria-hidden="true" />{tenantName} · Business Directory</span></div><div className={styles.flow}><span>TradeFlowKit</span><ArrowRight size={18} aria-hidden="true" /><span>SnapProof</span></div></header>
    {route.invalid && <div className={styles.notice} role="status"><ShieldCheck size={18} aria-hidden="true" /><div>The saved selection does not match this organization or contains invalid references. Choose a current customer.<button type="button" onClick={() => navigate(EMPTY_CUSTOMER_SELECTION)}>Clear saved selection</button></div></div>}
    <div className={styles.layout}>
      <section className={styles.customerPanel} aria-labelledby="customer-list-title">
        <div className={styles.panelHeading}><div><span className={styles.eyebrow}>Start with the customer</span><h2 id="customer-list-title">Your businesses</h2></div><UsersRound size={21} aria-hidden="true" /></div>
        <label className={styles.search}><span className={styles.label}>Search business names</span><span><Search size={17} aria-hidden="true" /><input id="customer-name-search" type="search" aria-label="Search business names" value={search} maxLength={200} placeholder="Find a client or organization" onChange={event => setSearch(event.target.value)} /></span></label>
        {!list ? <p className={styles.loading} role="status" aria-busy="true">Loading permitted customers…</p> : list.error ? <ReadNotice error={list.error} retry={reload} /> : <>
          <ul className={styles.customerList} aria-label="Business Directory customers">{list.value?.customers.map(customer => <li key={customer.id}><button type="button" aria-pressed={selection.organizationId === customer.id} onClick={() => { pendingCustomerFocus.current = customer.id; navigate({ ...EMPTY_CUSTOMER_SELECTION, organizationId: customer.id }); }}><span className={styles.customerIcon}><Building2 size={19} aria-hidden="true" /></span><span><strong>{customer.name}</strong><small>{customer.type.replaceAll('_', ' ')}{customer.website ? ` · ${customer.website}` : ''}</small></span><ChevronRight size={17} aria-hidden="true" /></button></li>)}</ul>
          {list.value?.customers.length === 0 && <div className={styles.empty}><Building2 size={25} aria-hidden="true" /><strong>{query ? 'No business names match' : 'No customers available yet'}</strong><p>{query ? 'Try another business name.' : 'Existing, authorized Directory organizations appear here. Add or import them through your current TradeFlow Directory tools.'}</p></div>}
          <div className={styles.pagination}><button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}><ArrowLeft size={15} aria-hidden="true" />Previous</button><span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span><button type="button" disabled={!list.value?.pagination.hasMore} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next<ArrowRight size={15} aria-hidden="true" /></button></div>
        </>}
        <p className={styles.boundary}><ShieldCheck size={15} aria-hidden="true" />Records follow your current organization and TradeFlow access.</p>
      </section>

      <section className={styles.detailPanel} aria-label="Selected customer workspace">
        {!selection.organizationId ? <div className={styles.welcome}><span className={styles.welcomeIcon}><ContactRound size={34} aria-hidden="true" /></span><span className={styles.eyebrow}>Keep the details together</span><h2>Choose the customer behind the work.</h2><p>Review its existing contacts and sites, select a linked job, then carry those saved details into a SnapProof draft.</p><div className={styles.steps}><span><Building2 size={19} aria-hidden="true" />Business</span><ChevronRight size={17} aria-hidden="true" /><span><BriefcaseBusiness size={19} aria-hidden="true" />Existing job</span><ChevronRight size={17} aria-hidden="true" /><span><FileCheck2 size={19} aria-hidden="true" />Field proof</span></div></div> : !detail ? <div className={styles.state} role="status" aria-busy="true">Loading customer, contacts and linked jobs…</div> : detail.error ? <ReadNotice error={detail.error} retry={reload} /> : detail.value && <>
          <CustomerDetails detail={detail.value} selection={selection} onSelect={navigate} reload={reload} changeCustomer={changeCustomer} />
          <section className={styles.jobs} aria-labelledby="customer-jobs-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>Continue existing work</span><h2 id="customer-jobs-title">TradeFlow jobs</h2></div><BriefcaseBusiness size={22} aria-hidden="true" /></div>
            <p>These jobs already use this customer’s Directory links. Selecting a site or contact narrows the list.</p>
            {detail.value.jobs.length ? <label className={styles.field}>Existing job<select aria-label="Existing job" value={selectedJob?.id ?? ''} onChange={event => navigate({ ...selection, jobId: event.target.value || null })}><option value="">Choose a linked job</option>{detail.value.jobs.map(job => <option key={job.id} value={job.id}>{job.number === null ? 'Saved job' : `Job #${job.number}`} · {job.title} · {job.status.replaceAll('_', ' ')}</option>)}</select></label> : <div className={styles.empty}><BriefcaseBusiness size={25} aria-hidden="true" /><strong>No linked jobs in this view</strong><p>Try another contact or site, or review the customer links in TradeFlowKit.</p></div>}
            {selection.jobId && !selectedJob && <p className={styles.inlineError} role="status">The saved job is not in the current authorized list. Choose an available job.</p>}
            {detail.value.pagination.hasMoreJobs && <p className={styles.hint}>Showing the first 100 linked jobs. Narrow by contact or site, or review the complete job list in TradeFlowKit.</p>}
            <ModuleLaunchLink className={styles.textLink} href="/modules/tradeflowkit/jobs">Open TradeFlow jobs<ArrowRight size={15} aria-hidden="true" /></ModuleLaunchLink>
          </section>
          {selectedJob && <FieldProofHandoff key={`${selectedJob.id}:${selectedJob.version}:${selectedJob.directoryContext?.revision ?? 'unavailable'}`} tenantId={tenantId} userId={user?.id ?? ''} job={selectedJob} detail={detail.value} current={detail.owns} reload={reload} />}
        </>}
      </section>
    </div>
  </div>;
}

function CustomerDetails({ detail, selection, onSelect, reload, changeCustomer }: { detail: CustomerWorkspaceDetail; selection: CustomerWorkspaceSelection; onSelect: (value: CustomerWorkspaceSelection) => void; reload: () => void; changeCustomer: () => void }) {
  const contact = detail.contacts.find(item => item.id === selection.contactId);
  const site = detail.sites.find(item => item.id === selection.siteId);
  return <section className={styles.customerSummary} aria-labelledby="selected-customer-title"><div className={styles.summaryHeader}><div><span className={styles.eyebrow}>Existing customer record</span><h2 id="selected-customer-title" tabIndex={-1}>{detail.customer.name}</h2><p>{detail.customer.type.replaceAll('_', ' ')}{detail.customer.website ? ` · ${detail.customer.website}` : ''}</p></div><button type="button" className={styles.iconButton} aria-label="Refresh customer details" onClick={reload}><RefreshCw size={18} aria-hidden="true" /></button></div>
    <button type="button" className={styles.changeCustomer} onClick={changeCustomer}><ArrowLeft size={14} aria-hidden="true" />Change customer</button>
    <div className={styles.filters}><label className={styles.field}><span><ContactRound size={16} aria-hidden="true" />Contact</span><select aria-label="Contact" value={selection.contactId ?? ''} onChange={event => onSelect({ ...selection, contactId: event.target.value || null, jobId: null })}><option value="">All associated contacts</option>{selection.contactId && !contact && <option value={selection.contactId}>Selected saved contact · outside this view</option>}{detail.contacts.map(item => <option key={item.id} value={item.id}>{[item.firstName, item.lastName].filter(Boolean).join(' ')}{item.isPrimary ? ' · Primary' : ''}</option>)}</select></label><label className={styles.field}><span><MapPin size={16} aria-hidden="true" />Site</span><select aria-label="Site" value={selection.siteId ?? ''} onChange={event => onSelect({ ...selection, siteId: event.target.value || null, jobId: null })}><option value="">All customer sites</option>{selection.siteId && !site && <option value={selection.siteId}>Selected saved site · outside this view</option>}{detail.sites.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <p className={styles.hint}>This view includes up to 100 associated contacts and 100 sites. Jobs keep their own saved customer links.</p>
    {(contact || site) && <dl className={styles.contactDetails}>{contact && <><dt>Selected contact</dt><dd>{[contact.firstName, contact.lastName].filter(Boolean).join(' ')}{contact.title ? ` · ${contact.title}` : ''}<small>{[contact.email, contact.phone].filter(Boolean).join(' · ') || 'No contact details saved'}</small></dd></>}{site && <><dt>Selected site</dt><dd>{site.name}<small>{site.address || 'No site address saved'}{site.timezone ? ` · ${site.timezone}` : ''}</small></dd></>}</dl>}
    {detail.capabilities.readOnly && <p className={styles.readOnly}><ShieldCheck size={16} aria-hidden="true" />Read-only access. You can review the existing customer context; creating a draft requires write access in both tools.</p>}
  </section>;
}

type HandoffState = { phase: 'review' | 'submitting' | 'queued' | 'waiting' | 'completed' | 'partial' | 'failed'; runId?: string; result?: CustomerWorkspaceRunResult; error?: unknown };
function FieldProofHandoff({ tenantId, userId, job, detail, current, reload }: { tenantId: string; userId: string; job: CustomerWorkspaceJob; detail: CustomerWorkspaceDetail; current: () => boolean; reload: () => void }) {
  const [state, setState] = useState<HandoffState | null>(null);
  const busy = useRef(false), generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polling = useRef<AbortController | null>(null);
  const intent = useRef<{ idempotencyKey: string; runId?: string } | null>(null);
  const context = job.directoryContext;
  const allowed = detail.capabilities.canRequestFieldProof === true && detail.capabilities.readOnly === false && actionableJob(job, detail);
  const storageKey = `operatoros.customer-workspace.v1:${tenantId}:${userId}:${job.id}:${job.version}:${context?.revision ?? ''}`;
  useEffect(() => () => { generation.current++; if (timer.current) clearTimeout(timer.current); polling.current?.abort(); }, []);

  const poll = async (runId: string, actionGeneration: number, attempt = 0) => {
    if (!current() || generation.current !== actionGeneration) return;
    polling.current?.abort();
    const controller = new AbortController(); polling.current = controller;
    const owns = () => current() && generation.current === actionGeneration && !controller.signal.aborted;
    try {
      const result = await customerWorkspaceApi.run(tenantId, runId, controller.signal);
      if (!owns()) return;
      if (result.run?.id !== runId) throw { code: 'CUSTOMER_CONTEXT_NOT_FOUND', status: 404 };
      const status = result.run.status;
      const delivery = result.run.delivery_status;
      const errorCode = result.run.delivery_error_code || result.run.last_error_code;
      const hasVerifiedLink = Array.isArray(result.links) && result.links.some(link => customerWorkspaceResultLink(link.destination_deep_link));
      if (status === 'completed' && delivery === 'completed' && !errorCode && hasVerifiedLink) { setState({ phase: 'completed', runId, result }); return; }
      if (status === 'partial' && delivery === 'completed') { setState({ phase: 'partial', runId, result }); return; }
      if (['failed', 'dead_letter', 'cancelled'].includes(status) || delivery === 'dead_letter' || errorCode) {
        setState({ phase: 'failed', runId, error: { code: result.run.delivery_error_code || result.run.last_error_code } }); return;
      }
      if (attempt >= 5) { setState({ phase: 'waiting', runId }); return; }
      setState({ phase: 'queued', runId });
      timer.current = setTimeout(() => { void poll(runId, actionGeneration, attempt + 1); }, [600, 1200, 2000, 3000, 5000][attempt]);
    } catch (error) { if (owns()) setState({ phase: [401, 403, 404].includes((error as ApiFailure)?.status ?? 0) ? 'failed' : 'waiting', runId, error }); }
  };
  const submit = async () => {
    if (busy.current || !current() || !allowed || !context) return;
    busy.current = true; const actionGeneration = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    if (!intent.current) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as { idempotencyKey?: unknown; runId?: unknown } | null;
        if (saved && typeof saved.idempotencyKey === 'string' && /^workspace-proof:[a-f0-9-]{36}$/.test(saved.idempotencyKey)) intent.current = { idempotencyKey: saved.idempotencyKey };
      } catch { /* Storage is optional; the server remains the idempotency authority. */ }
      intent.current ??= { idempotencyKey: `workspace-proof:${crypto.randomUUID()}` };
    }
    const persist = () => { try { sessionStorage.setItem(storageKey, JSON.stringify(intent.current)); } catch { /* Keep the in-memory retry key when storage is unavailable. */ } };
    persist();
    if (intent.current.runId) { setState({ phase: 'queued', runId: intent.current.runId }); busy.current = false; void poll(intent.current.runId, actionGeneration); return; }
    setState({ phase: 'submitting' });
    try {
      const response = await customerWorkspaceApi.requestFieldProof(tenantId, { jobId: job.id, expectedSourceVersion: job.version, directoryContext: { organizationId: context.organizationId, siteId: context.siteId, contactId: context.contactId, revision: context.revision }, idempotencyKey: intent.current.idempotencyKey });
      if (!current() || generation.current !== actionGeneration) return;
      if (!isWorkspaceId(response.run?.id)) throw new Error('Unconfirmed handoff response');
      intent.current.runId = response.run.id; persist();
      setState({ phase: 'queued', runId: response.run.id });
      void poll(response.run.id, actionGeneration);
    } catch (error) { if (current() && generation.current === actionGeneration) setState({ phase: 'failed', error }); }
    finally { if (current() && generation.current === actionGeneration) busy.current = false; }
  };

  const site = detail.sites.find(item => item.id === context?.siteId);
  const contact = detail.contacts.find(item => item.id === context?.contactId);
  const links = (Array.isArray(state?.result?.links) ? state.result.links : []).flatMap(link => {
    const href = customerWorkspaceResultLink(link.destination_deep_link);
    return href ? [{ href, label: href.includes('/reports/') ? 'Open draft report' : 'Open field job' }] : [];
  });
  const active = state?.phase === 'submitting' || state?.phase === 'queued';
  const failure = state?.error as ApiFailure | undefined;
  const knownFailure = Boolean(state?.runId || (failure?.status && failure.status >= 400 && failure.status < 500));
  const needsReconciliation = ['FABRIC_CUSTOMER_LINK_AMBIGUOUS', 'FABRIC_IDEMPOTENCY_CONFLICT', 'CUSTOMER_CONTEXT_CHANGED', 'FABRIC_SOURCE_VERSION_CHANGED'].includes(failure?.code ?? '');
  return <section className={styles.handoff} aria-labelledby="field-proof-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>Carry the saved details forward</span><h2 id="field-proof-title">Prepare field proof</h2></div><FileCheck2 size={23} aria-hidden="true" /></div><p>Create a SnapProof field-job and report draft from <strong>{job.title}</strong>, using the job’s saved customer links.</p>
    {!allowed && <p className={styles.readOnly} role="status"><ShieldCheck size={17} aria-hidden="true" />{!actionableJob(job, detail) ? 'This job’s saved customer links need review in TradeFlowKit before they can be carried forward.' : 'This handoff is not currently available. Write access and current workflow readiness are required in both TradeFlowKit and SnapProof.'}</p>}
    {allowed && !state && <button type="button" className={styles.primary} onClick={() => { if (current()) setState({ phase: 'review' }); }}>Review field-proof handoff<ArrowRight size={17} aria-hidden="true" /></button>}
    {state?.phase === 'review' && <div className={styles.review}><h3>Review the job’s customer context</h3><dl><dt>Customer</dt><dd>{detail.customer.name}</dd><dt>Site</dt><dd>{site?.name || (context?.siteId ? 'Uses the job’s saved site · details outside this view' : 'No specific site saved on this job')}</dd><dt>Contact</dt><dd>{contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : context?.contactId ? 'Uses the job’s saved contact · details outside this view' : 'No specific contact saved on this job'}</dd><dt>Source</dt><dd>{job.number === null ? 'Saved TradeFlow job' : `Job #${job.number}`} · {job.title}</dd></dl><ModuleLaunchLink className={styles.textLink} href={`/modules/tradeflowkit/jobs/${job.id}`}>Open original job<ArrowRight size={15} aria-hidden="true" /></ModuleLaunchLink><p>SnapProof prepares new drafts using these links. This handoff does not edit existing reports or billing records.</p><div className={styles.actions}><button type="button" onClick={() => setState(null)}>Cancel</button><button type="button" className={styles.primary} onClick={() => void submit()} disabled={!allowed}>Create field-proof draft<ArrowRight size={17} aria-hidden="true" /></button></div></div>}
    {active && <div className={styles.progress} role="status" aria-live="polite" aria-busy="true"><RefreshCw size={18} aria-hidden="true" /><div><strong>{state.phase === 'submitting' ? 'Submitting the reviewed handoff…' : 'Handoff queued'}</strong><p>{state.phase === 'submitting' ? 'Waiting for the server to confirm this request.' : 'Drafts are being prepared. Queued does not yet mean delivered.'}</p></div></div>}
    {(state?.phase === 'completed' || state?.phase === 'partial') && <div className={styles.result} role="status" aria-live="polite"><CheckCircle2 size={22} aria-hidden="true" /><div><strong>{state.phase === 'completed' ? 'Field-proof drafts ready' : 'Some draft items were prepared'}</strong><p>{state.phase === 'completed' ? 'Open the prepared items to review and continue the work in SnapProof.' : 'The handoff is partially complete. Review the available items and its remaining workflow issue.'}</p><div className={styles.actions}>{links.map(link => <ModuleLaunchLink key={link.href} className={styles.primary} href={link.href}>{link.label}<ArrowRight size={16} aria-hidden="true" /></ModuleLaunchLink>)}{links.length === 0 && <p>Result links could not be verified. Review the handoff before opening a draft.</p>}</div></div></div>}
    {state?.phase === 'waiting' && <div className={styles.notice} role="status"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Preparation is not yet confirmed</strong><p>{state.error ? 'The latest status could not be read. Check the same handoff again.' : 'This handoff is still pending. Checking again follows the existing request.'}</p><button type="button" onClick={() => { if (state.runId) void poll(state.runId, generation.current); }}>Check handoff status</button></div></div>}
    {state?.phase === 'failed' && <div className={styles.notice} role="alert"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Handoff needs attention</strong><p>{failureMessage(state.error, true)}</p><div className={styles.actions}>{knownFailure && <button type="button" onClick={reload}>Reload customer details</button>}{needsReconciliation && <ModuleLaunchLink className={styles.textLink} href={`/modules/tradeflowkit/jobs/${job.id}`}>Open original job<ArrowRight size={15} aria-hidden="true" /></ModuleLaunchLink>}{!needsReconciliation && <button type="button" onClick={() => void submit()} disabled={!allowed}>Check or retry this handoff</button>}</div></div></div>}
  </section>;
}
