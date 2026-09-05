'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Cable, CheckCircle2, Loader2, RefreshCw, Send, Settings2, ShieldCheck, Workflow } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';

type LeadRef = { id: string; name: string; email: string | null; phone: string | null };
type LeadSettingsState = {
  settings: {
    id: string;
    followUpEnabled: boolean;
    emailEnabled: boolean;
    smsEnabled: boolean;
    tradeTemplate: string;
    serviceArea: string | null;
    emailTemplate: string;
    smsTemplate: string;
    leadSources: string[];
    version: number;
  };
  captureForm: {
    id: string;
    name: string;
    sourceLabel: string;
    defaultService: string | null;
    successMessage: string;
    publicIntakeEnabled: boolean;
    hasPublicToken: boolean;
    privacyNoticeUrl: string | null;
    consentText: string | null;
    consentVersion: string | null;
    allowedAdapterKeys: string[];
    version: number;
  };
  templates: Array<{ key: string; label: string; description: string; serviceCategories: string[] }>;
  delivery: { mode: string; note: string };
  publicIntake: { enabled: boolean; configured: boolean; publicPath: string | null; adapterKeys: string[] };
};
type SourceAdapter = { key: string; name: string; description: string; publicIngress: boolean; validationMode: string };
type SourceEvent = { id: string; adapterKey: string; eventType: string; status: string; metadata: Record<string, unknown>; createdAt: string };
type Followup = { id: string; stepNumber: number; channel: 'email' | 'sms'; dueAt: string; status: string; version: number };

function errorText(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') return error.error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function friendlyConnectionStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (['validated', 'success', 'ready', 'active', 'completed'].includes(normalized)) return 'Connection checked';
  if (['failed', 'error', 'invalid'].includes(normalized)) return 'Needs attention';
  if (['pending', 'queued', 'processing'].includes(normalized)) return 'Check in progress';
  return 'Settings updated';
}

export default function TradeFlowKitLeadOperations({
  tenantKey,
  canManage,
  leads,
}: {
  tenantKey: string;
  canManage: boolean;
  leads: LeadRef[];
}) {
  const [state, setState] = useState<LeadSettingsState | null>(null);
  const [adapters, setAdapters] = useState<SourceAdapter[]>([]);
  const [events, setEvents] = useState<SourceEvent[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secretOutput, setSecretOutput] = useState<string | null>(null);
  const [form, setForm] = useState({
    followUpEnabled: false,
    emailEnabled: true,
    smsEnabled: false,
    serviceArea: '',
    emailTemplate: '',
    smsTemplate: '',
    leadSources: 'manual',
    captureName: '',
    sourceLabel: '',
    defaultService: '',
    successMessage: '',
    publicIntakeEnabled: false,
    privacyNoticeUrl: '',
    consentText: '',
    consentVersion: '',
    allowedAdapterKeys: 'n8n',
  });

  function adopt(next: LeadSettingsState) {
    setState(next);
    setForm({
      followUpEnabled: next.settings.followUpEnabled,
      emailEnabled: next.settings.emailEnabled,
      smsEnabled: next.settings.smsEnabled,
      serviceArea: next.settings.serviceArea ?? '',
      emailTemplate: next.settings.emailTemplate,
      smsTemplate: next.settings.smsTemplate,
      leadSources: next.settings.leadSources.join(', '),
      captureName: next.captureForm.name,
      sourceLabel: next.captureForm.sourceLabel,
      defaultService: next.captureForm.defaultService ?? '',
      successMessage: next.captureForm.successMessage,
      publicIntakeEnabled: next.captureForm.publicIntakeEnabled,
      privacyNoticeUrl: next.captureForm.privacyNoticeUrl ?? '',
      consentText: next.captureForm.consentText ?? '',
      consentVersion: next.captureForm.consentVersion ?? '',
      allowedAdapterKeys: next.captureForm.allowedAdapterKeys.join(', '),
    });
  }

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const [settingsResult, adaptersResult, eventsResult] = await Promise.all([
        moduleShellApi.tradeflowkit.leadOperationsSettings(),
        moduleShellApi.tradeflowkit.leadSourceAdapters(),
        moduleShellApi.tradeflowkit.leadSourceEvents(),
      ]);
      adopt(settingsResult as LeadSettingsState);
      setAdapters(Array.isArray(adaptersResult?.adapters) ? adaptersResult.adapters : []);
      setEvents(Array.isArray(eventsResult?.events) ? eventsResult.events : []);
    } catch (requestError) {
      setError(errorText(requestError, 'Could not load lead operations.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadWorkspace(); }, [tenantKey]);

  useEffect(() => {
    if (!selectedLeadId && leads[0]) setSelectedLeadId(leads[0].id);
    if (selectedLeadId && !leads.some(lead => lead.id === selectedLeadId)) setSelectedLeadId(leads[0]?.id ?? '');
  }, [leads, selectedLeadId]);

  useEffect(() => {
    if (!selectedLeadId) { setFollowups([]); return; }
    let cancelled = false;
    moduleShellApi.tradeflowkit.leadFollowups(selectedLeadId)
      .then((response: any) => { if (!cancelled) setFollowups(Array.isArray(response?.followups) ? response.followups : []); })
      .catch((requestError: unknown) => { if (!cancelled) setError(errorText(requestError, 'Could not load lead follow-ups.')); });
    return () => { cancelled = true; };
  }, [selectedLeadId, tenantKey]);

  const pendingCount = useMemo(() => followups.filter(item => item.status === 'pending' || item.status === 'failed').length, [followups]);

  async function saveSettings() {
    if (!canManage || !state || busy) return;
    setBusy('settings'); setError(null); setNotice(null);
    try {
      const next = await moduleShellApi.tradeflowkit.updateLeadOperationsSettings({
        expectedVersion: state.settings.version,
        expectedCaptureFormVersion: state.captureForm.version,
        followUpEnabled: form.followUpEnabled,
        emailEnabled: form.emailEnabled,
        smsEnabled: form.smsEnabled,
        serviceArea: form.serviceArea,
        emailTemplate: form.emailTemplate,
        smsTemplate: form.smsTemplate,
        leadSources: form.leadSources.split(',').map(item => item.trim()).filter(Boolean),
        captureForm: {
          name: form.captureName,
          sourceLabel: form.sourceLabel,
          defaultService: form.defaultService,
          successMessage: form.successMessage,
        },
      });
      adopt(next as LeadSettingsState);
      setNotice('Lead operations settings saved. New leads will use the current follow-up sequence.');
    } catch (requestError) { setError(errorText(requestError, 'Could not save lead settings.')); }
    finally { setBusy(null); }
  }

  async function applyTemplate(templateKey: string) {
    if (!canManage || !state || busy) return;
    setBusy(`template:${templateKey}`); setError(null); setNotice(null);
    try {
      const next = await moduleShellApi.tradeflowkit.applyLeadOperationsTemplate({
        templateKey,
        expectedVersion: state.settings.version,
        expectedCaptureFormVersion: state.captureForm.version,
      });
      adopt(next as LeadSettingsState);
      const eventResult = await moduleShellApi.tradeflowkit.leadSourceEvents();
      setEvents(Array.isArray(eventResult?.events) ? eventResult.events : []);
      setNotice('Trade playbook applied. Its follow-up sequence will be scheduled for newly created leads.');
    } catch (requestError) { setError(errorText(requestError, 'Could not apply the trade template.')); }
    finally { setBusy(null); }
  }

  async function validateAdapter(adapterKey: string) {
    if (!canManage || busy) return;
    setBusy(`adapter:${adapterKey}`); setError(null); setNotice(null);
    try {
      await moduleShellApi.tradeflowkit.validateLeadSourceAdapter(adapterKey, {
        name: 'Adapter contract check',
        email: 'adapter-check@example.invalid',
        serviceType: 'Contract validation',
        consentToSms: false,
      }, `lead-adapter-${adapterKey}-${crypto.randomUUID()}`);
      const eventResult = await moduleShellApi.tradeflowkit.leadSourceEvents();
      setEvents(Array.isArray(eventResult?.events) ? eventResult.events : []);
      setNotice(`${adapterKey} connection check passed. No lead was created and no sample values were retained.`);
    } catch (requestError) { setError(errorText(requestError, 'Could not validate the integration.')); }
    finally { setBusy(null); }
  }

  async function testEmail() {
    if (!canManage || !state || busy) return;
    setBusy('test-email'); setError(null); setNotice(null);
    try {
      const result = await moduleShellApi.tradeflowkit.testLeadOperationsEmail(state.settings.version, `lead-test-email-${crypto.randomUUID()}`);
      setNotice(`Test email ${result.duplicate ? 'was already' : 'is'} queued to your signed-in email.`);
    } catch (requestError) { setError(errorText(requestError, 'Could not queue the test email.')); }
    finally { setBusy(null); }
  }

  async function updatePublicIntake(action: 'save' | 'rotate' | 'reveal') {
    if (!canManage || !state || busy) return;
    setBusy(`public:${action}`); setError(null); setNotice(null); setSecretOutput(null);
    try {
      const result = await moduleShellApi.tradeflowkit.updateLeadCaptureForm(state.captureForm.id, {
        expectedVersion: state.captureForm.version,
        publicIntakeEnabled: form.publicIntakeEnabled,
        privacyNoticeUrl: form.privacyNoticeUrl,
        consentText: form.consentText,
        consentVersion: form.consentVersion,
        allowedAdapterKeys: form.allowedAdapterKeys.split(',').map(item => item.trim()).filter(Boolean),
        rotateToken: action === 'rotate',
        revealAdapterSecrets: action === 'reveal',
      });
      setState(current => current ? {
        ...current,
        captureForm: result.captureForm,
        publicIntake: {
          enabled: result.captureForm.publicIntakeEnabled,
          configured: result.captureForm.hasPublicToken && !!result.captureForm.privacyNoticeUrl && !!result.captureForm.consentText && !!result.captureForm.consentVersion,
          publicPath: result.captureForm.publicPath,
          adapterKeys: result.captureForm.allowedAdapterKeys,
        },
      } : current);
      if (result.publicToken || result.adapterSecrets) {
        setSecretOutput(JSON.stringify({
          ...(result.publicToken ? { publicUrl: `${window.location.origin}/public/tradeflowkit/leads/${result.publicToken}` } : {}),
          ...(result.adapterSecrets ? { adapterSecrets: result.adapterSecrets } : {}),
        }, null, 2));
      }
      setNotice(action === 'rotate' ? 'Public intake token rotated. Copy the new URL now.' : action === 'reveal' ? 'Integration keys revealed for this admin session. Copy them now.' : 'Public intake settings saved.');
    } catch (requestError) { setError(errorText(requestError, 'Could not update public intake.')); }
    finally { setBusy(null); }
  }

  async function actionFollowup(item: Followup, action: 'queue' | 'complete') {
    if (!canManage || !selectedLeadId || busy) return;
    setBusy(`${action}:${item.id}`); setError(null); setNotice(null);
    try {
      const updated = action === 'queue'
        ? (await moduleShellApi.tradeflowkit.queueLeadFollowup(selectedLeadId, item.id, item.version, `lead-followup-${item.id}-${crypto.randomUUID()}`)).followup
        : await moduleShellApi.tradeflowkit.completeLeadFollowup(selectedLeadId, item.id, item.version);
      setFollowups(current => current.map(row => row.id === item.id ? updated : row));
      setNotice(action === 'queue' ? 'Follow-up queued through the shared OperatorOS outbox.' : 'Follow-up marked complete.');
    } catch (requestError) { setError(errorText(requestError, `Could not ${action} the follow-up.`)); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="tfk-lead-ops-state" data-testid="tradeflowkit-lead-operations-loading"><Loader2 className="tfk-spin" size={18} /> Loading lead operations…</div>;
  if (!state) return <div className="tfk-lead-ops-state">Lead operations are unavailable. Use refresh after resolving the error.</div>;

  return (
    <section className="tfk-lead-ops" data-testid="tradeflowkit-lead-operations">
      <style>{leadOperationsCss}</style>
      <header>
        <div><span>Conversion playbook</span><h3>Lead Operations</h3><p>Choose how new leads enter TradeFlowKit and what follow-up should happen next.</p></div>
        <button type="button" onClick={() => void loadWorkspace()} disabled={!!busy}><RefreshCw size={14} /> Refresh</button>
      </header>
      {error && <div className="tfk-lead-ops-error" role="alert">{error}</div>}
      {notice && <div className="tfk-lead-ops-notice" role="status" data-testid="tradeflowkit-lead-operations-status">{notice}</div>}
      <div className="tfk-lead-ops-boundary"><ShieldCheck size={17} /><div><strong>Public intake {state.publicIntake.enabled ? 'enabled' : 'disabled'}</strong><span>{state.publicIntake.configured ? 'Privacy, consent, abuse protection, and approved integrations are configured.' : 'Add a privacy notice and consent version, then create a secure intake link before enabling.'}</span></div></div>

      <div className="tfk-lead-ops-grid">
        <article className="tfk-lead-ops-card">
          <div className="tfk-lead-ops-title"><Settings2 size={17} /><div><strong>Trade playbook</strong><span>Current: {state.settings.tradeTemplate.replaceAll('_', ' ')}</span></div></div>
          <label>Template<select value={state.settings.tradeTemplate} onChange={event => void applyTemplate(event.target.value)} disabled={!canManage || !!busy} data-testid="tradeflowkit-lead-template">
            {state.templates.map(template => <option key={template.key} value={template.key}>{template.label}</option>)}
          </select></label>
          <label>Service area<input value={form.serviceArea} maxLength={500} disabled={!canManage} onChange={event => setForm(current => ({ ...current, serviceArea: event.target.value }))} /></label>
          <label>Where leads come from<input value={form.leadSources} maxLength={800} disabled={!canManage} onChange={event => setForm(current => ({ ...current, leadSources: event.target.value }))} /></label>
          <div className="tfk-lead-capture-grid">
            <label>Intake form name<input value={form.captureName} maxLength={160} disabled={!canManage} onChange={event => setForm(current => ({ ...current, captureName: event.target.value }))} /></label>
            <label>Lead source shown to your team<input value={form.sourceLabel} maxLength={160} disabled={!canManage} onChange={event => setForm(current => ({ ...current, sourceLabel: event.target.value }))} /></label>
            <label>Default service<input value={form.defaultService} maxLength={160} disabled={!canManage} onChange={event => setForm(current => ({ ...current, defaultService: event.target.value }))} /></label>
            <label>Success copy<input value={form.successMessage} maxLength={500} disabled={!canManage} onChange={event => setForm(current => ({ ...current, successMessage: event.target.value }))} /></label>
          </div>
          <div className="tfk-lead-ops-checks">
            <label><input type="checkbox" checked={form.followUpEnabled} disabled={!canManage} onChange={event => setForm(current => ({ ...current, followUpEnabled: event.target.checked }))} /> Schedule follow-ups</label>
            <label><input type="checkbox" checked={form.emailEnabled} disabled={!canManage} onChange={event => setForm(current => ({ ...current, emailEnabled: event.target.checked }))} /> Email queue</label>
            <label><input type="checkbox" checked={form.smsEnabled} disabled={!canManage} onChange={event => setForm(current => ({ ...current, smsEnabled: event.target.checked }))} /> Consent-gated SMS queue</label>
          </div>
          <label>Email template<textarea rows={3} value={form.emailTemplate} maxLength={4000} disabled={!canManage} onChange={event => setForm(current => ({ ...current, emailTemplate: event.target.value }))} /></label>
          <label>SMS template<textarea rows={2} value={form.smsTemplate} maxLength={1000} disabled={!canManage} onChange={event => setForm(current => ({ ...current, smsTemplate: event.target.value }))} /></label>
          <button type="button" className="tfk-lead-ops-primary" disabled={!canManage || !!busy} onClick={() => void saveSettings()} data-testid="tradeflowkit-lead-settings-save">{busy === 'settings' ? <Loader2 className="tfk-spin" size={14} /> : <CheckCircle2 size={14} />} Save settings</button>
        </article>

        <article className="tfk-lead-ops-card tfk-lead-ops-wide" data-testid="tradeflowkit-public-intake-settings">
          <div className="tfk-lead-ops-title"><ShieldCheck size={17} /><div><strong>Public lead intake</strong><span>Secure link, recorded consent, abuse protection, and optional verified integrations.</span></div></div>
          <div className="tfk-lead-capture-grid">
            <label>Privacy notice URL<input type="url" placeholder="https://example.com/privacy" value={form.privacyNoticeUrl} maxLength={500} disabled={!canManage} onChange={event => setForm(current => ({ ...current, privacyNoticeUrl: event.target.value }))} /></label>
            <label>Consent notice version<input placeholder="privacy-2026-08" value={form.consentVersion} maxLength={40} disabled={!canManage} onChange={event => setForm(current => ({ ...current, consentVersion: event.target.value }))} /></label>
            <label>Allowed connection tools<input placeholder="n8n, generic-json" value={form.allowedAdapterKeys} maxLength={100} disabled={!canManage} onChange={event => setForm(current => ({ ...current, allowedAdapterKeys: event.target.value }))} /></label>
            <label className="tfk-lead-ops-toggle"><input type="checkbox" checked={form.publicIntakeEnabled} disabled={!canManage} onChange={event => setForm(current => ({ ...current, publicIntakeEnabled: event.target.checked }))} /> Enable public intake</label>
          </div>
          <label>Consent text<textarea rows={2} value={form.consentText} maxLength={1000} disabled={!canManage} onChange={event => setForm(current => ({ ...current, consentText: event.target.value }))} /></label>
          <div className="tfk-lead-ops-actions">
            <button type="button" className="tfk-lead-ops-primary" disabled={!canManage || !!busy} onClick={() => void updatePublicIntake('save')}>Save intake</button>
            <button type="button" disabled={!canManage || !!busy} onClick={() => void updatePublicIntake('rotate')}>Replace public intake link</button>
            <button type="button" disabled={!canManage || !!busy || state.captureForm.allowedAdapterKeys.length === 0} onClick={() => void updatePublicIntake('reveal')}>Show one-time connection keys</button>
          </div>
          {secretOutput && <div className="tfk-lead-secret"><strong>Copy these connection keys now</strong><span>Store them in the connection tool now. They will not be shown again, and should not be pasted into tickets or browser code.</span><textarea readOnly rows={5} value={secretOutput} onFocus={event => event.currentTarget.select()} /></div>}
        </article>

        <article className="tfk-lead-ops-card">
          <div className="tfk-lead-ops-title"><Workflow size={17} /><div><strong>Follow-up queue</strong><span>{pendingCount} ready to action</span></div></div>
          <label>Lead<select value={selectedLeadId} onChange={event => setSelectedLeadId(event.target.value)} disabled={leads.length === 0} data-testid="tradeflowkit-followup-lead-select"><option value="">Select a lead</option>{leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
          {selectedLeadId && followups.length > 0 ? <div className="tfk-lead-followups">{followups.map(item => <div key={item.id} data-testid={`tradeflowkit-followup-${item.id}`}><div><strong>Step {item.stepNumber} · {item.channel.toUpperCase()}</strong><span>{new Date(item.dueAt).toLocaleString()} · {item.status}</span></div>{canManage && ['pending', 'failed'].includes(item.status) ? <div><button type="button" disabled={!!busy} onClick={() => void actionFollowup(item, 'queue')}><Send size={13} /> Queue</button><button type="button" disabled={!!busy} onClick={() => void actionFollowup(item, 'complete')}>Complete</button></div> : canManage && item.status === 'queued' ? <button type="button" disabled={!!busy} onClick={() => void actionFollowup(item, 'complete')}>Mark handled</button> : null}</div>)}</div> : <div className="tfk-lead-ops-empty">{selectedLeadId ? 'No follow-ups are scheduled for this lead. Templates apply to newly created leads.' : 'Create or select a lead to inspect its follow-up plan.'}</div>}
          <div className="tfk-lead-ops-divider" />
          <div className="tfk-lead-ops-title"><Send size={17} /><div><strong>Delivery check</strong><span>The test will go to your signed-in email.</span></div></div>
          <button type="button" disabled={!canManage || !!busy || !state.settings.emailEnabled} onClick={() => void testEmail()} data-testid="tradeflowkit-lead-test-email">{busy === 'test-email' ? <Loader2 className="tfk-spin" size={14} /> : <Send size={14} />} Send test email</button>
          <p className="tfk-lead-ops-note">{state.delivery.note}</p>
        </article>

        <article className="tfk-lead-ops-card tfk-lead-ops-wide">
          <div className="tfk-lead-ops-title"><Cable size={17} /><div><strong>Lead source connection check</strong><span>Check that incoming lead details land in the right fields before turning a connection on. This check does not create a lead.</span></div></div>
          <div className="tfk-lead-adapters">{adapters.map(adapter => <div key={adapter.key} data-testid={`tradeflowkit-adapter-${adapter.key}`}><div><strong>{adapter.name}</strong><span>{adapter.description}</span></div><button type="button" disabled={!canManage || !!busy} onClick={() => void validateAdapter(adapter.key)}>{busy === `adapter:${adapter.key}` ? <Loader2 className="tfk-spin" size={13} /> : <ShieldCheck size={13} />} Check connection</button></div>)}</div>
          <div className="tfk-lead-events"><strong>Recent connection activity</strong>{events.length === 0 ? <span>No connection checks or settings changes yet.</span> : events.slice(0, 8).map(event => <div key={event.id}><span>{adapters.find(adapter => adapter.key === event.adapterKey)?.name ?? 'Lead connection'} · {friendlyConnectionStatus(event.status)}<details><summary>Technical details</summary><code>{event.adapterKey} · {event.eventType} · {event.status}</code></details></span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div>
        </article>
      </div>
    </section>
  );
}

const leadOperationsCss = `
  .tfk-lead-ops { border:1px solid color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius:9px; background:var(--tfk-card); padding:14px; display:grid; gap:12px; }
  .tfk-lead-ops > header { display:flex; justify-content:space-between; gap:16px; align-items:start; }
  .tfk-lead-ops > header span { color:var(--tfk-primary); font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
  .tfk-lead-ops h3 { margin:3px 0; font-size:17px; } .tfk-lead-ops p { margin:0; color:#587067; font-size:12px; line-height:1.45; }
  .tfk-lead-ops button { border:1px solid color-mix(in srgb, var(--tfk-primary) 25%, transparent); border-radius:6px; padding:7px 9px; background:#fff; color:var(--tfk-primary-hover); display:inline-flex; align-items:center; justify-content:center; gap:5px; font:inherit; font-size:11px; font-weight:800; cursor:pointer; }
  .tfk-lead-ops button:disabled { opacity:.5; cursor:not-allowed; } .tfk-lead-ops-primary { background:var(--tfk-primary)!important; color:#fff!important; }
  .tfk-lead-ops-error,.tfk-lead-ops-notice,.tfk-lead-ops-boundary { border-radius:7px; padding:9px 11px; font-size:12px; }
  .tfk-lead-ops-error { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; } .tfk-lead-ops-notice { background:var(--tfk-primary-soft); color:#166534; border:1px solid #bbf7d0; }
  .tfk-lead-ops-boundary { display:flex; gap:8px; align-items:start; background:#fffbeb; color:#854d0e; border:1px solid #fde68a; } .tfk-lead-ops-boundary div { display:grid; gap:2px; } .tfk-lead-ops-boundary span { font-size:11px; line-height:1.4; }
  .tfk-lead-ops-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .tfk-lead-ops-card { background:#fff; border:1px solid color-mix(in srgb, var(--tfk-primary) 14%, transparent); border-radius:8px; padding:12px; display:grid; gap:10px; align-content:start; } .tfk-lead-ops-wide { grid-column:1/-1; }
  .tfk-lead-ops-title { display:flex; gap:7px; align-items:start; color:var(--tfk-primary-hover); } .tfk-lead-ops-title div { display:grid; gap:2px; } .tfk-lead-ops-title strong { color:#10231d; font-size:13px; } .tfk-lead-ops-title span { color:#587067; font-size:10px; }
  .tfk-lead-ops-card > label,.tfk-lead-capture-grid label { display:grid; gap:4px; color:#587067; font-size:10px; font-weight:800; } .tfk-lead-ops input,.tfk-lead-ops select,.tfk-lead-ops textarea { width:100%; box-sizing:border-box; border:1px solid color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius:6px; padding:8px; background:#fff; color:#10231d; font:inherit; font-size:12px; }
  .tfk-lead-capture-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:9px; border:1px solid color-mix(in srgb, var(--tfk-primary) 12%, transparent); border-radius:7px; background:var(--tfk-card); }
  .tfk-lead-ops-checks { display:flex; flex-wrap:wrap; gap:8px 12px; } .tfk-lead-ops-checks label { display:flex; gap:5px; align-items:center; font-size:10px; color:#365c4e; } .tfk-lead-ops-checks input { width:14px; height:14px; }
  .tfk-lead-ops-toggle { display:flex!important; align-items:center; gap:7px!important; align-self:end; min-height:34px; } .tfk-lead-ops-toggle input { width:16px; height:16px; } .tfk-lead-ops-actions { display:flex; flex-wrap:wrap; gap:7px; } .tfk-lead-secret { display:grid; gap:5px; padding:9px; border:1px solid #f59e0b; background:#fffbeb; border-radius:7px; color:#854d0e; font-size:11px; } .tfk-lead-secret textarea { font-family:ui-monospace,monospace; font-size:10px; }
  .tfk-lead-followups,.tfk-lead-adapters,.tfk-lead-events { display:grid; gap:6px; } .tfk-lead-followups > div,.tfk-lead-adapters > div { border:1px solid color-mix(in srgb, var(--tfk-primary) 12%, transparent); border-radius:6px; padding:8px; display:flex; gap:8px; justify-content:space-between; align-items:center; } .tfk-lead-followups > div > div,.tfk-lead-adapters > div > div { display:grid; gap:2px; min-width:0; } .tfk-lead-followups span,.tfk-lead-adapters span { color:#587067; font-size:10px; line-height:1.35; }
  .tfk-lead-ops-empty { border:1px dashed color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius:6px; padding:14px; color:#587067; font-size:11px; text-align:center; } .tfk-lead-ops-divider { height:1px; background:color-mix(in srgb, var(--tfk-primary) 12%, transparent); margin:2px 0; } .tfk-lead-ops-note { font-size:10px!important; }
  .tfk-lead-events > strong { font-size:11px; } .tfk-lead-events > div { display:flex; justify-content:space-between; gap:8px; border-top:1px solid color-mix(in srgb, var(--tfk-primary) 9%, transparent); padding-top:5px; font-size:10px; } .tfk-lead-events time { color:#789189; }
  .tfk-lead-ops-state { min-height:80px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px dashed color-mix(in srgb, var(--tfk-primary) 20%, transparent); border-radius:8px; color:#587067; font-size:12px; }
  @media(max-width:760px){ .tfk-lead-ops-grid,.tfk-lead-capture-grid{grid-template-columns:1fr}.tfk-lead-ops-wide{grid-column:auto}.tfk-lead-ops>header{flex-direction:column}.tfk-lead-ops>header button{width:100%}.tfk-lead-followups>div,.tfk-lead-adapters>div{align-items:stretch;flex-direction:column}.tfk-lead-events>div{flex-direction:column} }
`;
