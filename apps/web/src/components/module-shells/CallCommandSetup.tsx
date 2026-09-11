'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, PhoneCall, Sparkles } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import styles from './CallCommandSetup.module.css';

type Row = Record<string, any>;
const api = moduleShellApi.callcommand;
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const message = (error: unknown) => (error as Row)?.error || (error as Row)?.message || 'We could not complete that step. Your saved settings are still here.';

export default function CallCommandSetup({ product, commercial, canAdmin, refresh, hrefFor }: {
  product: Row; commercial: Row | null; canAdmin: boolean; refresh: () => Promise<void>; hrefFor: (path: string) => string;
}) {
  const profiles = (product.profiles as Row[]).filter(p => p.productMode === 'general' && p.status === 'active');
  const flows = (product.flows as Row[]).filter(f => f.productMode === 'general' && f.status === 'active');
  const [profileId, setProfileId] = useState(profiles.length === 1 ? String(profiles[0].id) : '');
  const profile = profiles.find(p => p.id === profileId);
  const [business, setBusiness] = useState({ businessName: profile?.businessName || '', businessDescription: profile?.businessDescription || '', greeting: profile?.greeting || '' });
  const [flowId, setFlowId] = useState(flows.length === 1 ? String(flows[0].id) : '');
  const [step, setStep] = useState(1);
  const [order, setOrder] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [search, setSearch] = useState({ areaCode: '', numberType: 'local' });
  const [numbers, setNumbers] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [accepted, setAccepted] = useState(false);
  const selectionKey = useRef('');
  const [pollCount, setPollCount] = useState(0);
  const prices = commercial?.pricing?.managedNumbers;
  const existingLocal = (commercial?.numbers as Row[] || []).filter(n => n.acquisitionMode === 'platform_provisioned' && n.lifecycleState !== 'RELEASED' && n.numberType === 'local').length;
  const amount = prices ? search.numberType === 'toll_free' ? Number(prices.tollFreeMonthlyCents) : existingLocal < Number(prices.includedLocalNumbers) ? 0 : Number(prices.additionalLocalMonthlyCents) : null;
  const channel = (commercial?.numbers as Row[] || []).find(n => n.id === order?.channelId);
  const runtime = commercial?.runtime || {};
  const billingReady = channel && (['included','active'].includes(channel.billingStatus)
    || (channel.billingStatus === 'grace_period' && new Date(channel.billingGraceExpiresAt).getTime() > Date.now()));
  const canActivate = channel?.status !== 'archived' && channel?.lifecycleState === 'ACTIVE' && channel?.healthStatus === 'healthy'
    && channel?.providerReady === true && !!billingReady && commercial?.readiness?.realtimeConfigured === true;
  const live = canActivate && channel?.status === 'active' && runtime.realtimeEnabled === true;
  const callVerified = (product.calls as Row[] || []).some(call => call.channelId === order?.channelId && call.provider === 'twilio'
    && call.realtimeStatus === 'completed' && call.status === 'completed');

  const loadOrder = useCallback(async () => {
    const result = await api.setupStatus() as Row;
    setOrder(result.order);
    if (result.order) {
      setProfileId(result.order.profileId); setFlowId(result.order.flowId); setStep(3);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void loadOrder().catch(e => { setError(message(e)); setLoaded(true); }); }, [loadOrder]);

  async function run(label: string, work: () => Promise<void>) {
    if (lock.current || !canAdmin) return;
    lock.current = true; setBusy(label); setError('');
    try { await work(); } catch (e) { setError(message(e)); }
    finally { lock.current = false; setBusy(''); }
  }

  const continueOrder = useCallback(async (id: string) => {
    const result = await api.setupContinue(id) as Row;
    setCheckoutUrl(result.checkoutUrl || '');
    setNotice(result.state === 'awaiting_payment' ? 'Waiting for payment confirmation. Your number selection is saved and setup will continue here automatically.'
      : result.state === 'provisioning' ? 'Connecting your number. You can return to this page without starting again.'
        : result.state === 'attention' ? 'Your number is saved. Its phone connection needs attention before activation.' : 'Your number and receptionist are connected. Turn on answering when you are ready.');
    await loadOrder(); await refresh();
    return result;
  }, [loadOrder, refresh]);

  useEffect(() => {
    if (!canAdmin || !loaded || !order || !['selected','awaiting_payment','provisioning'].includes(order.status) || error || pollCount >= 30) return;
    const timer = setTimeout(() => {
      if (lock.current) return;
      lock.current = true;
      void continueOrder(order.id).catch(e => setError(message(e))).finally(() => { lock.current = false; setPollCount(n => n + 1); });
    }, 4000);
    return () => clearTimeout(timer);
  }, [canAdmin, loaded, order, error, pollCount, continueOrder]);

  async function saveReceptionist() {
    const result = await api.setupReceptionist({ ...business, profileId: profileId || undefined, flowId: flowId || undefined }) as Row;
    setProfileId(result.profileId); setFlowId(result.flowId); await refresh(); setStep(2);
  }
  async function searchNumbers() {
    setSelected(null); setAccepted(false); setNumbers([]);
    const result = await api.commercialSearchNumbers({ ...search, areaCode: search.numberType === 'local' ? search.areaCode : undefined, country: 'US', limit: 8 }) as Row;
    setNumbers(result.numbers);
    setNotice(result.numbers.length ? 'Choose a number below. All number subscriptions are managed by OperatorOS.' : 'No numbers matched. Try a nearby area code.');
  }
  async function buyNumber() {
    if (!selected || amount === null || !accepted) return;
    const result = await api.setupSelectNumber({ phone: selected.phoneE164, profileId, flowId,
      monthlyAmountCents: amount, confirmMonthlyCharge: true, idempotencyKey: selectionKey.current }) as Row;
    await loadOrder();
    setStep(3);
    const progress = await continueOrder(result.orderId);
    if (progress.checkoutUrl) window.location.assign(progress.checkoutUrl);
  }
  async function activate() {
    if (!channel || !canActivate) return;
    await api.commercialUpdateRuntime({ ...runtime, realtimeEnabled: true, activationChannelId: channel.id });
    await refresh(); setNotice('Your AI receptionist is on. Call your number to hear it answer and confirm the result below.');
  }

  return <div className={styles.setup} data-testid="callcommand-guided-setup">
    <header className={styles.hero}>
      <span className={styles.eyebrow}>Your business. Always answered.</span>
      <h2>A receptionist, ready in three steps.</h2>
      <p>Tell us about your business, pick your number, and switch on your AI receptionist. OperatorOS handles the phone connection, AI configuration, and number subscription.</p>
      <ol className={styles.steps}>{['Your business', 'Your number', 'Start answering'].map((label, index) => <li key={label} className={step === index + 1 ? styles.current : undefined} aria-current={step === index + 1 ? 'step' : undefined}>{index + 1}. {label}</li>)}</ol>
    </header>
    {!canAdmin && <p className={styles.notice}>An organization owner or administrator can set up phone service. You can review the saved setup.</p>}
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {!loaded ? <p role="status">Loading your saved setup…</p> : step === 1 ? <form className={styles.panel} onSubmit={e => { e.preventDefault(); void run('Saving your receptionist', saveReceptionist); }}>
      <h3>1. Tell your receptionist about your business</h3>
      <p className={styles.muted}>We choose the voice and prepare the instructions. New businesses get a follow-up workflow automatically; existing workflows stay available.</p>
      <div className={styles.fields}>
        {profiles.length > 1 && <label className={styles.field}>Receptionist to configure<select required value={profileId} onChange={e => { const p = profiles.find(item => item.id === e.target.value); setProfileId(e.target.value); setBusiness({ businessName: p?.businessName || '', businessDescription: p?.businessDescription || '', greeting: p?.greeting || '' }); }}><option value="">Choose a receptionist</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {flows.length > 1 && <label className={styles.field}>What happens after a call?<select required value={flowId} onChange={e => setFlowId(e.target.value)}><option value="">Choose an existing workflow</option>{flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
        <label className={styles.field}>Business name<input required maxLength={160} autoComplete="organization" value={business.businessName} onChange={e => setBusiness({ ...business, businessName: e.target.value })}/></label>
        <label className={styles.field}>What should callers know?<textarea required maxLength={2000} value={business.businessDescription} placeholder="What you do, your opening hours, services, and what callers usually need help with." onChange={e => setBusiness({ ...business, businessDescription: e.target.value })}/></label>
        <label className={styles.field}>Greeting <span className={styles.muted}>Optional — we will write one using your business name.</span><input maxLength={1000} value={business.greeting} onChange={e => setBusiness({ ...business, greeting: e.target.value })}/></label>
      </div>
      <div className={styles.actions}><button className={styles.button} disabled={!canAdmin || !!busy || !business.businessName.trim() || !business.businessDescription.trim()}><Sparkles size={18}/>{busy || 'Save and choose a number'}</button></div>
    </form> : step === 2 ? <section className={styles.panel}>
      <h3>2. Choose your business number</h3>
      <div className={styles.price}><strong>{amount === null ? 'Pricing unavailable' : amount === 0 ? 'Your first local number is included' : `${money(amount)} / month`}</strong><p className={styles.muted}>Additional local numbers: {prices ? money(prices.additionalLocalMonthlyCents) : 'unavailable'}/month each. Toll-free numbers: {prices ? money(prices.tollFreeMonthlyCents) : 'unavailable'}/month each. Your CallCommand subscription and call usage are separate.</p></div>
      <form className={`${styles.search} ${styles.actions}`} onSubmit={e => { e.preventDefault(); void run('Finding numbers', searchNumbers); }}>
        <label className={styles.field}>Number type<select value={search.numberType} onChange={e => { setSearch({ ...search, numberType: e.target.value }); setNumbers([]); setSelected(null); setAccepted(false); }}><option value="local">US local number</option><option value="toll_free">US toll-free number</option></select></label>
        <label className={styles.field}>Preferred area code<input inputMode="numeric" maxLength={3} pattern="[0-9]{3}|" value={search.areaCode} disabled={search.numberType === 'toll_free'} placeholder="e.g. 910" onChange={e => setSearch({ ...search, areaCode: e.target.value.replace(/\D/g, '').slice(0,3) })}/></label>
        <button className={styles.secondary} disabled={!canAdmin || !!busy}>{busy || 'Find numbers'}</button>
      </form>
      <ul className={styles.numbers}>{numbers.map(n => <li key={n.phoneE164} className={`${styles.number} ${selected?.phoneE164 === n.phoneE164 ? styles.selected : ''}`}><div><strong>{n.phoneE164}</strong><span className={styles.muted}>{[n.locality,n.region].filter(Boolean).join(', ') || 'US business number'}</span></div><button className={styles.secondary} disabled={!!busy} aria-pressed={selected?.phoneE164 === n.phoneE164} onClick={() => { setSelected(n); setAccepted(false); selectionKey.current = `setup:${crypto.randomUUID()}`; }}>{selected?.phoneE164 === n.phoneE164 ? 'Selected' : 'Choose this number'}</button></li>)}</ul>
      {selected && <><label className={styles.check}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span>I approve {amount === 0 ? 'the included number' : `${money(amount!)} per month for this number`} through OperatorOS billing. Any existing CallCommand subscription and call-usage charges remain separate. Availability is confirmed when the number is connected.</span></label><div className={styles.actions}><button className={styles.button} disabled={!canAdmin || !!busy || !accepted || amount === null} onClick={() => void run('Connecting your number', buyNumber)}>{busy || (amount === 0 ? 'Connect my included number' : 'Continue to secure billing')}</button></div></>}
      <div className={styles.actions}><button className={styles.secondary} onClick={() => setStep(1)} disabled={!!busy}>Back to your business</button></div>
    </section> : <section className={styles.panel}>
      <h3>3. {live ? 'Your receptionist is answering' : 'Start answering calls'}</h3>
      {order && <p className={styles.price}><strong>{order.phone}</strong><br/><span className={styles.muted}>{Number(order.monthlyAmountCents) === 0 ? 'Included local number' : `${money(Number(order.monthlyAmountCents))} / month through OperatorOS`}</span></p>}
      <ul className={styles.checks}>{[
        [!!profileId, 'Business receptionist saved'], [!!channel, 'Phone number connected'], [!!billingReady, 'Number subscription confirmed'],
        [live, 'AI answering enabled'], [callVerified, 'First AI call completed'],
      ].map(([done,label]) => <li key={String(label)}>{done ? <CheckCircle2 size={19}/> : <Circle size={19}/>}<span>{label}</span></li>)}</ul>
      {!commercial?.readiness?.realtimeConfigured && <p className={styles.notice}>The OperatorOS voice service needs support attention. Your business settings are saved. Contact OperatorOS support to finish the connection.</p>}
      <div className={styles.actions}>
        {checkoutUrl && !billingReady && <a className={styles.button} href={checkoutUrl}>Complete secure payment</a>}
        {canActivate && !live && <button className={styles.button} disabled={!canAdmin || !!busy} onClick={() => void run('Turning on your receptionist', activate)}><Sparkles size={18}/>{busy || 'Turn on my receptionist'}</button>}
        {channel && !canActivate && <button className={styles.secondary} disabled={!canAdmin || !!busy} onClick={() => void run('Checking the phone connection', async () => { await api.commercialRepairNumber(channel.id); await refresh(); })}>Check and repair connection</button>}
        {live && channel?.dialNumber && <a className={styles.button} href={`tel:${channel.dialNumber}`}><PhoneCall size={18}/>Call your receptionist</a>}
        <button className={styles.secondary} disabled={!!busy || !canAdmin} onClick={() => void run('Checking setup', async () => { setPollCount(0); if (order && !order.channelId) await continueOrder(order.id); else await refresh(); })}>{busy ? <Loader2 size={18}/> : null}Check progress</button>
        <a className={styles.secondary} href={hrefFor('/calls')}>View calls and follow-ups</a>
        {order && !order.channelId && <button className={styles.secondary} disabled={!canAdmin || !!busy} onClick={() => void run('Changing selection', async () => { await api.setupCancel(order.id); setOrder(null); setCheckoutUrl(''); setSelected(null); setNumbers([]); setAccepted(false); setNotice('Choose another number. Existing paid number capacity stays on your account.'); setStep(2); })}>Choose another number</button>}
        {live && <button className={styles.secondary} onClick={() => { setOrder(null); setSelected(null); setAccepted(false); setNumbers([]); setStep(2); }}>Add another number</button>}
      </div>
      {live && !callVerified && <p className={styles.muted}>Make a short test call, leave a request, then check progress. A completed AI call is the final confirmation that your receptionist works.</p>}
    </section>}
  </div>;
}
