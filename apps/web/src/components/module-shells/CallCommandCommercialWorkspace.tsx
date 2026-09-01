'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDollarSign, Clock3,
  CreditCard, FileText, GitBranch, HeartPulse, Loader2, PhoneCall, Plus,
  Radio, RefreshCw, Search, ShieldCheck, Sparkles, Users, Workflow,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import type { CallCommandRouteArea } from './CallCommandRoute.contract';

type Row = Record<string, any>;
type ProductWorkspace = {
  channels: Row[]; profiles: Row[]; targets: Row[]; flows: Row[]; rules: Row[];
  calls: Row[]; tickets: Row[]; leads: Row[]; tasks: Row[]; sessions: Row[];
  actionRuns: Row[]; analytics: Row; usage: Row[]; providers: Row;
};

const panel: React.CSSProperties = {
  ...cardStyle,
  background: 'linear-gradient(145deg,rgba(7,18,27,.99),rgba(9,31,33,.97))',
  borderColor: 'rgba(45,212,191,.2)',
  boxShadow: '0 18px 55px rgba(0,0,0,.23)',
};
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', color: semantic.text, background: '#061117',
  border: '1px solid rgba(94,234,212,.27)', borderRadius: radius.sm, padding: '10px 11px', colorScheme: 'dark',
};
const primary: React.CSSProperties = {
  border: 0, borderRadius: radius.sm, padding: '10px 14px', background: 'linear-gradient(135deg,#115e59,#047857)',
  color: '#fff', fontWeight: 850, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};
const quiet: React.CSSProperties = { ...primary, background: '#102630', border: '1px solid rgba(94,234,212,.22)' };

const TEMPLATES = {
  receptionist: { label: 'AI receptionist', description: 'Answer, understand the request, resolve common questions, transfer when needed, and create a follow-up task.', action: 'task', actionTitle: 'Review caller follow-up' },
  support: { label: 'Support desk', description: 'Collect the issue and urgency, route urgent calls, and create a support ticket.', action: 'ticket', actionTitle: 'Respond to support caller' },
  after_hours: { label: 'After hours', description: 'Explain that the business is closed, collect the request, and notify the team for urgent follow-up.', action: 'task', actionTitle: 'Review after-hours request' },
  lead_capture: { label: 'Lead capture', description: 'Collect prospect details and buying intent, then create a sales lead for follow-up.', action: 'lead', actionTitle: 'Contact new phone lead' },
} as const;

function errorMessage(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}

function rows(value: unknown): Row[] { return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Row[] : []; }
function nested(value: Row | null, path: string): unknown { return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Row)[key] : undefined, value); }
function firstValue(value: Row | null, paths: string[]): unknown { for (const path of paths) { const result = nested(value, path); if (result !== undefined && result !== null) return result; } return undefined; }
function firstBoolean(value: Row | null, paths: string[]): boolean { return firstValue(value, paths) === true; }
function firstNumber(value: Row | null, paths: string[]): number | null { const result = Number(firstValue(value, paths)); return Number.isFinite(result) ? result : null; }
function firstText(value: Row | null, paths: string[]): string { const result = firstValue(value, paths); return typeof result === 'string' ? result : ''; }
function isGeneralProduct(item: Row): boolean { return String(item.productMode ?? 'general') === 'general'; }
function businessHoursText(item: Row, fallback: string): string {
  const configured = item.businessHoursConfig;
  return configured && typeof configured === 'object' && typeof configured.description === 'string'
    ? configured.description
    : fallback;
}
function languageText(item: Row, fallback: string): string {
  const languages = Array.isArray(item.additionalLanguages)
    ? item.additionalLanguages.map((value: unknown) => String(value)).filter(Boolean)
    : [];
  return languages.length ? languages.join(', ') : typeof item.primaryLanguage === 'string' ? item.primaryLanguage : fallback;
}
function providerPriceText(item: Row): string {
  const amount = firstValue(item, ['cost.monthlyAmount', 'monthlyPrice', 'recurringCost']);
  const currency = firstText(item, ['cost.currency']) || 'USD';
  const numeric = typeof amount === 'number' ? amount : typeof amount === 'string' && amount.trim() ? Number(amount) : Number.NaN;
  if (Number.isFinite(numeric)) {
    return `${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(numeric)} per month, plus provider usage charges`;
  }
  return firstBoolean(item, ['cost.quoteRequired'])
    ? 'Provider quote required; recurring number and usage charges apply'
    : 'Provider recurring price was not returned; usage charges may also apply';
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: fontSize.sm }}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? '#34d399' : tone === 'warn' ? '#fbbf24' : tone === 'bad' ? '#fb7185' : '#94a3b8';
  return <span style={{ border: `1px solid ${color}55`, background: `${color}10`, color, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 850, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Heading({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 15 }}><span style={{ color: '#2dd4bf', marginTop: 2 }}>{icon}</span><div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2><p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>{subtitle}</p></div>{action}</div>;
}

function disabledStyle(enabled: boolean): React.CSSProperties { return enabled ? {} : { opacity: .5, cursor: 'not-allowed' }; }

export default function CallCommandCommercialWorkspace({ view, recordId, hrefFor }: { view: CallCommandRouteArea; recordId?: string; hrefFor: (path: string) => string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductWorkspace | null>(null);
  const [commercial, setCommercial] = useState<Row | null>(null);
  const [commercialUnavailable, setCommercialUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [numberPath, setNumberPath] = useState<'new' | 'forward' | 'provider'>('new');
  const [numberSearch, setNumberSearch] = useState({
    country: 'US', numberType: 'local' as 'local' | 'toll_free', areaCode: '',
    locality: '', region: '', postalCode: '', contains: '',
  });
  const [availableNumbers, setAvailableNumbers] = useState<Row[]>([]);
  const [existingNumber, setExistingNumber] = useState({ phone: '', connectionType: 'forwarding', friendlyName: 'Main business line' });
  const [provisionProfileId, setProvisionProfileId] = useState('');
  const [provisionFlowId, setProvisionFlowId] = useState('');
  const [connectionPlan, setConnectionPlan] = useState<Row | null>(null);
  const [numberChargeConfirmed, setNumberChargeConfirmed] = useState(false);
  const [releaseNumberId, setReleaseNumberId] = useState('');
  const [releasePhrase, setReleasePhrase] = useState('');
  const [agent, setAgent] = useState({ name: 'Business receptionist', businessName: '', department: 'Front desk', voice: 'alloy', greeting: 'Thank you for calling. How can I help you today?', tone: 'professional and friendly', purpose: 'Answer common questions, collect the reason for the call, and route callers to the right person.', businessDescription: '', languages: 'English', businessHours: 'Monday through Friday, 9:00 AM to 5:00 PM', fallbackBehavior: 'Take a message and create a follow-up task.' });
  const [agentBaseline, setAgentBaseline] = useState<Row | null>(null);
  const [editingAgentId, setEditingAgentId] = useState('');
  const [templateKey, setTemplateKey] = useState<keyof typeof TEMPLATES>('receptionist');
  const [flow, setFlow] = useState<{ name: string; description: string; channelId: string }>({ name: 'AI receptionist workflow', description: TEMPLATES.receptionist.description, channelId: '' });
  const [alerts, setAlerts] = useState({ emailEnabled: false, email: '', slackEnabled: false, slackEndpointId: '', webhookEnabled: false, webhookEndpointId: '' });
  const [transfer, setTransfer] = useState({ label: 'On-call team member', phone: '' });
  const [verificationCode, setVerificationCode] = useState<Record<string, string>>({});
  const [simulationTranscript, setSimulationTranscript] = useState('Caller needs help scheduling an appointment and asks to speak with a team member.');
  const [selectedCallId, setSelectedCallId] = useState(recordId ?? '');
  const [callDetail, setCallDetail] = useState<Row | null>(null);
  const [callDetailLoading, setCallDetailLoading] = useState(false);
  const [callQuery, setCallQuery] = useState('');
  const canWrite = commercial?.capabilities?.canWrite === true;
  const canAdmin = commercial?.capabilities?.canAdmin === true;

  const refresh = useCallback(async () => {
    const [productResult, commercialResult] = await Promise.allSettled([
      moduleShellApi.callcommand.productWorkspace(), moduleShellApi.callcommand.commercialWorkspace(),
    ]);
    if (productResult.status === 'rejected') throw productResult.reason;
    const value = productResult.value as ProductWorkspace;
    setProduct(value);
    const generalChannels = value.channels.filter(isGeneralProduct);
    const generalChannelIds = new Set(generalChannels.map(item => String(item.id)));
    const generalCalls = value.calls.filter(item => generalChannelIds.has(String(item.channelId ?? '')));
    setFlow(current => ({
      ...current,
      channelId: generalChannelIds.has(current.channelId) ? current.channelId : generalChannels[0]?.id || '',
    }));
    setSelectedCallId(current => {
      const candidate = current || recordId || '';
      return generalCalls.some(item => String(item.id) === candidate) ? candidate : String(generalCalls[0]?.id ?? '');
    });
    if (commercialResult.status === 'fulfilled') { setCommercial(commercialResult.value as Row); setCommercialUnavailable(false); }
    else { setCommercial(null); setCommercialUnavailable(true); }
  }, [recordId]);

  useEffect(() => { let active = true; setLoading(true); refresh().catch(caught => active && setError(errorMessage(caught, 'CallCommand could not be loaded.'))).finally(() => active && setLoading(false)); return () => { active = false; }; }, [refresh]);

  useEffect(() => {
    if (!selectedCallId || !product) { setCallDetail(null); setCallDetailLoading(false); return; }
    const generalChannelIds = new Set(product.channels.filter(isGeneralProduct).map(item => String(item.id)));
    const selected = product.calls.find(item => String(item.id) === selectedCallId && generalChannelIds.has(String(item.channelId ?? '')));
    if (!selected) { setCallDetail(null); setCallDetailLoading(false); return; }
    let active = true;
    setCallDetail(null);
    setCallDetailLoading(true);
    moduleShellApi.callcommand.productCall(selectedCallId)
      .then(value => { if (active) setCallDetail(value as Row); })
      .catch(caught => { if (active) { setCallDetail(null); setError(errorMessage(caught, 'This call record could not be loaded.')); } })
      .finally(() => { if (active) setCallDetailLoading(false); });
    return () => { active = false; };
  }, [product, selectedCallId]);

  async function run(key: string, operation: () => Promise<any>, success: string) {
    if (busy || !canWrite) return null;
    setBusy(key); setError(''); setNotice('');
    try {
      const result = await operation();
      setNotice(success);
      try { await refresh(); }
      catch (refreshError) { setError(`The change was saved, but the refreshed workspace could not be loaded: ${errorMessage(refreshError, 'refresh failed')}`); }
      return result;
    }
    catch (caught) { setError(errorMessage(caught, 'The operation could not be completed.')); return null; }
    finally { setBusy(''); }
  }

  const generalChannels = (product?.channels ?? []).filter(isGeneralProduct);
  const generalProfiles = (product?.profiles ?? []).filter(isGeneralProduct);
  const generalFlows = (product?.flows ?? []).filter(isGeneralProduct);
  const generalChannelIds = new Set(generalChannels.map(item => String(item.id)));
  const generalCalls = (product?.calls ?? []).filter(item => generalChannelIds.has(String(item.channelId ?? '')));
  const generalCallIds = new Set(generalCalls.map(item => String(item.id)));
  const commercialProduct = product ? {
    ...product,
    channels: generalChannels,
    profiles: generalProfiles,
    flows: generalFlows,
    calls: generalCalls,
    sessions: product.sessions.filter(item => generalChannelIds.has(String(item.channelId ?? ''))),
    actionRuns: product.actionRuns.filter(item => generalCallIds.has(String(item.callId ?? ''))),
    tickets: product.tickets.filter(item => !item.callId || generalCallIds.has(String(item.callId))),
    leads: product.leads.filter(item => !item.callId || generalCallIds.has(String(item.callId))),
    tasks: product.tasks.filter(item => !item.callId || generalCallIds.has(String(item.callId))),
  } : null;
  const activeChannel = generalChannels.find(item => item.id === flow.channelId) ?? generalChannels[0] ?? null;
  const assignedProfile = activeChannel?.profileId
    ? generalProfiles.find(item => item.id === activeChannel.profileId && item.status === 'active') ?? null
    : null;
  const availableProfile = assignedProfile ?? generalProfiles.find(item => item.status === 'active') ?? null;
  const activeFlow = activeChannel ? generalFlows.find(item => item.id === activeChannel.activeFlowId && item.status === 'active') ?? null : null;
  const endpoints = rows(product?.providers?.webhookEndpoints);
  const callRows = generalCalls.filter(item => !callQuery || `${item.subjectName ?? ''} ${item.phoneMasked ?? ''} ${item.summary ?? ''} ${item.status ?? ''}`.toLowerCase().includes(callQuery.toLowerCase()));
  const commercialNumbers = rows(firstValue(commercial, ['numbers', 'phoneNumbers', 'telephony.numbers']));
  const displayedNumbers = commercialNumbers.length ? commercialNumbers : generalChannels;
  const reconciliationIssues = rows(firstValue(commercial, ['numberReconciliationIssues']));
  const selectedCommercialNumber = activeChannel
    ? commercialNumbers.find(item => String(item.id) === String(activeChannel.id)) ?? null
    : null;
  const providerReady = selectedCommercialNumber?.providerReady === true;
  const numberVerified = Boolean(selectedCommercialNumber?.providerNumberStatus === 'active' && selectedCommercialNumber?.providerVerifiedAt);
  const routingVerified = Boolean(selectedCommercialNumber?.healthStatus === 'healthy' && selectedCommercialNumber?.healthCheckedAt);
  const numberBillingReady = !selectedCommercialNumber || ['included','active'].includes(String(selectedCommercialNumber.billingStatus ?? ''))
    || (selectedCommercialNumber.billingStatus === 'grace_period' && selectedCommercialNumber.billingGraceExpiresAt
      && new Date(selectedCommercialNumber.billingGraceExpiresAt).getTime() > Date.now());
  const realtimeConfigured = firstBoolean(commercial, ['readiness.realtimeConfigured', 'realtime.configured']);
  const realtimeModel = firstText(commercial, ['realtime.model', 'readiness.realtimeModel']);
  const runtimeSettings = (firstValue(commercial, ['runtime']) as Row | undefined) ?? {};
  const goLiveReady = providerReady && numberVerified && routingVerified && numberBillingReady && realtimeConfigured
    && Boolean(activeChannel && assignedProfile && activeFlow);
  const lanePrice = firstNumber(commercial, ['pricing.additionalLaneMonthly', 'pricing.laneMonthly', 'capacity.additionalLanePrice', 'lanePrice']);

  useEffect(() => {
    if (!provisionProfileId && generalProfiles.length === 1) setProvisionProfileId(String(generalProfiles[0].id));
    if (!provisionFlowId && generalFlows.filter(item => item.status === 'active').length === 1) {
      setProvisionFlowId(String(generalFlows.find(item => item.status === 'active')?.id ?? ''));
    }
  }, [generalProfiles, generalFlows, provisionProfileId, provisionFlowId]);

  useEffect(() => {
    const selectedChannelId = String(activeChannel?.id ?? '');
    const managedRule = (product?.rules ?? []).find(item =>
      item.managedKey === `commercial_channel_alerts:${selectedChannelId}`,
    );
    const configuredActions = rows(managedRule?.actionsJson);
    const email = configuredActions.find(item => item.actionType === 'email');
    const slack = configuredActions.find(item => item.actionType === 'slack');
    const webhook = configuredActions.find(item => item.actionType === 'webhook');
    setAlerts({
      emailEnabled: Boolean(email && email.enabled !== false),
      email: String(email?.destination ?? ''),
      slackEnabled: Boolean(slack && slack.enabled !== false),
      slackEndpointId: String(slack?.endpointId ?? ''),
      webhookEnabled: Boolean(webhook && webhook.enabled !== false),
      webhookEndpointId: String(webhook?.endpointId ?? ''),
    });
  }, [activeChannel?.id, product]);

  const readiness = [
    { label: 'AI receptionist assigned', ready: Boolean(assignedProfile), detail: assignedProfile ? `${assignedProfile.name} is assigned to this number.` : 'Create and assign the receptionist who will answer this number.' },
    { label: 'Phone number connected', ready: numberVerified, detail: numberVerified ? 'The provider confirms this number is active.' : activeChannel ? 'The number is saved but provider ownership is not verified.' : 'Get a new number or connect your existing number.' },
    { label: 'Published workflow assigned', ready: Boolean(activeFlow), detail: activeFlow ? `${activeFlow.name} is published and assigned to this number.` : 'Choose a template, publish it, and assign it to this number.' },
    { label: 'Incoming call route verified', ready: routingVerified, detail: routingVerified ? 'The provider confirms incoming routing.' : 'Provider routing must pass a health check before go-live.' },
    { label: 'Managed-number billing entitled', ready: numberBillingReady, detail: numberBillingReady ? 'This number is included, paid, or within an active payment grace period.' : 'Number billing must settle before this line can accept live calls.' },
    { label: 'Telephony provider ready', ready: providerReady, detail: providerReady ? 'Provider access is healthy for this tenant.' : 'A tenant-specific provider connection is still required.' },
    { label: 'OpenAI Realtime SIP configured', ready: realtimeConfigured, detail: realtimeConfigured ? `${realtimeModel || 'The allowlisted Realtime model'} is configured on the server.` : 'A deployment administrator must configure the OpenAI project, webhook signature, SIP route secret, and allowlisted model.' },
  ];

  async function searchNumbers() {
    if (!canAdmin) return;
    setBusy('number-search'); setError(''); setNotice(''); setNumberChargeConfirmed(false); setConnectionPlan(null);
    try {
      const result = await moduleShellApi.callcommand.commercialSearchNumbers(numberSearch) as Row;
      const requestKey = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const found = rows(result.numbers ?? result.availableNumbers ?? result.results).map(item => ({
        ...item,
        uiIdempotencyKey: `commercial-number:${requestKey}:${item.phoneE164 ?? item.phone ?? item.number}`,
      }));
      setAvailableNumbers(found);
      setNotice(found.length
        ? `${found.length} voice number${found.length === 1 ? '' : 's'} found. Review and acknowledge the recurring provider-charge notice before purchasing.`
        : 'No matching voice numbers were returned. Try a nearby area code or locality.');
    } catch (caught) { setError(errorMessage(caught, 'Number search is unavailable until the telephony provider is configured.')); }
    finally { setBusy(''); }
  }

  async function provisionNumber(item: Row) {
    if (!canAdmin || !numberChargeConfirmed) {
      setError('An organization administrator must acknowledge the recurring provider charge before purchasing a number.');
      return;
    }
    const phone = item.phoneE164 ?? item.phone ?? item.number;
    setBusy(`provision:${item.id ?? phone}`); setError(''); setNotice('');
    const request = {
      providerNumberId: item.id ?? item.providerId,
      phone,
      numberType: item.numberType ?? numberSearch.numberType,
      country: numberSearch.country,
      areaCode: numberSearch.areaCode || undefined,
      locality: numberSearch.locality || undefined,
      region: numberSearch.region || undefined,
      postalCode: numberSearch.postalCode || undefined,
      contains: numberSearch.contains || undefined,
      profileId: provisionProfileId || (generalProfiles.length === 1 ? generalProfiles[0]?.id : undefined),
      flowId: provisionFlowId || (generalFlows.filter(candidate => candidate.status === 'active').length === 1
        ? generalFlows.find(candidate => candidate.status === 'active')?.id : undefined),
      idempotencyKey: item.uiIdempotencyKey,
      confirmRecurringProviderCharge: true,
    };
    try {
      const result = await moduleShellApi.callcommand.commercialProvisionNumber(request) as Row;
      setNumberChargeConfirmed(false);
      setAvailableNumbers(current => current.filter(candidate => (candidate.phoneE164 ?? candidate.phone ?? candidate.number) !== phone));
      setNotice(result.readyForLiveCalls
        ? 'Number acquired, routing verified, billing authorized, and the receptionist workflow was assigned.'
        : `The provider acquired the number. Provisioning is in ${String(result.lifecycleState ?? 'reconciliation').replaceAll('_', ' ').toLowerCase()} and live calls remain locked.`);
      await refresh();
    } catch (caught) {
      const failure = caught as Row;
      if (failure?.code === 'CALLCOMMAND_NUMBER_INVENTORY_CHANGED' || failure?.refreshSearch === true) {
        setNotice('That number was just claimed. CallCommand is refreshing provider inventory now.');
        setAvailableNumbers([]);
        setBusy('number-search');
        try {
          const refreshed = await moduleShellApi.callcommand.commercialSearchNumbers(numberSearch) as Row;
          const requestKey = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          setAvailableNumbers(rows(refreshed.numbers).map(candidate => ({
            ...candidate,
            uiIdempotencyKey: `commercial-number:${requestKey}:${candidate.phoneE164 ?? candidate.phone ?? candidate.number}`,
          })));
        } catch (searchFailure) {
          setError(errorMessage(searchFailure, 'Fresh provider inventory could not be loaded.'));
        }
      } else if (failure?.code === 'CALLCOMMAND_NUMBER_BILLING_REQUIRED' && failure.required) {
        const billingKey = `managed-number-billing:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
        try {
          const billing = await moduleShellApi.callcommand.commercialNumberBilling({
            billableLocalQuantity: Number(failure.required.billableLocalQuantity ?? 0),
            billableTollFreeQuantity: Number(failure.required.billableTollFreeQuantity ?? 0),
            idempotencyKey: billingKey,
          }) as Row;
          if (billing.checkoutUrl) {
            setNotice('OperatorOS opened secure billing for the required number quantity. Return here after signed payment settlement, then choose the number again.');
            window.location.assign(String(billing.checkoutUrl));
          } else {
            setNotice('The managed-number billing update is pending signed Stripe settlement. The provider purchase has not occurred.');
          }
        } catch (billingFailure) {
          setError(errorMessage(billingFailure, 'Managed-number billing could not be started. No provider number was purchased.'));
        }
      } else {
        setError(errorMessage(caught, 'The provider did not confirm number provisioning.'));
      }
    } finally { setBusy(''); }
  }

  async function connectExistingNumber() {
    if (!canAdmin) return;
    const result = await run('connect-number', () => moduleShellApi.callcommand.commercialConnectNumber({
      ...existingNumber,
      connectionType: numberPath === 'forward' ? 'forwarding' : existingNumber.connectionType,
      profileId: availableProfile?.id ?? null,
    }), 'The provider handoff plan was saved. Complete its listed steps before running health validation.');
    if (result?.connectionPlan) setConnectionPlan(result.connectionPlan as Row);
  }

  async function releaseProviderNumber(item: Row) {
    if (!canAdmin || releasePhrase !== 'RELEASE NUMBER') return;
    const result = await run(`number-release:${item.id}`, () => moduleShellApi.callcommand.commercialReleaseNumber(item.id, {
      confirmRelease: true,
      confirmationText: releasePhrase,
    }), 'The number release is scheduled behind a recovery hold. The provider still owns the number and billing remains active until final execution is confirmed.');
    if (result) { setReleaseNumberId(''); setReleasePhrase(''); }
  }

  async function saveAgent() {
    const createPayload = {
      name: agent.name, mode: 'receptionist', productMode: 'general', greeting: agent.greeting, tone: agent.tone, voice: agent.voice,
      businessName: agent.businessName, department: agent.department, primaryPurpose: agent.purpose, businessDescription: agent.businessDescription,
      languages: agent.languages.split(',').map(value => value.trim()).filter(Boolean), businessHoursDescription: agent.businessHours,
      fallbackBehavior: agent.fallbackBehavior,
      script: `You are the ${agent.department} receptionist for ${agent.businessName || 'this business'}. ${agent.purpose} ${agent.businessDescription} If uncertain, ${agent.fallbackBehavior}`,
      intakeSchema: [{ key: 'caller_name', label: 'your name', required: true }, { key: 'request', label: 'how we can help', required: true }, { key: 'urgency', label: 'how urgent this is', type: 'choice', options: ['low', 'normal', 'high', 'urgent'], required: true }],
    };
    const changed = (key: keyof typeof agent) => !agentBaseline || agent[key] !== agentBaseline[key];
    const updatePayload: Row = {};
    if (changed('name')) updatePayload.name = agent.name;
    if (changed('greeting')) updatePayload.greeting = agent.greeting;
    if (changed('tone')) updatePayload.tone = agent.tone;
    if (changed('voice')) updatePayload.voice = agent.voice;
    if (changed('businessName')) updatePayload.businessName = agent.businessName;
    if (changed('department')) updatePayload.department = agent.department;
    if (changed('purpose')) updatePayload.primaryPurpose = agent.purpose;
    if (changed('businessDescription')) updatePayload.businessDescription = agent.businessDescription;
    if (changed('languages')) updatePayload.languages = agent.languages.split(',').map(value => value.trim()).filter(Boolean);
    if (changed('businessHours')) updatePayload.businessHoursDescription = agent.businessHours;
    if (changed('fallbackBehavior')) updatePayload.fallbackBehavior = agent.fallbackBehavior;
    if (['department', 'businessName', 'purpose', 'businessDescription', 'fallbackBehavior'].some(key => changed(key as keyof typeof agent))) {
      updatePayload.script = createPayload.script;
    }
    const operation = editingAgentId
      ? () => moduleShellApi.callcommand.productUpdateProfile(editingAgentId, updatePayload)
      : async () => {
          const created = await moduleShellApi.callcommand.productCreateProfile(createPayload) as Row;
          const profileId = created.profile?.id ?? created.id;
          if (profileId && canAdmin && activeChannel && !activeChannel.profileId) {
            await moduleShellApi.callcommand.productUpdateChannel(activeChannel.id, { profileId });
          }
          return created;
        };
    const result = await run('agent', operation, editingAgentId ? 'Receptionist settings updated.' : 'Receptionist created.');
    if (result) { setEditingAgentId(''); setAgentBaseline(null); }
  }

  function editAgent(item: Row) {
    if (!isGeneralProduct(item)) return;
    const hydrated = {
      name: item.name ?? agent.name,
      greeting: item.greeting ?? agent.greeting,
      tone: item.personality ?? item.tone ?? agent.tone,
      businessName: item.businessName ?? agent.businessName,
      department: item.departmentName ?? agent.department,
      purpose: item.agentPurpose ?? agent.purpose,
      businessDescription: item.businessDescription ?? agent.businessDescription,
      voice: item.voiceId ?? agent.voice,
      languages: languageText(item, agent.languages),
      businessHours: businessHoursText(item, agent.businessHours),
      fallbackBehavior: item.fallbackBehavior ?? agent.fallbackBehavior,
    };
    setEditingAgentId(item.id);
    setAgent(hydrated);
    setAgentBaseline(hydrated);
  }

  async function activateWorkflow() {
    const selected = TEMPLATES[templateKey];
    const graph = {
      start: 'priority_check', nodes: [
        { key: 'priority_check', type: 'condition', config: { field: 'priority', operator: 'in', value: ['high', 'urgent'] }, yes: 'follow_up', no: 'follow_up' },
        { key: 'follow_up', type: 'action', config: { actionType: selected.action, title: selected.actionTitle } },
      ],
    };
    if (!canAdmin) { setError('An organization administrator must publish and assign workflows.'); return; }
    if (!flow.channelId) { setError('Choose the phone number that should use this workflow.'); return; }
    const result = await run('workflow', async () => {
      const created = await moduleShellApi.callcommand.productCreateFlow({ name: flow.name, description: flow.description, productMode: 'general', templateKey, graph }) as Row;
      const flowId = created.flow?.id ?? created.id;
      if (!flowId) throw new Error('The workflow was created without an identifier.');
      await moduleShellApi.callcommand.productPublishFlow(flowId);
      await moduleShellApi.callcommand.productUpdateChannel(flow.channelId, { activeFlowId: flowId });
      return created;
    }, 'Workflow published, assigned to the phone number, and ready for a test.');
    return result;
  }

  function validateAlertSettings(): string | null {
    if (alerts.emailEnabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alerts.email.trim())) return 'Enter a valid email recipient or turn off the email alert.';
    if (alerts.slackEnabled && !alerts.slackEndpointId) return 'Choose a connected Slack destination or turn off the Slack alert.';
    if (alerts.webhookEnabled && !alerts.webhookEndpointId) return 'Choose a configured webhook destination or turn off the webhook alert.';
    return null;
  }

  function alertActions(): Row[] {
    const actions: Row[] = [];
    if (alerts.email.trim()) actions.push({ actionType: 'email', enabled: alerts.emailEnabled, destination: alerts.email.trim(), subject: 'CallCommand follow-up' });
    if (alerts.slackEndpointId) actions.push({ actionType: 'slack', enabled: alerts.slackEnabled, endpointId: alerts.slackEndpointId });
    if (alerts.webhookEndpointId) actions.push({ actionType: 'webhook', enabled: alerts.webhookEnabled, endpointId: alerts.webhookEndpointId });
    return actions;
  }

  async function saveAlertSettings() {
    if (!canAdmin || !flow.channelId) { setError('Choose a phone number and use an organization administrator account.'); return; }
    const alertError = validateAlertSettings();
    if (alertError) { setError(alertError); return; }
    await run(
      'alerts',
      () => moduleShellApi.callcommand.commercialUpsertAlertRule(flow.channelId, { actions: alertActions() }),
      'Channel alert settings saved without rebuilding the assigned workflow.',
    );
  }

  async function createTransferTarget() {
    await run('transfer-target', () => moduleShellApi.callcommand.productCreateTarget({ kind: 'external', label: transfer.label, phone: transfer.phone }), 'Transfer destination saved as pending verification. It cannot receive live transfers yet.');
  }

  async function simulate() {
    if (!activeChannel || !assignedProfile) { setError('Assign a general-purpose receptionist to this phone number before running a test.'); return; }
    const result = await run('simulation', () => moduleShellApi.callcommand.productSimulate({ channelId: activeChannel.id, profileId: assignedProfile.id, callerName: 'Setup test caller', callerPhone: '+15555550100', transcript: simulationTranscript, idempotencyKey: `commercial-ui-sim-${Date.now()}` }), 'Simulation complete. No external call was placed. Review the persisted timeline below.');
    const callId = result?.call?.id ?? result?.callId;
    if (callId) { setSelectedCallId(String(callId)); router.push(hrefFor(`/calls/${callId}`)); }
  }

  async function goLive() {
    if (!activeChannel) return;
    await run('go-live', async () => {
      await moduleShellApi.callcommand.commercialUpdateRuntime({
        overflowPolicy: runtimeSettings.overflowPolicy ?? 'refuse',
        overflowForwardTargetId: runtimeSettings.overflowForwardTargetId ?? null,
        defaultLeaseSeconds: runtimeSettings.defaultLeaseSeconds ?? 900,
        maximumLeaseSeconds: runtimeSettings.maximumLeaseSeconds ?? 14400,
        realtimeEnabled: true,
        activationChannelId: activeChannel.id,
      });
    }, 'CallCommand Realtime is enabled on the provider-verified number and route. Place a controlled live call to establish deployment health evidence.');
  }

  async function requestLaneQuantity(quantity: number) {
    if (!canAdmin || busy) return;
    setBusy('lane-checkout'); setError(''); setNotice('');
    try {
      const result = await moduleShellApi.callcommand.commercialLaneCheckout({
        quantity,
        confirmPaidLaneQuantity: true,
        confirmCancelPaidLanes: quantity === 0,
        idempotencyKey: `callcommand-lane:${firstNumber(commercial, ['capacity.version']) ?? 0}:${quantity}`,
      }) as Row;
      const url = result.checkoutUrl ?? result.url;
      if (typeof url === 'string') {
        window.location.assign(url);
        return;
      }
      setNotice(quantity === 0
        ? 'Stripe accepted the request to cancel the dedicated paid-lane subscription at the end of its billing period. Paid capacity stays active until a signed subscription-deletion event removes it.'
        : result.action === 'quantity_update_pending'
        ? `The desired total was submitted to Stripe. Capacity stays unchanged until signed payment settlement confirms ${quantity} additional lane${quantity === 1 ? '' : 's'}.`
        : 'The paid-lane request was accepted. Capacity remains unchanged until signed payment settlement.');
      try { await refresh(); }
      catch (refreshError) { setError(`The billing request was submitted, but the refreshed workspace could not be loaded: ${errorMessage(refreshError, 'refresh failed')}`); }
    } catch (caught) {
      setError(errorMessage(caught, 'The paid concurrent-lane request could not be completed.'));
    } finally { setBusy(''); }
  }

  async function refreshVisibleWorkspace() {
    if (busy) return;
    setBusy('refresh'); setError('');
    try { await refresh(); setNotice('CallCommand configuration and health facts were refreshed.'); }
    catch (caught) { setError(errorMessage(caught, 'CallCommand could not refresh its current health facts.')); }
    finally { setBusy(''); }
  }

  if (loading) return <section style={{ ...panel, minHeight: 180, display: 'grid', placeItems: 'center' }} role="status"><span><Loader2 size={18} style={{ verticalAlign: -4, marginRight: 8 }}/>Loading your CallCommand workspace…</span></section>;

  const readOnlyNotice = !canWrite ? <div style={{ ...panel, borderColor: 'rgba(251,191,36,.4)', color: '#fde68a', marginBottom: space.md }}><ShieldCheck size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>You have read-only access. You can review configuration, calls, usage, and health, but only an authorized organization member can make changes.</div> : null;

  return <section data-testid={`callcommand-commercial-${view}`} style={{ minWidth: 0, color: semantic.text }}>
    {readOnlyNotice}
    {error && <div role="alert" style={{ ...panel, borderColor: 'rgba(251,113,133,.5)', color: '#fda4af', marginBottom: space.md }}><AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{error}</div>}
    {notice && <div role="status" style={{ ...panel, borderColor: 'rgba(52,211,153,.45)', color: '#6ee7b7', marginBottom: space.md }}><CheckCircle2 size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>{notice}</div>}
    {commercialUnavailable && <div style={{ ...panel, borderColor: 'rgba(251,191,36,.35)', color: '#fde68a', marginBottom: space.md }}><AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>Commercial number, capacity, pricing, and health data are not available from this environment. Existing configuration and the no-cost simulator remain available; no provider readiness is being inferred.</div>}

    {(view === 'overview' || view === 'setup') && <section style={{ ...panel, marginBottom: space.lg, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '22px 24px', background: 'radial-gradient(circle at 88% 0,rgba(16,185,129,.22),transparent 38%),linear-gradient(135deg,rgba(6,78,59,.3),rgba(5,15,22,.2))' }}>
        <Heading icon={<Sparkles/>} title={goLiveReady ? 'CallCommand is ready for live calls' : 'Finish setting up your receptionist'} subtitle={goLiveReady ? 'Your tenant-specific provider, number, incoming route, receptionist, and workflow are verified.' : 'Complete the checklist below. CallCommand will not claim live readiness until the provider confirms the number and incoming route.'}/>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{readiness.map(item => <Badge key={item.label} tone={item.ready ? 'good' : 'warn'}>{item.ready ? 'Ready' : 'Next'} · {item.label}</Badge>)}</div>
      </div>
    </section>}

    {view === 'overview' && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: space.md, marginBottom: space.lg }}>
        {[
          ['Calls today', generalCalls.filter(item => String(item.createdAt ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length, PhoneCall], ['Active calls', commercialProduct?.sessions.filter(item => !item.endedAt).length ?? 0, Radio],
          ['Follow-up actions', commercialProduct?.actionRuns.length ?? 0, Activity], ['Available call lanes', firstNumber(commercial, ['capacity.available', 'concurrency.available']), Users],
        ].map(([label, value, Icon]: any) => <article key={label} style={panel}><Icon size={17} color="#2dd4bf"/><div style={{ fontSize: 27, fontWeight: 900, marginTop: 7 }}>{value === null ? '—' : value}</div><div style={{ color: semantic.textMuted, fontSize: 12 }}>{label}</div></article>)}
      </div>
      <section style={panel}><Heading icon={<HeartPulse/>} title="What needs attention" subtitle="These are configuration facts from this tenant, not a global provider-credential check."/>
        <div style={{ display: 'grid', gap: 8 }}>{readiness.map(item => <div key={item.label} style={{ display: 'flex', gap: 10, padding: 11, border: '1px solid rgba(94,234,212,.13)', borderRadius: 9 }}><span style={{ color: item.ready ? '#34d399' : '#fbbf24' }}>{item.ready ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</span><div><strong>{item.label}</strong><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 3 }}>{item.detail}</div></div></div>)}</div>
      </section>
    </>}

    {view === 'setup' && <div style={{ display: 'grid', gap: space.lg }}>
      <section style={panel}><Heading icon={<PhoneCall/>} title="1. Choose your business number" subtitle="Get a new number, forward an existing line, or connect an existing provider account. Provider purchases remain blocked until number billing is entitled."/>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10, marginBottom: 14 }}>{[
          ['new', 'Get New Number', 'Search current local or toll-free inventory. Billing entitlement is checked before the provider purchase.'],
          ['forward', 'Forward Existing', 'Keep the current carrier and create a forwarding handoff plan. This does not claim provider activation.'],
          ['provider', 'Connect Provider', 'Transfer an existing Twilio number, connect SIP/PBX, or begin a controlled porting plan.'],
        ].map(([key, title, description]) => <button key={key} type="button" aria-pressed={numberPath === key} onClick={() => { setNumberPath(key as 'new'|'forward'|'provider'); setConnectionPlan(null); setExistingNumber(current => ({ ...current, connectionType: key === 'forward' ? 'forwarding' : current.connectionType === 'forwarding' ? 'twilio_transfer' : current.connectionType })); }} style={{ ...quiet, textAlign: 'left', alignItems: 'flex-start', background: numberPath === key ? 'rgba(16,185,129,.18)' : '#102630' }}><span><strong>{title}</strong><small style={{ display: 'block', color: semantic.textMuted, marginTop: 5, lineHeight: 1.4 }}>{description}</small></span></button>)}</div>
        {numberPath === 'new' ? <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
            <Field label="Number type"><select style={field} value={numberSearch.numberType} onChange={event => setNumberSearch({ ...numberSearch, numberType: event.target.value as 'local'|'toll_free', areaCode: event.target.value === 'toll_free' ? '' : numberSearch.areaCode, locality: event.target.value === 'toll_free' ? '' : numberSearch.locality, region: event.target.value === 'toll_free' ? '' : numberSearch.region, postalCode: event.target.value === 'toll_free' ? '' : numberSearch.postalCode })}><option value="local">Local number</option><option value="toll_free">Toll-free number</option></select></Field>
            <Field label="Country"><select style={field} value={numberSearch.country} onChange={event => setNumberSearch({ ...numberSearch, country: event.target.value })}><option value="US">United States</option></select></Field>
            {numberSearch.numberType === 'local' && <Field label="Area code"><input style={field} value={numberSearch.areaCode} inputMode="numeric" pattern="[0-9]{3}" placeholder="404" onChange={event => setNumberSearch({ ...numberSearch, areaCode: event.target.value.replace(/\D/g, '').slice(0, 3) })}/></Field>}
            {numberSearch.numberType === 'local' && <Field label="City"><input style={field} value={numberSearch.locality} placeholder="Atlanta" onChange={event => setNumberSearch({ ...numberSearch, locality: event.target.value })}/></Field>}
            {numberSearch.numberType === 'local' && <Field label="State"><input style={field} value={numberSearch.region} placeholder="GA" maxLength={2} onChange={event => setNumberSearch({ ...numberSearch, region: event.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2) })}/></Field>}
            {numberSearch.numberType === 'local' && <Field label="ZIP code"><input style={field} value={numberSearch.postalCode} placeholder="30303" onChange={event => setNumberSearch({ ...numberSearch, postalCode: event.target.value.replace(/[^0-9-]/g, '').slice(0, 10) })}/></Field>}
            <Field label="Digits or vanity pattern"><input style={field} value={numberSearch.contains} placeholder="555 or *NINJA*" onChange={event => setNumberSearch({ ...numberSearch, contains: event.target.value.replace(/[^A-Za-z0-9*%+$]/g, '').slice(0, 16) })}/></Field>
            <button style={{ ...primary, alignSelf: 'end', ...disabledStyle(canAdmin && !busy) }} disabled={!canAdmin || !!busy || Boolean(numberSearch.areaCode && numberSearch.areaCode.length !== 3) || Boolean(numberSearch.region && numberSearch.region.length !== 2)} onClick={() => void searchNumbers()}><Search size={15}/>{busy === 'number-search' ? 'Searching live inventory…' : 'Search current inventory'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
            <Field label="Receptionist for this number" hint={generalProfiles.length === 0 ? 'CallCommand will create an AI Receptionist automatically.' : generalProfiles.length > 1 ? 'Required when more than one receptionist exists.' : undefined}><select style={field} value={provisionProfileId} onChange={event => setProvisionProfileId(event.target.value)}><option value="">{generalProfiles.length === 0 ? 'Create AI Receptionist' : 'Choose receptionist'}</option>{generalProfiles.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Published workflow" hint={generalFlows.filter(item => item.status === 'active').length === 0 ? 'CallCommand will create and publish General Reception automatically.' : undefined}><select style={field} value={provisionFlowId} onChange={event => setProvisionFlowId(event.target.value)}><option value="">{generalFlows.filter(item => item.status === 'active').length === 0 ? 'Create General Reception' : 'Choose workflow'}</option>{generalFlows.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          </div>
        </div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}><Field label="Business number in E.164 format"><input data-testid="input-callcommand-channel-phone" style={field} value={existingNumber.phone} placeholder="+15551234567" onChange={event => setExistingNumber({ ...existingNumber, phone: event.target.value.replace(/[\s()-]/g, '') })}/></Field>{numberPath === 'provider' && <Field label="Provider connection"><select style={field} value={existingNumber.connectionType} onChange={event => setExistingNumber({ ...existingNumber, connectionType: event.target.value })}><option value="twilio_transfer">Transfer an existing Twilio number</option><option value="sip">Connect VoIP or PBX</option><option value="port">Begin number porting</option></select></Field>}<button data-testid="button-callcommand-connect-number" style={{ ...primary, alignSelf: 'end', ...disabledStyle(canAdmin && /^\+[1-9]\d{7,14}$/.test(existingNumber.phone)) }} disabled={!canAdmin || !!busy || !/^\+[1-9]\d{7,14}$/.test(existingNumber.phone)} onClick={() => void connectExistingNumber()}><ArrowRight size={15}/>{numberPath === 'forward' ? 'Save forwarding plan' : 'Save provider handoff plan'}</button></div>}
        {(connectionPlan ?? selectedCommercialNumber?.connectionPlan) && <div style={{ marginTop: 14, padding: 13, border: '1px solid rgba(251,191,36,.35)', borderRadius: 9 }}><strong>Provider action required</strong><p style={{ color: semantic.textMuted, fontSize: 13 }}>This saved plan is not proof that the number is connected. Complete each provider step, then run health validation.</p><ol>{(Array.isArray((connectionPlan ?? selectedCommercialNumber?.connectionPlan)?.instructions) ? (connectionPlan ?? selectedCommercialNumber?.connectionPlan).instructions : []).map((instruction: unknown, index: number) => <li key={index}>{String(instruction)}</li>)}</ol></div>}
        {availableNumbers.length > 0 && <div role="status" aria-live="polite" style={{ display: 'grid', gap: 8, marginTop: 14 }}><label style={{ padding: 11, border: '1px solid rgba(251,191,36,.35)', borderRadius: 9, color: '#fde68a', display: 'flex', gap: 9, alignItems: 'flex-start' }}><input type="checkbox" checked={numberChargeConfirmed} onChange={event => setNumberChargeConfirmed(event.target.checked)}/><span>I authorize this provider purchase and understand that the first local number is included in CallCommand billing, while additional local and every toll-free number require a paid OperatorOS number entitlement. Provider usage charges remain separate.</span></label>{availableNumbers.map(item => { const phone = item.phoneE164 ?? item.phone ?? item.number; const location = [item.locality, item.region, item.postalCode].filter(Boolean).join(', '); return <div key={item.id ?? phone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 11, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9, flexWrap: 'wrap' }}><div style={{ flex: 1, minWidth: 210 }}><strong>{phone}</strong><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 4 }}>{item.numberType === 'toll_free' ? 'Toll-free' : location || 'Local'} · {item.capabilities?.voice ? 'Voice ready' : 'Voice capability unavailable'}</div><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 4 }}>{providerPriceText(item)}</div></div><button aria-label={`Choose and provision ${phone}`} style={{ ...primary, ...disabledStyle(canAdmin && !busy && numberChargeConfirmed && item.capabilities?.voice === true) }} disabled={!canAdmin || !!busy || !numberChargeConfirmed || item.capabilities?.voice !== true} onClick={() => void provisionNumber(item)}><Plus size={14}/>{busy === `provision:${item.id ?? phone}` ? 'Provisioning…' : 'Choose and provision'}</button></div>; })}</div>}
      </section>

      <AgentEditor agent={agent} setAgent={setAgent} canWrite={canWrite} busy={busy} editing={Boolean(editingAgentId)} onSave={() => void saveAgent()}/>
      <WorkflowEditor product={commercialProduct} flow={flow} setFlow={setFlow} templateKey={templateKey} setTemplateKey={key => { setTemplateKey(key); setFlow(current => ({ ...current, name: `${TEMPLATES[key].label} workflow`, description: TEMPLATES[key].description })); }} alerts={alerts} setAlerts={setAlerts} endpoints={endpoints} canAdmin={canAdmin} busy={busy} onSaveAlerts={() => void saveAlertSettings()} onActivate={() => void activateWorkflow()}/>
      <TransferAndTest transfer={transfer} setTransfer={setTransfer} product={commercialProduct} verificationCode={verificationCode} setVerificationCode={setVerificationCode} canWrite={canWrite} busy={busy} simulationTranscript={simulationTranscript} setSimulationTranscript={setSimulationTranscript} onCreateTarget={() => void createTransferTarget()} onStartVerification={item => void run(`verify-start:${item.id}`, () => moduleShellApi.callcommand.productStartTargetVerification(item.id), 'Verification started. Enter the code received at the destination.')} onCheckVerification={item => void run(`verify-check:${item.id}`, () => moduleShellApi.callcommand.productCheckTargetVerification(item.id, { code: verificationCode[item.id] ?? '' }), 'Transfer destination verified.')} onSimulate={() => void simulate()}/>
      <ReadinessPanel readiness={readiness} goLiveReady={goLiveReady} canAdmin={canAdmin} busy={busy} onGoLive={() => void goLive()}/>
    </div>}

    {view === 'numbers' && <NumberManagement
      numbers={displayedNumbers}
      profiles={generalProfiles}
      flows={generalFlows}
      issues={reconciliationIssues}
      canAdmin={canAdmin}
      busy={busy}
      releaseNumberId={releaseNumberId}
      releasePhrase={releasePhrase}
      onAdd={() => router.push(hrefFor('/setup'))}
      onHealth={item => void run(`number-health:${item.id}`, () => moduleShellApi.callcommand.commercialNumberHealth(item.id), 'Number health check completed.')}
      onRepair={item => void run(`number-repair:${item.id}`, () => moduleShellApi.callcommand.commercialRepairNumber(item.id), 'Provider routing repair and health validation completed.')}
      onStartRelease={item => { setReleaseNumberId(String(item.id)); setReleasePhrase(''); }}
      onRelease={item => void releaseProviderNumber(item)}
      onCancelRelease={item => void run(`number-release-cancel:${item.id}`, () => moduleShellApi.callcommand.commercialCancelNumberRelease(item.id), 'The scheduled release was canceled before provider execution. Run health check or repair before returning the line to service.')}
      onExecuteRelease={item => void run(`number-release-execute:${item.id}`, () => moduleShellApi.callcommand.commercialExecuteNumberRelease(item.id), 'The provider confirmed number release and OperatorOS requested the resulting billing quantity update.')}
      onReleasePhrase={setReleasePhrase}
      onCloseRelease={() => { setReleaseNumberId(''); setReleasePhrase(''); }}
    />}

    {view === 'agents' && <div style={{ display: 'grid', gap: space.lg }}><AgentEditor agent={agent} setAgent={setAgent} canWrite={canWrite} busy={busy} editing={Boolean(editingAgentId)} onSave={() => void saveAgent()}/><section style={panel}><Heading icon={<Bot/>} title="Saved receptionists" subtitle="Only general-purpose receptionists appear here; MSP intake profiles remain isolated."/><div style={{ display: 'grid', gap: 8 }}>{generalProfiles.length ? generalProfiles.map(item => <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 11, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9 }}><div style={{ flex: 1 }}><strong>{item.name}</strong><div style={{ color: semantic.textMuted, fontSize: 12 }}>{item.greeting}</div></div><Badge tone={item.status === 'active' ? 'good' : 'neutral'}>{item.status}</Badge><button aria-label={`Edit receptionist ${item.name}`} style={{ ...quiet, padding: '7px 10px', ...disabledStyle(canWrite) }} disabled={!canWrite} onClick={() => editAgent(item)}>Edit</button></div>) : <span style={{ color: semantic.textMuted }}>No general-purpose receptionist has been created.</span>}</div></section></div>}

    {view === 'workflows' && <div style={{ display: 'grid', gap: space.lg }}><WorkflowEditor product={commercialProduct} flow={flow} setFlow={setFlow} templateKey={templateKey} setTemplateKey={key => { setTemplateKey(key); setFlow(current => ({ ...current, name: `${TEMPLATES[key].label} workflow`, description: TEMPLATES[key].description })); }} alerts={alerts} setAlerts={setAlerts} endpoints={endpoints} canAdmin={canAdmin} busy={busy} onSaveAlerts={() => void saveAlertSettings()} onActivate={() => void activateWorkflow()}/><section style={panel}><Heading icon={<GitBranch/>} title="Published workflows" subtitle="A workflow is operational only when it is published and assigned to a general-purpose phone number."/><div style={{ display: 'grid', gap: 8 }}>{generalFlows.length ? generalFlows.map(item => <div key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 11, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9 }}><div style={{ flex: 1 }}><strong>{item.name}</strong><div style={{ color: semantic.textMuted, fontSize: 12 }}>Version {item.version} · {generalChannels.filter(channel => channel.activeFlowId === item.id).length} assigned number(s)</div></div><Badge tone={item.status === 'active' ? 'good' : 'warn'}>{item.status}</Badge></div>) : <span style={{ color: semantic.textMuted }}>No general-purpose workflow has been created.</span>}</div></section></div>}

    {view === 'calls' && <CallsWorkspace product={commercialProduct} calls={callRows} query={callQuery} setQuery={setCallQuery} selectedCallId={selectedCallId} setSelectedCallId={id => { setSelectedCallId(id); router.push(hrefFor(`/calls/${id}`)); }} detail={callDetail} detailLoading={callDetailLoading} simulationTranscript={simulationTranscript} setSimulationTranscript={setSimulationTranscript} canWrite={canWrite} busy={busy} onSimulate={() => void simulate()}/>}

    {view === 'usage' && <UsageWorkspace commercial={commercial} lanePrice={lanePrice} canAdmin={canAdmin} busy={busy} onCheckout={quantity => void requestLaneQuantity(quantity)}/>}

    {view === 'health' && <section style={panel}><Heading icon={<HeartPulse/>} title="Health and go-live readiness" subtitle="The checklist is recomputed from tenant-scoped provider ownership, routing, number billing, receptionist, workflow, and Realtime authority. Reconciliation never releases an orphan automatically." action={<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><button style={quiet} disabled={!!busy} onClick={() => void refreshVisibleWorkspace()}><RefreshCw size={14}/>{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</button><button style={quiet} disabled={!canAdmin || !!busy} onClick={() => void run('number-reconcile', () => moduleShellApi.callcommand.commercialReconcileNumbers({ autoRepair: false }), 'Provider inventory, routing, stale operations, and billing quantities were reconciled in dry-run mode.')}><ShieldCheck size={14}/>{busy === 'number-reconcile' ? 'Reconciling…' : 'Reconcile'}</button><button style={primary} disabled={!canAdmin || !!busy} onClick={() => void run('number-reconcile-repair', () => moduleShellApi.callcommand.commercialReconcileNumbers({ autoRepair: true }), 'Safe routing drift repairs completed. Orphans and destructive actions remain in manual review.')}><RefreshCw size={14}/>Safe auto-repair</button></div>}/><div style={{ display: 'grid', gap: 9 }}>{readiness.map(item => <div key={item.label} style={{ padding: 12, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9, display: 'flex', gap: 10 }}><span style={{ color: item.ready ? '#34d399' : '#fbbf24' }}>{item.ready ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}</span><div><strong>{item.label}</strong><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 4 }}>{item.detail}</div></div></div>)}</div>{reconciliationIssues.length > 0 && <div style={{ marginTop: 16 }}><h3 style={{ fontSize: 14 }}>Open reconciliation issues</h3><div style={{ display: 'grid', gap: 7 }}>{reconciliationIssues.map(issue => <div key={issue.id} style={{ padding: 10, border: '1px solid rgba(251,113,133,.35)', borderRadius: 8 }}><strong>{String(issue.issueType ?? 'unknown').replaceAll('_', ' ')}</strong><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 3 }}>{issue.safeAutoRepair ? 'Safe repair is available.' : 'Manual review is required; no destructive action will run automatically.'} · {issue.status}</div></div>)}</div></div>}</section>}
  </section>;
}

function NumberManagement({
  numbers, profiles, flows, issues, canAdmin, busy, releaseNumberId, releasePhrase,
  onAdd, onHealth, onRepair, onStartRelease, onRelease, onCancelRelease,
  onExecuteRelease, onReleasePhrase, onCloseRelease,
}: {
  numbers: Row[];
  profiles: Row[];
  flows: Row[];
  issues: Row[];
  canAdmin: boolean;
  busy: string;
  releaseNumberId: string;
  releasePhrase: string;
  onAdd: () => void;
  onHealth: (item: Row) => void;
  onRepair: (item: Row) => void;
  onStartRelease: (item: Row) => void;
  onRelease: (item: Row) => void;
  onCancelRelease: (item: Row) => void;
  onExecuteRelease: (item: Row) => void;
  onReleasePhrase: (value: string) => void;
  onCloseRelease: () => void;
}) {
  return <section style={panel}>
    <Heading
      icon={<PhoneCall/>}
      title="Your phone numbers"
      subtitle="Every line shows its provider lifecycle, number billing, assigned receptionist, workflow, and repair state. Release is delayed and cancelable before final provider execution."
      action={<button style={quiet} onClick={onAdd}><Plus size={14}/>Add or connect</button>}
    />
    <div style={{ display: 'grid', gap: 9 }}>
      {numbers.length ? numbers.map(item => {
        const label = item.friendlyName ?? item.name ?? item.phoneMasked ?? 'Business number';
        const lifecycle = String(item.lifecycleState ?? (item.healthStatus === 'healthy' ? 'ACTIVE' : 'ACTION_REQUIRED'));
        const canRelease = item.acquisitionMode === 'platform_provisioned' && lifecycle !== 'RELEASED' && lifecycle !== 'RELEASE_PENDING';
        const releaseAt = item.releaseScheduledAt ? new Date(item.releaseScheduledAt) : null;
        const holdElapsed = Boolean(releaseAt && releaseAt.getTime() <= Date.now());
        const active = lifecycle === 'ACTIVE';
        const itemIssues = issues.filter(issue => String(issue.channelId ?? '') === String(item.id));
        const healthTone = active && item.healthStatus === 'healthy' ? 'good' : lifecycle === 'RELEASED' ? 'neutral' : 'warn';
        return <article key={item.id} style={{ padding: 12, border: '1px solid rgba(94,234,212,.14)', borderRadius: 10 }}>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 210 }}>
              <strong>{label}</strong>
              <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 3 }}>{item.phoneMasked ?? item.phoneE164 ?? 'Number hidden'} · {item.numberType === 'toll_free' ? 'toll-free' : item.numberType ?? 'external'}</div>
            </div>
            <Badge tone={healthTone}>{lifecycle.replaceAll('_', ' ').toLowerCase()}</Badge>
            <Badge tone={['included','active'].includes(String(item.billingStatus)) ? 'good' : item.billingStatus === 'grace_period' ? 'warn' : 'neutral'}>billing {item.billingStatus ?? 'not configured'}</Badge>
            {active && item.phoneE164 && <a href={`tel:${item.phoneE164}`} style={{ ...primary, padding: '7px 10px', textDecoration: 'none' }}><PhoneCall size={13}/>Call It Now</a>}
            <button aria-label={`Check provider health for ${label}`} style={{ ...quiet, padding: '7px 10px', ...disabledStyle(canAdmin && !busy) }} disabled={!canAdmin || !!busy} onClick={() => onHealth(item)}><HeartPulse size={13}/>Check health</button>
            {item.acquisitionMode === 'platform_provisioned' && lifecycle !== 'RELEASED' && <button aria-label={`Repair provider routing for ${label}`} style={{ ...quiet, padding: '7px 10px', ...disabledStyle(canAdmin && !busy) }} disabled={!canAdmin || !!busy} onClick={() => onRepair(item)}><RefreshCw size={13}/>Repair</button>}
            {canRelease && <button aria-label={`Schedule release for ${label}`} style={{ ...quiet, padding: '7px 10px', color: '#fda4af', ...disabledStyle(canAdmin && !busy) }} disabled={!canAdmin || !!busy} onClick={() => onStartRelease(item)}>Release</button>}
          </div>
          <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 7 }}>
            {item.assignedAgentName ?? profiles.find(profile => profile.id === item.profileId)?.name ?? 'No receptionist assigned'} · {item.workflowName ?? flows.find(candidate => candidate.id === item.activeFlowId)?.name ?? 'No workflow assigned'}
          </div>
          <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 4 }}>
            Provider: {item.providerNumberStatus ?? 'unconfigured'} · Routing: {item.healthStatus ?? 'unknown'} · Last checked: {item.healthCheckedAt ? new Date(item.healthCheckedAt).toLocaleString() : 'never'}
          </div>
          {item.connectionPlan && <div style={{ color: '#fde68a', fontSize: 12, marginTop: 6 }}>Provider handoff remains required before this existing number can pass health validation.</div>}
          {itemIssues.length > 0 && <div style={{ color: '#fda4af', fontSize: 12, marginTop: 6 }}>{itemIssues.length} reconciliation issue{itemIssues.length === 1 ? '' : 's'}: {itemIssues.map(issue => String(issue.issueType).replaceAll('_', ' ')).join(', ')}</div>}
          {lifecycle === 'RELEASE_PENDING' && releaseAt && <div style={{ marginTop: 11, padding: 11, border: '1px solid rgba(251,191,36,.4)', borderRadius: 9 }}>
            <strong style={{ color: '#fde68a' }}>Release scheduled for {releaseAt.toLocaleString()}</strong>
            <p style={{ color: semantic.textMuted, fontSize: 12 }}>The provider still owns this number. Billing changes only after final provider release is confirmed.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!holdElapsed && <button style={quiet} disabled={!canAdmin || !!busy} onClick={() => onCancelRelease(item)}>Cancel scheduled release</button>}
              {holdElapsed && <button style={{ ...primary, background: '#9f1239' }} disabled={!canAdmin || !!busy} onClick={() => onExecuteRelease(item)}>Execute provider release</button>}
            </div>
          </div>}
          {releaseNumberId === String(item.id) && <div style={{ marginTop: 11, padding: 11, border: '1px solid rgba(251,113,133,.45)', borderRadius: 9 }}>
            <strong style={{ color: '#fda4af' }}>Schedule this provider-managed number for release?</strong>
            <p style={{ color: semantic.textMuted, fontSize: 12 }}>Live use pauses immediately. A recovery hold starts, during which the release can be canceled. Type RELEASE NUMBER to authorize scheduling.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input aria-label={`Type RELEASE NUMBER to schedule release for ${label}`} style={{ ...field, maxWidth: 240 }} value={releasePhrase} onChange={event => onReleasePhrase(event.target.value)}/>
              <button style={{ ...primary, background: '#9f1239', ...disabledStyle(releasePhrase === 'RELEASE NUMBER' && !busy) }} disabled={releasePhrase !== 'RELEASE NUMBER' || !!busy} onClick={() => onRelease(item)}>Schedule release</button>
              <button style={quiet} disabled={!!busy} onClick={onCloseRelease}>Keep number</button>
            </div>
          </div>}
        </article>;
      }) : <div style={{ color: semantic.textMuted }}>No general-purpose phone number has been configured.</div>}
    </div>
  </section>;
}

function AgentEditor({ agent, setAgent, canWrite, busy, editing, onSave }: { agent: Row; setAgent: (value: any) => void; canWrite: boolean; busy: string; editing: boolean; onSave: () => void }) {
  return <section style={panel}><Heading icon={<Bot/>} title="2. Create your AI receptionist" subtitle="Describe the business in normal language. CallCommand builds the controlled agent instructions; you do not need to write a system prompt."/><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}><Field label="Receptionist name"><input style={field} value={agent.name} onChange={event => setAgent({ ...agent, name: event.target.value })}/></Field><Field label="Business or department"><input style={field} value={agent.businessName} placeholder="Acme Services" onChange={event => setAgent({ ...agent, businessName: event.target.value })}/></Field><Field label="Department"><input style={field} value={agent.department} onChange={event => setAgent({ ...agent, department: event.target.value })}/></Field><Field label="Voice"><select style={field} value={agent.voice} onChange={event => setAgent({ ...agent, voice: event.target.value })}><option value="alloy">Warm and balanced</option><option value="verse">Clear and conversational</option><option value="sage">Calm and professional</option></select></Field><Field label="Greeting"><textarea style={{ ...field, minHeight: 82 }} value={agent.greeting} onChange={event => setAgent({ ...agent, greeting: event.target.value })}/></Field><Field label="Personality and tone"><textarea style={{ ...field, minHeight: 82 }} value={agent.tone} onChange={event => setAgent({ ...agent, tone: event.target.value })}/></Field><Field label="What should this receptionist accomplish?"><textarea style={{ ...field, minHeight: 92 }} value={agent.purpose} onChange={event => setAgent({ ...agent, purpose: event.target.value })}/></Field><Field label="What should callers know about the business?"><textarea style={{ ...field, minHeight: 92 }} value={agent.businessDescription} onChange={event => setAgent({ ...agent, businessDescription: event.target.value })}/></Field><Field label="Business hours"><input style={field} value={agent.businessHours} onChange={event => setAgent({ ...agent, businessHours: event.target.value })}/></Field><Field label="Languages" hint="Separate multiple languages with commas."><input style={field} value={agent.languages} onChange={event => setAgent({ ...agent, languages: event.target.value })}/></Field><Field label="If the receptionist is unsure"><textarea style={{ ...field, minHeight: 76 }} value={agent.fallbackBehavior} onChange={event => setAgent({ ...agent, fallbackBehavior: event.target.value })}/></Field></div><button data-testid="button-callcommand-create-profile" style={{ ...primary, marginTop: 13, ...disabledStyle(canWrite && !busy && Boolean(agent.name.trim() && agent.greeting.trim())) }} disabled={!canWrite || !!busy || !agent.name.trim() || !agent.greeting.trim()} onClick={onSave}><Bot size={15}/>{editing ? 'Save receptionist changes' : 'Create receptionist'}</button></section>;
}

function WorkflowEditor({ product, flow, setFlow, templateKey, setTemplateKey, alerts, setAlerts, endpoints, canAdmin, busy, onSaveAlerts, onActivate }: { product: ProductWorkspace | null; flow: Row; setFlow: (value: any) => void; templateKey: keyof typeof TEMPLATES; setTemplateKey: (key: keyof typeof TEMPLATES) => void; alerts: Row; setAlerts: (value: any) => void; endpoints: Row[]; canAdmin: boolean; busy: string; onSaveAlerts: () => void; onActivate: () => void }) {
  return <section style={panel}><Heading icon={<Workflow/>} title="3. Choose how calls should be handled" subtitle="Start with an editable business workflow. Publishing and assigning a live number are organization-administrator actions."/>{!canAdmin && <p style={{ color: '#fde68a', fontSize: 13 }}>You can review this configuration, but an organization administrator must publish and assign it.</p>}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(205px,1fr))', gap: 9 }}>{Object.entries(TEMPLATES).map(([key, item]) => <button key={key} aria-pressed={templateKey === key} style={{ ...quiet, textAlign: 'left', alignItems: 'flex-start', background: templateKey === key ? 'rgba(16,185,129,.18)' : '#102630' }} onClick={() => setTemplateKey(key as keyof typeof TEMPLATES)}><span><strong>{item.label}</strong><small style={{ display: 'block', color: semantic.textMuted, marginTop: 5, lineHeight: 1.4 }}>{item.description}</small></span></button>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10, marginTop: 13 }}><Field label="Workflow name"><input style={field} value={flow.name} onChange={event => setFlow({ ...flow, name: event.target.value })}/></Field><Field label="Phone number that should use it"><select style={field} value={flow.channelId} onChange={event => setFlow({ ...flow, channelId: event.target.value })}><option value="">Choose phone number</option>{product?.channels.map(item => <option key={item.id} value={item.id}>{item.name ?? item.phoneMasked ?? 'Business number'}</option>)}</select></Field><Field label="Editable workflow description"><textarea style={{ ...field, minHeight: 80 }} value={flow.description} onChange={event => setFlow({ ...flow, description: event.target.value })}/></Field></div><div style={{ display: 'grid', gap: 9, marginTop: 13 }}><strong>Optional alerts</strong><label style={{ color: semantic.textMuted, fontSize: 13 }}><input type="checkbox" checked={Boolean(alerts.emailEnabled)} onChange={event => setAlerts({ ...alerts, emailEnabled: event.target.checked })}/> Email a call summary</label>{alerts.emailEnabled && <Field label="Email recipient"><input style={field} type="email" value={alerts.email} onChange={event => setAlerts({ ...alerts, email: event.target.value })}/></Field>}<label style={{ color: semantic.textMuted, fontSize: 13 }}><input type="checkbox" checked={Boolean(alerts.slackEnabled)} onChange={event => setAlerts({ ...alerts, slackEnabled: event.target.checked })}/> Send a Slack alert</label>{alerts.slackEnabled && <Field label="Connected Slack destination"><select style={field} value={alerts.slackEndpointId} onChange={event => setAlerts({ ...alerts, slackEndpointId: event.target.value })}><option value="">Choose a connected destination</option>{endpoints.map(item => <option key={item.id} value={item.id}>{item.name ?? item.label ?? item.urlHost ?? 'Configured endpoint'}</option>)}</select></Field>}<label style={{ color: semantic.textMuted, fontSize: 13 }}><input type="checkbox" checked={Boolean(alerts.webhookEnabled)} onChange={event => setAlerts({ ...alerts, webhookEnabled: event.target.checked })}/> Send a signed webhook</label>{alerts.webhookEnabled && <Field label="Connected webhook destination"><select style={field} value={alerts.webhookEndpointId} onChange={event => setAlerts({ ...alerts, webhookEndpointId: event.target.value })}><option value="">Choose a configured endpoint</option>{endpoints.map(item => <option key={item.id} value={item.id}>{item.name ?? item.label ?? item.urlHost ?? 'Configured endpoint'}</option>)}</select></Field>}<div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button style={{ ...quiet, ...disabledStyle(canAdmin && !busy && Boolean(flow.channelId)) }} disabled={!canAdmin || !!busy || !flow.channelId} onClick={onSaveAlerts}><AlertTriangle size={15}/>{busy === 'alerts' ? 'Saving alerts…' : 'Save alert settings'}</button><button data-testid="button-callcommand-activate-workflow" style={{ ...primary, ...disabledStyle(canAdmin && !busy && Boolean(flow.channelId && flow.name.trim())) }} disabled={!canAdmin || !!busy || !flow.channelId || !flow.name.trim()} onClick={onActivate}><GitBranch size={15}/>{busy === 'workflow' ? 'Publishing and assigning…' : 'Publish and assign workflow'}</button></div></div></section>;
}

function TransferAndTest({ transfer, setTransfer, product, verificationCode, setVerificationCode, canWrite, busy, simulationTranscript, setSimulationTranscript, onCreateTarget, onStartVerification, onCheckVerification, onSimulate }: { transfer: Row; setTransfer: (value: any) => void; product: ProductWorkspace | null; verificationCode: Row; setVerificationCode: (value: any) => void; canWrite: boolean; busy: string; simulationTranscript: string; setSimulationTranscript: (value: string) => void; onCreateTarget: () => void; onStartVerification: (item: Row) => void; onCheckVerification: (item: Row) => void; onSimulate: () => void }) {
  return <section style={panel}><Heading icon={<Users/>} title="4. Configure human help and alerts" subtitle="A saved transfer destination remains pending until the destination proves it can receive the verification challenge."/><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}><Field label="Person or team"><input style={field} value={transfer.label} onChange={event => setTransfer({ ...transfer, label: event.target.value })}/></Field><Field label="Phone number"><input style={field} value={transfer.phone} placeholder="+1 555 123 4567" onChange={event => setTransfer({ ...transfer, phone: event.target.value })}/></Field><button style={{ ...primary, alignSelf: 'end', ...disabledStyle(canWrite && !busy && /^\+[1-9]\d{7,14}$/.test(transfer.phone)) }} disabled={!canWrite || !!busy || !/^\+[1-9]\d{7,14}$/.test(transfer.phone)} onClick={onCreateTarget}><Plus size={15}/>Save pending destination</button></div><div style={{ display: 'grid', gap: 8, marginTop: 13 }}>{product?.targets.map(item => { const verified = Boolean(item.verifiedAt) || String(item.verificationStatus ?? '').toLowerCase() === 'verified'; return <div key={item.id} style={{ padding: 11, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><div style={{ flex: 1, minWidth: 180 }}><strong>{item.label}</strong><div style={{ color: semantic.textMuted, fontSize: 12 }}>{item.phoneMasked ?? 'External destination'}</div></div><Badge tone={verified ? 'good' : 'warn'}>{verified ? 'verified' : 'pending verification'}</Badge>{!verified && <><button style={{ ...quiet, padding: '7px 10px' }} disabled={!canWrite || !!busy} onClick={() => onStartVerification(item)}>Send code</button><input aria-label={`Verification code for ${item.label}`} style={{ ...field, width: 120 }} inputMode="numeric" value={verificationCode[item.id] ?? ''} onChange={event => setVerificationCode({ ...verificationCode, [item.id]: event.target.value.replace(/\D/g, '').slice(0, 10) })}/><button style={{ ...primary, padding: '7px 10px' }} disabled={!canWrite || !!busy || !(verificationCode[item.id] ?? '').trim()} onClick={() => onCheckVerification(item)}>Verify</button></>}</div>; })}</div><div style={{ borderTop: '1px solid rgba(94,234,212,.14)', marginTop: 16, paddingTop: 16 }}><Heading icon={<Radio/>} title="5. Run a no-cost setup test" subtitle="This creates an explicitly labeled simulation, exercises the assigned workflow, and persists a real call timeline. It does not place an external call."/><Field label="What the simulated caller says"><textarea style={{ ...field, minHeight: 105 }} value={simulationTranscript} onChange={event => setSimulationTranscript(event.target.value)}/></Field><button data-testid="button-callcommand-place-test-call" style={{ ...primary, marginTop: 10, ...disabledStyle(canWrite && !busy && simulationTranscript.trim().length >= 10) }} disabled={!canWrite || !!busy || simulationTranscript.trim().length < 10} onClick={onSimulate}><PhoneCall size={15}/>{busy === 'simulation' ? 'Running test…' : 'Run setup simulation'}</button></div></section>;
}

function ReadinessPanel({ readiness, goLiveReady, canAdmin, busy, onGoLive }: { readiness: Array<{ label: string; ready: boolean; detail: string }>; goLiveReady: boolean; canAdmin: boolean; busy: string; onGoLive: () => void }) {
  return <section style={panel}><Heading icon={<ShieldCheck/>} title="6. Go-live readiness" subtitle="Go Live remains locked until the tenant provider, incoming route, receptionist workflow, and server-side OpenAI Realtime SIP authority are configured."/><div style={{ display: 'grid', gap: 8 }}>{readiness.map(item => <div key={item.label} style={{ display: 'flex', gap: 9, padding: 10, border: '1px solid rgba(94,234,212,.13)', borderRadius: 9 }}><span style={{ color: item.ready ? '#34d399' : '#fbbf24' }}>{item.ready ? <CheckCircle2 size={16}/> : <Clock3 size={16}/>}</span><div><strong>{item.label}</strong><div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 3 }}>{item.detail}</div></div></div>)}</div><button style={{ ...primary, marginTop: 13, ...disabledStyle(goLiveReady && canAdmin && !busy) }} disabled={!goLiveReady || !canAdmin || !!busy} onClick={onGoLive}><Radio size={15}/>{goLiveReady ? 'Enable Realtime and Go Live' : 'Go Live locked — complete required checks'}</button></section>;
}

function CallsWorkspace({ product, calls, query, setQuery, selectedCallId, setSelectedCallId, detail, detailLoading, simulationTranscript, setSimulationTranscript, canWrite, busy, onSimulate }: { product: ProductWorkspace | null; calls: Row[]; query: string; setQuery: (value: string) => void; selectedCallId: string; setSelectedCallId: (value: string) => void; detail: Row | null; detailLoading: boolean; simulationTranscript: string; setSimulationTranscript: (value: string) => void; canWrite: boolean; busy: string; onSimulate: () => void }) {
  const call = detail?.call as Row | undefined;
  const simulated = call?.provider === 'simulator';
  return <div style={{ display: 'grid', gap: space.lg }}><section style={panel}><Heading icon={<PhoneCall/>} title="Call history" subtitle="Search persisted general-purpose call records and open one to see its timeline and workflow outcomes."/><Field label="Search calls"><input style={field} type="search" value={query} placeholder="Caller, status, or summary" onChange={event => setQuery(event.target.value)}/></Field><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{calls.length ? calls.map(item => <button key={item.id} data-call-id={item.id} aria-pressed={selectedCallId === item.id} style={{ ...quiet, textAlign: 'left', background: selectedCallId === item.id ? 'rgba(16,185,129,.16)' : '#102630' }} onClick={() => setSelectedCallId(item.id)}><span style={{ flex: 1 }}><strong>{item.subjectName ?? item.phoneMasked ?? 'Caller'}</strong><small style={{ display: 'block', color: semantic.textMuted, marginTop: 4 }}>{item.direction} · {item.provider} · {item.status}{item.summary ? ` · ${item.summary}` : ''}</small></span><Badge tone={item.provider === 'simulator' ? 'warn' : item.status === 'completed' ? 'good' : 'neutral'}>{item.provider === 'simulator' ? 'simulation' : item.status}</Badge></button>) : <span style={{ color: semantic.textMuted }}>No calls match this search.</span>}</div></section>{detailLoading && <section style={panel} role="status"><Loader2 size={16} style={{ verticalAlign: -3, marginRight: 8 }}/>Loading the selected call…</section>}{detail && call && <section style={panel}><Heading icon={<FileText/>} title={call.subjectName ?? call.phoneMasked ?? 'Call detail'} subtitle="Provider facts, transcript, analysis provenance, events, workflow trace, and executed actions." action={simulated ? <Badge tone="warn">Simulation · no external call</Badge> : <Badge>{call.provider ?? 'provider unknown'}</Badge>}/><p style={{ color: semantic.textMuted }}>{call.summary ?? 'No summary is available.'}</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginBottom: 14 }}>{[['Outcome', call.status], ['Priority', call.priority], ['Sentiment', call.sentiment], ['Analysis', call.analysisProvider ?? call.analysisProvenance?.mode]].map(([label, value]) => <div key={label} style={{ padding: 10, background: '#07151c', borderRadius: 8 }}><small style={{ color: semantic.textMuted }}>{label}</small><div style={{ fontWeight: 800, marginTop: 3 }}>{value ?? 'Not available'}</div></div>)}</div><h3>Transcript</h3><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 12, background: '#061117', border: '1px solid rgba(94,234,212,.14)', borderRadius: 9, color: '#d8f3ef', fontFamily: 'inherit', lineHeight: 1.55 }}>{call.transcript ?? 'No transcript was retained for this call.'}</pre><Timeline title="Call timeline" items={rows(detail.events)} label={item => item.eventType ?? item.type ?? 'Call event'} detail={item => item.safePayload ? JSON.stringify(item.safePayload) : item.summary ?? ''}/><Timeline title="Workflow path" items={rows(detail.traces)} label={item => `${item.sequence ?? ''} ${item.nodeKey ?? item.nodeType ?? 'Workflow step'}`} detail={item => item.outcome ?? ''}/><Timeline title="Actions executed" items={rows(detail.actions)} label={item => item.actionType ?? 'Action'} detail={item => `${item.status ?? 'unknown'}${item.errorCode ? ` · ${item.errorCode}` : ''}`}/></section>}<section style={panel}><Heading icon={<Radio/>} title="Run another simulation" subtitle="Only this explicit test fixture is editable. A real provider transcript is never edited or reprocessed from this interface."/><Field label="Simulated caller request"><textarea style={{ ...field, minHeight: 100 }} value={simulationTranscript} onChange={event => setSimulationTranscript(event.target.value)}/></Field><button style={{ ...primary, marginTop: 10, ...disabledStyle(canWrite && !busy && Boolean(product?.channels.some(channel => channel.profileId) && product?.profiles.length)) }} disabled={!canWrite || !!busy || !product?.channels.some(channel => channel.profileId) || !product?.profiles.length} onClick={onSimulate}><PhoneCall size={15}/>Run no-cost simulation</button></section></div>;
}

function Timeline({ title, items, label, detail }: { title: string; items: Row[]; label: (item: Row) => string; detail: (item: Row) => string }) {
  return <div style={{ marginTop: 16 }}><h3>{title}</h3>{items.length ? <div style={{ display: 'grid', gap: 7 }}>{items.map((item, index) => <div key={item.id ?? index} style={{ display: 'flex', gap: 9, padding: 9, borderLeft: '2px solid #14b8a6', background: '#07151c' }}><span style={{ color: semantic.textMuted, fontSize: 11, minWidth: 90 }}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : `Step ${index + 1}`}</span><div><strong>{label(item)}</strong>{detail(item) && <div style={{ color: semantic.textMuted, fontSize: 12, marginTop: 2 }}>{detail(item)}</div>}</div></div>)}</div> : <span style={{ color: semantic.textMuted }}>No records were captured for this section.</span>}</div>;
}

function UsageWorkspace({ commercial, lanePrice, canAdmin, busy, onCheckout }: { commercial: Row | null; lanePrice: number | null; canAdmin: boolean; busy: string; onCheckout: (quantity: number) => void }) {
  const currentAdditional = firstNumber(commercial, ['capacity.additional', 'concurrency.additional']) ?? 0;
  const pendingAdditional = firstNumber(commercial, ['capacity.pendingAdditional', 'concurrency.pendingAdditional']) ?? 0;
  const [quantity, setQuantity] = useState(Math.max(0, pendingAdditional || currentAdditional));
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setQuantity(Math.max(0, pendingAdditional || currentAdditional));
    setConfirmed(false);
  }, [currentAdditional, pendingAdditional]);
  const values = [
    ['Included lanes', firstNumber(commercial, ['capacity.base', 'capacity.included', 'concurrency.base'])], ['Additional lanes', firstNumber(commercial, ['capacity.additional', 'concurrency.additional'])],
    ['Pending paid lanes', firstNumber(commercial, ['capacity.pendingAdditional', 'concurrency.pendingAdditional'])], ['Total capacity', firstNumber(commercial, ['capacity.effective', 'capacity.total', 'concurrency.effective'])],
    ['Active calls', firstNumber(commercial, ['capacity.active', 'concurrency.active'])], ['Available now', firstNumber(commercial, ['capacity.available', 'concurrency.available'])],
  ];
  const projectedMonthly = lanePrice === null ? null : lanePrice * quantity;
  const billingStatus = firstText(commercial, ['capacity.billingStatus']) || 'inactive';
  const noChange = quantity === currentAdditional && pendingAdditional === 0;
  return <div style={{ display: 'grid', gap: space.lg }}><section style={panel}><Heading icon={<Activity/>} title="Concurrent call capacity" subtitle="One lane allows one simultaneous AI call. Phone-number count and call capacity are separate."/><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 }}>{values.map(([label, value]) => <div key={label as string} style={{ padding: 12, border: '1px solid rgba(94,234,212,.14)', borderRadius: 9 }}><div style={{ fontSize: 25, fontWeight: 900 }}>{value === null ? '—' : value}</div><small style={{ color: semantic.textMuted }}>{label}</small></div>)}</div></section><section style={panel}><Heading icon={<CircleDollarSign/>} title="Set the paid additional-lane total" subtitle={lanePrice === null ? 'Pricing has not been returned by the OperatorOS catalog, so no price is being assumed.' : `Each additional lane is ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(lanePrice)} per month. This field replaces the desired paid quantity; it is not an increment.`}/><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 9, marginBottom: 13 }}><div style={{ padding: 10, background: '#07151c', borderRadius: 8 }}><small style={{ color: semantic.textMuted }}>Current paid quantity</small><div style={{ fontWeight: 800, marginTop: 3 }}>{currentAdditional}</div></div><div style={{ padding: 10, background: '#07151c', borderRadius: 8 }}><small style={{ color: semantic.textMuted }}>Requested paid quantity</small><div style={{ fontWeight: 800, marginTop: 3 }}>{quantity}</div></div><div style={{ padding: 10, background: '#07151c', borderRadius: 8 }}><small style={{ color: semantic.textMuted }}>Resulting capacity after settlement</small><div style={{ fontWeight: 800, marginTop: 3 }}>{quantity + 1}</div></div><div style={{ padding: 10, background: '#07151c', borderRadius: 8 }}><small style={{ color: semantic.textMuted }}>Requested recurring lane total</small><div style={{ fontWeight: 800, marginTop: 3 }}>{projectedMonthly === null ? 'Not available' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(projectedMonthly)}</div></div></div><p style={{ color: semantic.textMuted, fontSize: 13 }}>Billing status: {billingStatus}. Positive changes can create immediate prorations. Setting zero schedules cancellation of the dedicated paid-lane subscription at period end; paid capacity remains until the signed subscription-deletion webhook settles the removal. Pending increases never grant capacity before signed payment settlement.</p><div style={{ display: 'flex', gap: 9, alignItems: 'end', flexWrap: 'wrap' }}><Field label="Desired total additional paid lanes"><input style={{ ...field, width: 150 }} type="number" min={0} max={100} value={quantity} onChange={event => { const parsed = Number(event.target.value); setQuantity(Math.max(0, Math.min(100, Number.isFinite(parsed) ? Math.trunc(parsed) : 0))); setConfirmed(false); }}/></Field><label style={{ maxWidth: 560, color: quantity === 0 ? '#fda4af' : '#fde68a', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{quantity === 0 ? 'I confirm that all paid lanes should be removed by canceling the dedicated lane subscription at the end of its current billing period.' : 'I confirm this desired paid quantity and understand that Stripe may bill a prorated subscription change without opening Checkout.'}</span></label><button style={{ ...primary, ...(quantity === 0 ? { background: '#9f1239' } : {}), ...disabledStyle(canAdmin && !busy && lanePrice !== null && confirmed && !noChange) }} disabled={!canAdmin || !!busy || lanePrice === null || !confirmed || noChange} onClick={() => onCheckout(quantity)}><CreditCard size={15}/>{busy === 'lane-checkout' ? 'Submitting…' : quantity === 0 ? 'Schedule paid-lane cancellation' : 'Submit paid lane quantity'}</button></div></section></div>;
}
