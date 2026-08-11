'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileUp,
  Gauge,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Users,
  Wrench,
} from 'lucide-react';
import {
  moduleShellApi,
  type TorqueShedDashboard,
  type TorqueShedDiagnostic,
  type TorqueShedVehicle,
  type TorqueAssistResponse,
  type TorqueAssistResult,
  type TorqueAssistStatus,
} from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import { ShellLiveBadge } from './ShellChrome';
import { TorqueShedCommunityPanel, TorqueShedMarketplacePanel } from './TorqueShedSocialPanels';
import { TorqueShedJournalPanel, TorqueShedLiveBayPanel, TorqueShedUtilityPanel } from './TorqueShedRestorationPanels';
import TorqueShedNativeAuthorizePanel from './TorqueShedNativeAuthorizePanel';

type Tab = 'dashboard' | 'garage' | 'service' | 'builds' | 'journal' | 'diagnostics' | 'live' | 'templates' | 'marketplace' | 'community' | 'tools';

function errorText(error: unknown): string {
  void error;
  return 'TorqueShed could not confirm that action. Your saved records are still available. Check the form, refresh if needed, and try again.';
}

function number(value: FormDataEntryValue | null): number | undefined {
  if (value === null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

let keySequence = 0;
function key(prefix: string): string {
  keySequence += 1;
  return `torqueshed:${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${keySequence}`}`;
}

function money(value: unknown): string {
  const minor = Number(value ?? 0);
  return Number.isFinite(minor)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(minor / 100)
    : '$0.00';
}

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  background: semantic.bg,
  color: semantic.text,
  padding: '10px 11px',
  fontSize: fontSize.body,
};
const label: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  color: semantic.textMuted,
  fontSize: fontSize.sm,
};
const button: React.CSSProperties = {
  minHeight: 44,
  border: 0,
  borderRadius: radius.sm,
  background: '#f59e0b',
  color: '#18130a',
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
};

export default function TorqueShedWorkspace() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<TorqueShedDashboard | null>(null);
  const [vehicles, setVehicles] = useState<TorqueShedVehicle[]>([]);
  const [builds, setBuilds] = useState<Array<Record<string, any>>>([]);
  const [diagnostics, setDiagnostics] = useState<TorqueShedDiagnostic[]>([]);
  const [reminders, setReminders] = useState<Array<Record<string, any>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, any>>>([]);
  const [vendors, setVendors] = useState<Array<Record<string, any>>>([]);
  const [vehicleDetail, setVehicleDetail] = useState<Record<string, any> | null>(null);
  const [diagnosticDetail, setDiagnosticDetail] = useState<Record<string, any> | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nativeAuthorization, setNativeAuthorization] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (search.trim()) query.set('search', search.trim());
      const [
        dashboardData,
        vehicleData,
        buildData,
        diagnosticData,
        reminderData,
        templateData,
        vendorData,
      ] = await Promise.all([
        moduleShellApi.torqueshed.dashboard(),
        moduleShellApi.torqueshed.listVehicles(query.toString()),
        moduleShellApi.torqueshed.listBuilds(),
        moduleShellApi.torqueshed.listDiagnostics('limit=100'),
        moduleShellApi.torqueshed.listReminders(),
        moduleShellApi.torqueshed.listTemplates(),
        moduleShellApi.torqueshed.listVendors(),
      ]);
      setDashboard(dashboardData);
      setVehicles(vehicleData.vehicles);
      setBuilds(buildData.builds);
      setDiagnostics(diagnosticData.diagnostics);
      setReminders(reminderData.reminders);
      setTemplates(templateData.templates);
      setVendors(vendorData.vendors);
    } catch (next) {
      setError(errorText(next));
    } finally {
      setLoading(false);
    }
  }, [search]);

  const openVehicle = useCallback(async (id: string) => {
    setBusy('vehicle-detail');
    setError('');
    try {
      setVehicleDetail(await moduleShellApi.torqueshed.getVehicle(id));
      setTab('garage');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, []);

  const openDiagnostic = useCallback(async (id: string) => {
    setBusy('diagnostic-detail');
    setError('');
    try {
      setDiagnosticDetail(await moduleShellApi.torqueshed.getDiagnostic(id));
      setTab('diagnostics');
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let manifest = document.querySelector<HTMLLinkElement>('link[data-torqueshed-manifest]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.href = '/torqueshed.webmanifest';
      manifest.dataset.torqueshedManifest = 'true';
      document.head.appendChild(manifest);
    }
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/torqueshed-sw.js', { scope: '/modules/torqueshed/' });
    }
    return () => manifest?.remove();
  }, []);
  useEffect(() => {
    const path = window.location.pathname;
    if (/\/native-auth\/?$/.test(path)) {
      setNativeAuthorization(true);
      return;
    }
    const diagnostic = path.match(/\/diagnostics\/([a-z0-9-]+)\/?$/i);
    const vehicle = path.match(/\/vehicles\/([a-z0-9-]+)\/?$/i);
    if (diagnostic?.[1]) void openDiagnostic(diagnostic[1]);
    else if (/\/diagnostics(?:\/|$)/.test(path)) setTab('diagnostics');
    else if (vehicle?.[1]) void openVehicle(vehicle[1]);
    else if (/\/(?:garage|vehicles)(?:\/|$)/.test(path)) setTab('garage');
    else if (/\/(?:maintenance|repairs|reminders)(?:\/|$)/.test(path)) setTab('service');
    else if (/\/builds(?:\/|$)/.test(path)) setTab('builds');
    else if (/\/(?:journal|build-journal)(?:\/|$)/.test(path)) setTab('journal');
    else if (/\/(?:live-bay|live-bays)(?:\/|$)/.test(path)) setTab('live');
    else if (/\/marketplace(?:\/|$)/.test(path)) setTab('marketplace');
    else if (/\/community(?:\/|$)/.test(path)) setTab('community');
    else if (/\/(?:search|activity|notifications|exports|settings)(?:\/|$)/.test(path)) setTab('tools');
    else if (/\/diagnostic-templates(?:\/|$)/.test(path)) setTab('templates');
  }, [openDiagnostic, openVehicle]);

  async function mutate(
    name: string,
    operation: () => Promise<unknown>,
    form?: HTMLFormElement,
    refresh?: () => Promise<void>,
  ) {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await operation();
      form?.reset();
      setNotice(`${name} saved.`);
      await load();
      if (refresh) await refresh();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  const selectedVehicleId = vehicleDetail?.vehicle?.id ?? vehicles[0]?.id ?? '';
  const vehicleOptions = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        id: vehicle.id,
        name: `${vehicle.nickname ? `${vehicle.nickname} — ` : ''}${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      })),
    [vehicles],
  );

  function vehicleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      'Vehicle',
      () =>
        moduleShellApi.torqueshed.createVehicle({
          nickname: data.get('nickname'),
          year: number(data.get('year')),
          make: data.get('make'),
          model: data.get('model'),
          trim: data.get('trim'),
          engine: data.get('engine'),
          transmission: data.get('transmission'),
          drivetrain: data.get('drivetrain'),
          currentMileage: number(data.get('mileage')),
          vin: data.get('vin'),
          visibility: data.get('visibility'),
        }),
      form,
    );
  }

  function serviceForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const vehicleId = String(data.get('vehicleId'));
    void mutate(
      'Service record',
      () =>
        moduleShellApi.torqueshed.addServiceRecord(
          vehicleId,
          {
            kind: data.get('kind'),
            title: data.get('title'),
            description: data.get('description'),
            mileage: number(data.get('mileage')),
            laborMinutes: number(data.get('laborMinutes')),
            laborCostMinor: number(data.get('laborCostMinor')),
            partsCostMinor: number(data.get('partsCostMinor')),
            vendorId: data.get('vendorId') || undefined,
            occurredAt: new Date().toISOString(),
            status: 'completed',
          },
          key('service'),
        ),
      form,
      vehicleDetail?.vehicle?.id === vehicleId ? () => openVehicle(vehicleId) : undefined,
    );
  }

  function diagnosticForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      'Diagnostic session',
      () =>
        moduleShellApi.torqueshed.createDiagnostic({
          vehicleId: data.get('vehicleId'),
          title: data.get('title'),
          customerConcern: data.get('customerConcern'),
          symptoms: data.get('symptoms'),
          visibility: data.get('visibility'),
        }),
      form,
    );
  }

  if (nativeAuthorization) return <TorqueShedNativeAuthorizePanel />;

  return (
    <main
      data-testid="torqueshed-module-shell"
      style={{ maxWidth: 1320, margin: '0 auto', padding: space.xxl, colorScheme: 'dark', position: 'relative' }}
    >
      <style>{`
        [data-testid="torqueshed-module-shell"]:before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background:radial-gradient(circle at 80% 5%,rgba(245,158,11,.10),transparent 28rem),repeating-linear-gradient(110deg,transparent 0 74px,rgba(255,255,255,.012) 75px 76px); }
        [data-testid="torqueshed-module-shell"] h2,[data-testid="torqueshed-module-shell"] h3,[data-testid="torqueshed-module-shell"] h4 { letter-spacing:-.02em; color:#f8fafc; }
        .ts28-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
        .ts28-live { display:grid; grid-template-columns:minmax(280px,.65fr) minmax(0,1.35fr); gap:18px; min-height:680px; }
        .ts28-hero { display:flex; align-items:center; justify-content:space-between; gap:24px; overflow:hidden; position:relative; border-color:#8a5b16 !important; background:linear-gradient(118deg,#2a1d0b,#151719 55%,#111315) !important; }
        .ts28-hero:after { content:""; width:260px; height:260px; position:absolute; right:-120px; border:34px solid rgba(245,158,11,.08); border-radius:50%; }
        .ts28-hero h2 { margin:4px 0; font-size:clamp(24px,4vw,42px); text-transform:uppercase; font-style:italic; }
        .ts28-hero p,.ts28-muted { color:#a8a29e; line-height:1.55; margin:4px 0; }
        .ts28-kicker { color:#fbbf24; text-transform:uppercase; letter-spacing:.16em; font-size:11px; font-weight:900; }
        .ts28-form { display:grid; gap:12px; margin-top:16px; }
        .ts28-form h3,.ts28-live-title,.ts28-chat>header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0; }
        .ts28-form h3 { justify-content:flex-start; }
        .ts28-two,.ts28-three { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
        .ts28-three { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .ts28-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0; }
        .ts28-stats b { background:#0b0d0f; border:1px solid #332b21; border-radius:10px; padding:10px; color:#fbbf24; }
        .ts28-stats small { display:block; color:#78716c; font-weight:600; margin-top:3px; }
        .ts28-list,.ts28-bays { display:grid; gap:8px; margin-top:14px; }
        .ts28-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px; background:#0b0d0f; border:1px solid #29241d; border-radius:10px; }
        .ts28-row>div { display:grid; gap:4px; min-width:0; } .ts28-row small { color:#8e8880; overflow:hidden; text-overflow:ellipsis; } .ts28-row span { color:#fbbf24; font-size:12px; text-transform:uppercase; }
        .ts28-timeline { display:grid; gap:0; }.ts28-event { display:grid; grid-template-columns:26px 1fr; gap:10px; }.ts28-event i { width:10px;height:10px;border-radius:50%;background:#f59e0b;margin:7px auto;box-shadow:0 0 0 5px rgba(245,158,11,.12);position:relative;}.ts28-event i:after{content:"";width:1px;background:#554020;position:absolute;top:15px;bottom:-120px;left:5px}.ts28-event h4,.ts28-event p{margin:3px 0}.ts28-event span{color:#fbbf24;text-transform:uppercase;font-size:10px;font-weight:900;letter-spacing:.1em}.ts28-event small{color:#78716c}.ts28-event>div{padding-bottom:20px}
        .ts28-alert { grid-column:1/-1; padding:12px; border:1px solid #7f1d1d; color:#fecaca; background:#450a0a55; border-radius:10px; }
        .ts28-bays button { text-align:left;display:grid;gap:3px;padding:11px;border-radius:10px;border:1px solid #30291f;background:#0c0e10;color:#e7e5e4;cursor:pointer }.ts28-bays button.active{border-color:#f59e0b;background:#f59e0b10}.ts28-bays span{color:#78716c;font-size:11px}
        .ts28-chat { display:grid;grid-template-rows:auto 1fr auto auto;gap:12px;min-height:620px }.ts28-chat header small{color:#78716c}.ts28-messages{overflow:auto;display:flex;flex-direction:column;gap:10px;padding:12px;background:#08090a;border-radius:12px;border:1px solid #29241d;max-height:500px}.ts28-message{max-width:82%;padding:10px 12px;border:1px solid #3b3226;border-radius:4px 14px 14px 14px;background:#17191c}.ts28-message>div{display:flex;justify-content:space-between;gap:20px}.ts28-message b{color:#fbbf24}.ts28-message time{font-size:10px;color:#78716c}.ts28-message p{margin:5px 0;white-space:pre-wrap}.ts28-send{display:grid;grid-template-columns:1fr auto;gap:8px}.ts28-safe{display:flex;gap:7px;align-items:center;color:#78716c;font-size:11px;margin:0}.ts28-pulse{animation:ts28-pulse 1.5s infinite}@keyframes ts28-pulse{50%{filter:drop-shadow(0 0 7px #22c55e)}}
        .ts28-report{display:grid;gap:5px;margin-top:12px;padding:12px;background:#0b0d0f;border-radius:10px;border:1px solid #30291f}.ts28-report p{margin:0;color:#a8a29e}.ts28-report small{color:#fbbf24}.ts28-report output{overflow-wrap:anywhere;color:#86efac;margin-top:8px}.ts28-check{display:flex;align-items:center;gap:8px;color:#d6d3d1}.ts28-actions{display:flex;gap:8px;flex-wrap:wrap}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
        @media (prefers-reduced-motion:reduce){.ts28-pulse{animation:none}}
        @media (max-width: 900px) { .ts28-grid,.ts28-live { grid-template-columns:minmax(0,1fr); }.ts28-live{min-height:0}.ts28-chat{min-height:560px} }
        @media (max-width: 760px) { [data-testid="torqueshed-builds"], [data-testid="torqueshed-diagnostics"] { grid-template-columns: minmax(0, 1fr) !important; } [data-testid="torqueshed-module-shell"] { padding: 16px !important; } .ts28-three{grid-template-columns:minmax(0,1fr)} }
        @media (max-width: 560px) { [data-testid="torqueshed-garage"] form > div, [data-testid="torqueshed-service"] form > div,.ts28-two { grid-template-columns: minmax(0, 1fr) !important; }.ts28-send{grid-template-columns:1fr}.ts28-send button{width:100%}.ts28-message{max-width:96%}.ts28-stats{grid-template-columns:1fr}.ts28-hero svg{display:none} }
      `}</style>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: space.lg,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          marginBottom: space.xl,
        }}
      >
        <div style={{ display: 'flex', gap: space.md }}>
          <div
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              borderRadius: radius.md,
              background: '#f59e0b20',
              border: '1px solid #f59e0b55',
            }}
          >
            <Wrench color="#f59e0b" />
          </div>
          <div>
            <div
              style={{
                color: '#f59e0b',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Vehicle service and diagnostics
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h1 style={{ margin: '3px 0', color: semantic.text }}>TorqueShed</h1>
              <ShellLiveBadge />
            </div>
            <p style={{ color: semantic.textMuted, margin: 0 }}>
              Keep vehicle history, repairs, reminders, projects, and diagnostic evidence in one place.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={() => setTab(vehicles.length ? 'diagnostics' : 'garage')} style={button}>
            {vehicles.length ? <Activity size={16} /> : <Plus size={16} />}
            {vehicles.length ? 'Start a diagnostic' : 'Add your first vehicle'}
          </button>
          <a
            href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}
            style={{ ...button, color: '#f59e0b', background: 'transparent', border: '1px solid #f59e0b66', textDecoration: 'none' }}
          >
            <ArrowLeft size={16} /> My Apps
          </a>
        </div>
      </header>

      <div
        style={{
          ...cardStyle,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: space.lg,
          padding: 8,
        }}
      >
        {(
          [
            ['dashboard', 'Overview', Gauge],
            ['garage', 'Vehicles', Car],
            ['service', 'Service records', Wrench],
            ['diagnostics', 'Diagnostics', Activity],
            ['builds', 'Projects', Settings2],
          ] as const
        ).map(([id, name, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            style={{
              ...button,
              background: tab === id ? '#f59e0b' : 'transparent',
              color: tab === id ? '#18130a' : semantic.textMuted,
            }}
          >
            <Icon size={15} />
            {name}
          </button>
        ))}
        <details style={{ position: 'relative' }}>
          <summary style={{ ...button, minHeight: 44, background: 'transparent', color: semantic.textMuted, listStyle: 'none' }}>
            More tools
          </summary>
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 10, minWidth: 220, display: 'grid', gap: 5, padding: 8, borderRadius: radius.md, border: `1px solid ${semantic.border}`, background: semantic.bgPanel, boxShadow: '0 16px 40px rgba(0,0,0,.35)' }}>
            {(
              [
                ['templates', 'Templates and vendors', ClipboardCheck],
                ['marketplace', 'Parts marketplace', Store],
                ['community', 'Community', Users],
                ['journal', 'Build journal', ClipboardCheck],
                ['live', 'Live bay', Activity],
                ['tools', 'Search, reports and settings', Search],
              ] as const
            ).map(([id, name, Icon]) => (
              <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} style={{ ...button, width: '100%', justifyContent: 'flex-start', background: tab === id ? '#f59e0b' : 'transparent', color: tab === id ? '#18130a' : semantic.textMuted }}>
                <Icon size={15} /> {name}
              </button>
            ))}
          </div>
        </details>
        <button
          onClick={() => void load()}
          disabled={loading}
          style={{
            ...button,
            marginLeft: 'auto',
            background: 'transparent',
            color: semantic.textMuted,
          }}
        >
          <RefreshCw size={15} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            color: semantic.accentDanger,
            display: 'flex',
            gap: 8,
            marginBottom: space.md,
          }}
        >
          <AlertTriangle size={18} />
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          style={{
            ...cardStyle,
            borderColor: '#16a34a77',
            color: '#22c55e',
            display: 'flex',
            gap: 8,
            marginBottom: space.md,
          }}
        >
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      <div
        style={{
          ...cardStyle,
          borderColor: '#f59e0b44',
          background: '#f59e0b0b',
          color: semantic.textMuted,
          display: 'flex',
          gap: 9,
          marginBottom: space.lg,
        }}
      >
        <ShieldCheck size={18} color="#f59e0b" />
        <span>
          Private by default: VINs are protected and shown only as a masked suffix. Shared build pages never show
          maintenance costs, files, or private diagnostic notes.
        </span>
      </div>

      {tab === 'marketplace' && <TorqueShedMarketplacePanel />}
      {tab === 'community' && <TorqueShedCommunityPanel />}
      {tab === 'journal' && <TorqueShedJournalPanel builds={builds} />}
      {tab === 'live' && <TorqueShedLiveBayPanel vehicles={vehicles} builds={builds} diagnostics={diagnostics} />}
      {tab === 'tools' && <TorqueShedUtilityPanel diagnostics={diagnostics} />}

      {tab === 'dashboard' && (
        <section data-testid="torqueshed-dashboard" style={{ display: 'grid', gap: space.lg }}>
          {(vehicles.length === 0 || diagnostics.length === 0) && (
            <article style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, flexWrap: 'wrap', borderColor: '#f59e0b66', background: '#f59e0b0b' }}>
              <div>
                <h2 style={{ margin: 0, color: semantic.text, fontSize: 18 }}>{vehicles.length === 0 ? 'Start with the vehicle' : 'Ready to diagnose a concern?'}</h2>
                <p style={{ margin: '6px 0 0', color: semantic.textMuted, lineHeight: 1.5 }}>
                  {vehicles.length === 0
                    ? 'Add the year, make, and model once. Then service history, reminders, and diagnostics stay connected to that vehicle.'
                    : 'Open a diagnostic session to record the customer concern, codes, tests, evidence, and final fix.'}
                </p>
              </div>
              <button type="button" onClick={() => setTab(vehicles.length === 0 ? 'garage' : 'diagnostics')} style={button}>
                {vehicles.length === 0 ? <Plus size={16} /> : <Activity size={16} />}
                {vehicles.length === 0 ? 'Add vehicle' : 'Start diagnostic'}
              </button>
            </article>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))',
              gap: space.md,
            }}
          >
            {[
              ['Vehicles', dashboard?.metrics.vehicles ?? 0],
              ['Service records', dashboard?.metrics.serviceRecords ?? 0],
              ['Builds', dashboard?.metrics.builds ?? 0],
              ['Diagnostics', dashboard?.metrics.diagnostics ?? 0],
              ['Due reminders', dashboard?.metrics.reminders ?? 0],
              ['Recorded service cost', money(dashboard?.metrics.serviceCostMinor)],
            ].map(([name, value]) => (
              <article key={name} style={cardStyle}>
                <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{name}</div>
                <strong style={{ color: semantic.text, fontSize: 24 }}>{value}</strong>
              </article>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))',
              gap: space.lg,
            }}
          >
            <article style={cardStyle}>
              <h2 style={{ marginTop: 0, color: semantic.text }}>Recent diagnostics</h2>
              {diagnostics.slice(0, 5).map((row) => (
                <button
                  key={row.id}
                  onClick={() => void openDiagnostic(row.id)}
                  style={{
                    ...button,
                    width: '100%',
                    background: 'transparent',
                    color: semantic.text,
                    borderTop: `1px solid ${semantic.border}`,
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{row.title}</span>
                  <span style={{ color: '#f59e0b' }}>{row.status}</span>
                </button>
              ))}
              {diagnostics.length === 0 && (
                <p style={{ color: semantic.textMuted }}>No diagnostic sessions yet. Use Start diagnostic above when a vehicle has been added.</p>
              )}
            </article>
            <article style={cardStyle}>
              <h2 style={{ marginTop: 0, color: semantic.text }}>Upcoming service</h2>
              {reminders.slice(0, 5).map((row) => (
                <div
                  key={row.id}
                  style={{
                    padding: '9px 0',
                    borderTop: `1px solid ${semantic.border}`,
                    color: semantic.text,
                  }}
                >
                  {row.title}
                  <div style={{ fontSize: fontSize.sm, color: semantic.textMuted }}>
                    {row.dueMileage
                      ? `Due at ${Number(row.dueMileage).toLocaleString()} mi`
                      : row.dueAt
                        ? new Date(row.dueAt).toLocaleDateString()
                        : 'Scheduled'}
                  </div>
                </div>
              ))}
              {reminders.length === 0 && (
                <p style={{ color: semantic.textMuted }}>No service reminders are due. Add one from Service records when you know the next date or mileage.</p>
              )}
            </article>
          </div>
        </section>
      )}

      {tab === 'garage' && (
        <section
          data-testid="torqueshed-garage"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: space.md }}>
            <form onSubmit={vehicleForm} style={{ ...cardStyle, display: 'grid', gap: space.sm }}>
              <h2 style={{ margin: 0, color: semantic.text }}>Add vehicle</h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                  gap: space.sm,
                }}
              >
                <label style={label}>
                  Year
                  <input
                    name="year"
                    type="number"
                    min="1886"
                    max={new Date().getFullYear() + 2}
                    required
                    style={input}
                  />
                </label>
                <label style={label}>
                  Nickname
                  <input name="nickname" maxLength={100} style={input} />
                </label>
              </div>
              <label style={label}>
                Make
                <input name="make" required maxLength={100} style={input} />
              </label>
              <label style={label}>
                Model
                <input name="model" required maxLength={100} style={input} />
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                  gap: space.sm,
                }}
              >
                <label style={label}>
                  Trim
                  <input name="trim" style={input} />
                </label>
                <label style={label}>
                  Mileage
                  <input name="mileage" type="number" min="0" style={input} />
                </label>
              </div>
              <label style={label}>
                Engine
                <input name="engine" style={input} />
              </label>
              <label style={label}>
                Transmission
                <input name="transmission" style={input} />
              </label>
              <label style={label}>
                Drivetrain
                <input name="drivetrain" style={input} />
              </label>
              <label style={label}>
                VIN (masked after save)
                <input name="vin" minLength={17} maxLength={17} autoComplete="off" style={input} />
              </label>
              <label style={label}>
                Visibility
                <select name="visibility" style={input}>
                  <option value="private">Private</option>
                  <option value="tenant">Team</option>
                  <option value="public_build">Public-build eligible</option>
                </select>
              </label>
              <button disabled={busy === 'Vehicle'} style={button}>
                <Plus size={16} />
                Save vehicle
              </button>
            </form>
          </div>
          <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Search size={18} color={semantic.textMuted} />
              <input
                aria-label="Search garage"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search make, model, or nickname"
                style={input}
              />
            </div>
            {vehicles.map((row) => (
              <article key={row.id} style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
                <button
                  onClick={() => void openVehicle(row.id)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    color: semantic.text,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <h3 style={{ margin: 0 }}>
                    {row.nickname || `${row.year} ${row.make} ${row.model}`}
                  </h3>
                  <div style={{ color: semantic.textMuted, marginTop: 5 }}>
                    {row.year} {row.make} {row.model} {row.trim || ''} ·{' '}
                    {row.currentMileage?.toLocaleString() ?? '—'} mi ·{' '}
                    {row.vinMasked ?? 'VIN not recorded'}
                  </div>
                </button>
              </article>
            ))}
            {vehicles.length === 0 && !loading && (
              <div style={{ ...cardStyle, color: semantic.textMuted }}>
                No vehicles match this garage view.
              </div>
            )}
            {vehicleDetail && (
              <article style={{ ...cardStyle, borderColor: '#f59e0b55' }}>
                <h2 style={{ marginTop: 0, color: semantic.text }}>
                  {vehicleDetail.vehicle.nickname ||
                    `${vehicleDetail.vehicle.year} ${vehicleDetail.vehicle.make} ${vehicleDetail.vehicle.model}`}
                </h2>
                <p style={{ color: semantic.textMuted }}>
                  {vehicleDetail.serviceRecords.length} service records ·{' '}
                  {vehicleDetail.diagnostics.length} diagnostic sessions ·{' '}
                  {vehicleDetail.builds.length} builds
                </p>
                {vehicleDetail.serviceRecords.slice(0, 5).map((row: any) => (
                  <div
                    key={row.id}
                    style={{
                      padding: '8px 0',
                      borderTop: `1px solid ${semantic.border}`,
                      color: semantic.text,
                    }}
                  >
                    {row.title}
                    <span style={{ float: 'right', color: semantic.textMuted }}>
                      {money(row.totalCostMinor)}
                    </span>
                  </div>
                ))}
              </article>
            )}
          </div>
        </section>
      )}

      {tab === 'service' && (
        <section
          data-testid="torqueshed-service"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          <form onSubmit={serviceForm} style={{ ...cardStyle, display: 'grid', gap: space.sm }}>
            <h2 style={{ margin: 0, color: semantic.text }}>Record maintenance or repair</h2>
            <label style={label}>
              Vehicle
              <select name="vehicleId" required defaultValue={selectedVehicleId} style={input}>
                {vehicleOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Record type
              <select name="kind" style={input}>
                <option value="maintenance">Maintenance</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
                <option value="modification">Modification</option>
              </select>
            </label>
            <label style={label}>
              Title
              <input name="title" required maxLength={180} style={input} />
            </label>
            <label style={label}>
              Description
              <textarea name="description" rows={3} style={input} />
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                gap: space.sm,
              }}
            >
              <label style={label}>
                Mileage
                <input name="mileage" type="number" min="0" style={input} />
              </label>
              <label style={label}>
                Labor minutes
                <input name="laborMinutes" type="number" min="0" style={input} />
              </label>
              <label style={label}>
                Labor cost (cents)
                <input name="laborCostMinor" type="number" min="0" style={input} />
              </label>
              <label style={label}>
                Parts cost (cents)
                <input name="partsCostMinor" type="number" min="0" style={input} />
              </label>
            </div>
            <label style={label}>
              Vendor
              <select name="vendorId" style={input}>
                <option value="">No vendor</option>
                {vendors.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!vehicles.length || busy === 'Service record'} style={button}>
              <Plus size={16} />
              Save service record
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void mutate(
                'Service reminder',
                () =>
                  moduleShellApi.torqueshed.createReminder(String(data.get('vehicleId')), {
                    title: data.get('title'),
                    dueMileage: number(data.get('dueMileage')),
                    dueAt: data.get('dueAt')
                      ? new Date(String(data.get('dueAt'))).toISOString()
                      : undefined,
                  }),
                form,
              );
            }}
            style={{ ...cardStyle, display: 'grid', gap: space.sm }}
          >
            <h2 style={{ margin: 0, color: semantic.text }}>Schedule reminder</h2>
            <label style={label}>
              Vehicle
              <select name="vehicleId" required defaultValue={selectedVehicleId} style={input}>
                {vehicleOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Reminder
              <input name="title" required style={input} />
            </label>
            <label style={label}>
              Due mileage
              <input name="dueMileage" type="number" min="0" style={input} />
            </label>
            <label style={label}>
              Due date
              <input name="dueAt" type="date" style={input} />
            </label>
            <button disabled={!vehicles.length || busy === 'Service reminder'} style={button}>
              <Plus size={16} />
              Save reminder
            </button>
            <h3 style={{ color: semantic.text }}>Open reminders</h3>
            {reminders.map((row) => (
              <div
                key={row.id}
                style={{
                  color: semantic.textMuted,
                  borderTop: `1px solid ${semantic.border}`,
                  paddingTop: 8,
                }}
              >
                {row.title} · {row.status}
              </div>
            ))}
          </form>
        </section>
      )}

      {tab === 'builds' && (
        <section
          data-testid="torqueshed-builds"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px,.8fr) minmax(320px,1.3fr)',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void mutate(
                'Build',
                () =>
                  moduleShellApi.torqueshed.createBuild({
                    vehicleId: data.get('vehicleId') || undefined,
                    title: data.get('title'),
                    description: data.get('description'),
                    visibility: data.get('visibility'),
                    budgetMinor: number(data.get('budgetMinor')),
                  }),
                form,
              );
            }}
            style={{ ...cardStyle, display: 'grid', gap: space.sm }}
          >
            <h2 style={{ margin: 0, color: semantic.text }}>Start project build</h2>
            <label style={label}>
              Vehicle
              <select name="vehicleId" style={input}>
                <option value="">Unlinked build</option>
                {vehicleOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Title
              <input name="title" required style={input} />
            </label>
            <label style={label}>
              Description
              <textarea name="description" rows={4} style={input} />
            </label>
            <label style={label}>
              Budget (cents)
              <input name="budgetMinor" type="number" min="0" style={input} />
            </label>
            <label style={label}>
              Visibility
              <select name="visibility" style={input}>
                <option value="private">Private</option>
                <option value="tenant">Team</option>
                <option value="public_build">Public-build eligible</option>
              </select>
            </label>
            <button style={button}>
              <Plus size={16} />
              Save build
            </button>
          </form>
          <div style={{ display: 'grid', gap: space.md }}>
            {builds.map((row) => (
              <article key={row.id} style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
                <h3 style={{ margin: 0, color: semantic.text }}>{row.title}</h3>
                <p style={{ color: semantic.textMuted }}>
                  {row.description || 'No description'} · {row.status} · {money(row.budgetMinor)}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const data = new FormData(form);
                    void mutate(
                      'Build task',
                      () =>
                        moduleShellApi.torqueshed.addBuildTask(row.id, {
                          title: data.get('title'),
                        }),
                      form,
                    );
                  }}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <input name="title" required placeholder="Add a build task" style={input} />
                  <button style={button}>
                    <Plus size={15} />
                  </button>
                </form>
              </article>
            ))}
            {!builds.length && (
              <div style={{ ...cardStyle, color: semantic.textMuted }}>No build projects yet.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'diagnostics' && (
        <section
          data-testid="torqueshed-diagnostics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px,.85fr) minmax(340px,1.4fr)',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          <form onSubmit={diagnosticForm} style={{ ...cardStyle, display: 'grid', gap: space.sm }}>
            <h2 style={{ margin: 0, color: semantic.text }}>Start diagnostic session</h2>
            <label style={label}>
              Vehicle
              <select name="vehicleId" required defaultValue={selectedVehicleId} style={input}>
                {vehicleOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={label}>
              Title
              <input name="title" required style={input} />
            </label>
            <label style={label}>
              Customer concern
              <textarea name="customerConcern" required rows={3} style={input} />
            </label>
            <label style={label}>
              Symptoms
              <textarea name="symptoms" rows={3} style={input} />
            </label>
            <label style={label}>
              Visibility
              <select name="visibility" style={input}>
                <option value="private">Private</option>
                <option value="tenant">Team</option>
              </select>
            </label>
            <button disabled={!vehicles.length} style={button}>
              <Plus size={16} />
              Start session
            </button>
          </form>
          <div style={{ display: 'grid', gap: space.md }}>
            {diagnostics.map((row) => (
              <button
                key={row.id}
                data-record-id={row.id}
                onClick={() => void openDiagnostic(row.id)}
                style={{
                  ...cardStyle,
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: semantic.bg,
                  color: semantic.text,
                  borderLeft: '3px solid #f59e0b',
                }}
              >
                <strong>{row.title}</strong>
                <div style={{ color: semantic.textMuted, marginTop: 5 }}>
                  {row.nickname || `${row.year ?? ''} ${row.make ?? ''} ${row.model ?? ''}`} ·{' '}
                  {row.status}
                </div>
              </button>
            ))}
            {diagnosticDetail && (
              <DiagnosticDetail
                detail={diagnosticDetail}
                busy={busy}
                mutate={mutate}
                refresh={() => openDiagnostic(diagnosticDetail.diagnostic.id)}
              />
            )}
          </div>
        </section>
      )}

      {tab === 'templates' && (
        <section
          data-testid="torqueshed-templates"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(310px,1fr))',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void mutate(
                'Diagnostic template',
                () =>
                  moduleShellApi.torqueshed.createTemplate({
                    name: data.get('name'),
                    description: data.get('description'),
                    concernPattern: data.get('concernPattern'),
                    visibility: data.get('visibility'),
                    testPlan: String(data.get('testPlan') || '')
                      .split('\n')
                      .filter(Boolean)
                      .map((title) => ({ title })),
                  }),
                form,
              );
            }}
            style={{ ...cardStyle, display: 'grid', gap: space.sm }}
          >
            <h2 style={{ margin: 0, color: semantic.text }}>Diagnostic template</h2>
            <label style={label}>
              Name
              <input name="name" required style={input} />
            </label>
            <label style={label}>
              Concern pattern
              <textarea name="concernPattern" rows={2} style={input} />
            </label>
            <label style={label}>
              Test plan (one step per line)
              <textarea name="testPlan" rows={5} style={input} />
            </label>
            <label style={label}>
              Visibility
              <select name="visibility" style={input}>
                <option value="private">Private</option>
                <option value="tenant">Team</option>
              </select>
            </label>
            <button style={button}>
              <Plus size={16} />
              Save template
            </button>
            {templates.map((row) => (
              <div
                key={row.id}
                style={{
                  borderTop: `1px solid ${semantic.border}`,
                  paddingTop: 8,
                  color: semantic.text,
                }}
              >
                {row.name}
                <span style={{ float: 'right', color: semantic.textMuted }}>{row.visibility}</span>
              </div>
            ))}
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              void mutate(
                'Vendor',
                () =>
                  moduleShellApi.torqueshed.createVendor({
                    name: data.get('name'),
                    website: data.get('website'),
                    phone: data.get('phone'),
                    email: data.get('email'),
                  }),
                form,
              );
            }}
            style={{ ...cardStyle, display: 'grid', gap: space.sm }}
          >
            <h2 style={{ margin: 0, color: semantic.text }}>Parts and service vendor</h2>
            <label style={label}>
              Name
              <input name="name" required style={input} />
            </label>
            <label style={label}>
              Website
              <input name="website" type="url" style={input} />
            </label>
            <label style={label}>
              Phone
              <input name="phone" style={input} />
            </label>
            <label style={label}>
              Email
              <input name="email" type="email" style={input} />
            </label>
            <button style={button}>
              <Plus size={16} />
              Save vendor
            </button>
            {vendors.map((row) => (
              <div
                key={row.id}
                style={{
                  borderTop: `1px solid ${semantic.border}`,
                  paddingTop: 8,
                  color: semantic.text,
                }}
              >
                {row.name}
              </div>
            ))}
          </form>
        </section>
      )}
    </main>
  );
}

function DiagnosticDetail({
  detail,
  busy,
  mutate,
  refresh,
}: {
  detail: Record<string, any>;
  busy: string;
  mutate: (
    name: string,
    operation: () => Promise<unknown>,
    form?: HTMLFormElement,
    refresh?: () => Promise<void>,
  ) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const diagnostic = detail.diagnostic as TorqueShedDiagnostic;
  return (
    <article
      style={{ ...cardStyle, borderColor: '#f59e0b66' }}
      data-testid="torqueshed-diagnostic-timeline"
      data-record-id={diagnostic.id}
    >
      <h2 style={{ marginTop: 0, color: semantic.text }}>{diagnostic.title}</h2>
      <p style={{ color: semantic.textMuted }}>{diagnostic.customerConcern}</p>
      <TorqueAssistPanel diagnostic={diagnostic} />
      <label style={label}>
        Workflow status
        <select
          value={diagnostic.status}
          onChange={(event) =>
            void mutate(
              'Diagnostic status',
              () =>
                moduleShellApi.torqueshed.updateDiagnostic(diagnostic.id, {
                  expectedVersion: diagnostic.version,
                  status: event.target.value,
                }),
              undefined,
              refresh,
            )
          }
          disabled={busy === 'Diagnostic status'}
          style={input}
        >
          {['open', 'testing', 'repairing', 'verified', 'resolved', 'archived'].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))',
          gap: space.sm,
          marginTop: space.md,
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void mutate(
              'Trouble code',
              () =>
                moduleShellApi.torqueshed.addTroubleCode(diagnostic.id, {
                  code: data.get('code'),
                  description: data.get('description'),
                  freezeFrame: { note: data.get('freezeFrame') },
                }),
              form,
              refresh,
            );
          }}
          style={{ display: 'grid', gap: 7 }}
        >
          <strong style={{ color: semantic.text }}>Trouble code</strong>
          <input name="code" required placeholder="P0171" style={input} />
          <input name="description" placeholder="Description" style={input} />
          <input name="freezeFrame" placeholder="Freeze-frame note" style={input} />
          <button style={button}>
            <Plus size={15} />
            Add code
          </button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void mutate(
              'Diagnostic evidence',
              () =>
                moduleShellApi.torqueshed.addDiagnosticEntry(
                  diagnostic.id,
                  {
                    kind: data.get('kind'),
                    title: data.get('title'),
                    valueText: data.get('valueText'),
                    valueNumeric: number(data.get('valueNumeric')),
                    unit: data.get('unit'),
                    referenceMin: number(data.get('referenceMin')),
                    referenceMax: number(data.get('referenceMax')),
                    outcome: data.get('outcome'),
                  },
                  key('entry'),
                ),
              form,
              refresh,
            );
          }}
          style={{ display: 'grid', gap: 7 }}
        >
          <strong style={{ color: semantic.text }}>Timeline evidence</strong>
          <select name="kind" style={input}>
            {[
              'symptom',
              'condition',
              'inspection',
              'test',
              'measurement',
              'hypothesis',
              'confirmed_cause',
              'repair',
              'verification',
              'resolution',
            ].map((kind) => (
              <option key={kind} value={kind}>
                {kind.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <input name="title" required placeholder="Fuel pressure under load" style={input} />
          <input name="valueText" placeholder="Observation or result" style={input} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input name="valueNumeric" type="number" step="any" placeholder="Value" style={input} />
            <input name="unit" placeholder="Unit" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input name="referenceMin" type="number" step="any" placeholder="Min" style={input} />
            <input name="referenceMax" type="number" step="any" placeholder="Max" style={input} />
          </div>
          <input name="outcome" placeholder="Outcome" style={input} />
          <button style={button}>
            <Plus size={15} />
            Add evidence
          </button>
        </form>
      </div>
      <h3 style={{ color: semantic.text }}>Complete timeline</h3>
      {detail.timeline.map((row: any) => (
        <div
          key={`${row.timelineType}-${row.id}`}
          style={{
            borderTop: `1px solid ${semantic.border}`,
            padding: '9px 0',
            color: semantic.text,
          }}
        >
          <strong>
            {row.timelineType === 'trouble_code' ? row.code : row.title || row.originalName}
          </strong>
          <div style={{ fontSize: fontSize.sm, color: semantic.textMuted }}>
            {row.valueText ?? row.description ?? row.outcome ?? row.scanStatus ?? ''} ·{' '}
            {new Date(row.timelineAt).toLocaleString()}
          </div>
        </div>
      ))}
      {!detail.timeline.length && (
        <p style={{ color: semantic.textMuted }}>No evidence has been recorded yet.</p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = new FormData(form).get('file') as File;
          if (!file?.size) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 32768)
            binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
          void mutate(
            'Diagnostic attachment',
            () =>
              moduleShellApi.torqueshed.uploadAttachment('diagnostics', diagnostic.id, {
                originalName: file.name,
                declaredMimeType: file.type,
                contentBase64: btoa(binary),
              }),
            form,
            refresh,
          );
        }}
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: space.md,
          flexWrap: 'wrap',
        }}
      >
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,application/pdf,text/plain,text/csv,application/json"
          required
          style={{ color: semantic.textMuted }}
        />
        <button style={button}>
          <FileUp size={15} />
          Attach evidence
        </button>
      </form>
    </article>
  );
}

function TorqueAssistPanel({ diagnostic }: { diagnostic: TorqueShedDiagnostic }) {
  const [status, setStatus] = useState<TorqueAssistStatus | null>(null);
  const [context, setContext] = useState<Record<string, any> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, any>>>([]);
  const [ledger, setLedger] = useState<{
    balance: number;
    entries: Array<Record<string, any>>;
  } | null>(null);
  const [response, setResponse] = useState<TorqueAssistResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeRequestKey, setActiveRequestKey] = useState('');
  const [purchaseKeys, setPurchaseKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextContext, nextHistory, nextLedger] = await Promise.all([
        moduleShellApi.torqueshed.getTorqueAssistStatus(),
        moduleShellApi.torqueshed.getTorqueAssistContext(diagnostic.id),
        moduleShellApi.torqueshed.getTorqueAssistHistory(diagnostic.id),
        moduleShellApi.torqueshed.getTokenLedger(),
      ]);
      setStatus(nextStatus);
      setContext(nextContext);
      setHistory(nextHistory.requests);
      setLedger(nextLedger);
    } catch (next) {
      setError(errorText(next));
    }
  }, [diagnostic.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const result = (response?.result ??
    history[0]?.responseJson ??
    null) as TorqueAssistResult | null;
  const providerDisabled = status?.provider.state === 'disabled';
  const paymentsDisabled = status?.payments.state === 'disabled';

  async function runAssist() {
    const requestKey = activeRequestKey || key('torque-assist');
    if (!activeRequestKey) setActiveRequestKey(requestKey);
    setBusy('assist');
    setError('');
    setNotice('');
    try {
      const followUpAnswers = (result?.followUpQuestions ?? [])
        .map((question) => ({ question, answer: answers[question]?.trim() ?? '' }))
        .filter((item) => item.answer);
      const next = await moduleShellApi.torqueshed.runTorqueAssist(
        { diagnosticSessionId: diagnostic.id, followUpAnswers },
        requestKey,
      );
      setResponse(next);
      setActiveRequestKey('');
      setAnswers({});
      setNotice(
        next.replayed
          ? 'The prior accepted result was replayed without another charge.'
          : `Accepted result recorded. ${next.actualUnits.toLocaleString()} units charged once.`,
      );
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  async function purchase(packageKey: string) {
    const purchaseKey = purchaseKeys[packageKey] || key(`token-purchase:${packageKey}`);
    setPurchaseKeys((current) => ({ ...current, [packageKey]: purchaseKey }));
    setBusy(`purchase:${packageKey}`);
    setError('');
    setNotice('');
    try {
      const next = await moduleShellApi.torqueshed.purchaseTorqueTokens(
        { diagnosticSessionId: diagnostic.id, packageKey },
        purchaseKey,
      );
      const checkoutUrl = next.purchase.providerCheckoutUrl;
      if (typeof checkoutUrl === 'string' && checkoutUrl.startsWith('https://')) {
        window.location.assign(checkoutUrl);
        return;
      }
      setNotice(
        'Checkout started. Credits appear after payment is confirmed. If you return here before they appear, refresh once before trying again.',
      );
      await load();
    } catch (next) {
      setError(errorText(next));
    } finally {
      setBusy('');
    }
  }

  return (
    <section
      data-testid="torqueshed-torque-assist"
      style={{
        border: `1px solid ${semantic.border}`,
        borderRadius: radius.md,
        padding: space.md,
        margin: `${space.md}px 0`,
        background: '#f59e0b0b',
        display: 'grid',
        gap: space.md,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3
            style={{
              margin: 0,
              color: semantic.text,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <Bot size={19} /> Torque Assist
          </h3>
          <p style={{ color: semantic.textMuted, margin: '5px 0 0' }}>
            Uses the evidence you record to suggest the next safest tests. Always verify the fault before replacing parts.
          </p>
        </div>
        <div style={{ color: semantic.text, textAlign: 'right' }}>
          <strong style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Coins size={17} /> {(ledger?.balance ?? status?.balance ?? 0).toLocaleString()} units
          </strong>
          <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            Ledger-computed balance · Credits available
          </span>
        </div>
      </div>

      {providerDisabled && (
        <div style={{ color: semantic.accentDanger, display: 'flex', gap: 8 }}>
          <AlertTriangle size={18} /> Torque Assist is unavailable until an administrator connects the AI service.
        </div>
      )}
      {status?.provider.state === 'test' && (
        <div style={{ color: semantic.accentWarning }}>
          Preview analysis mode is active. Verify every diagnostic recommendation before starting a repair.
        </div>
      )}
      {error && <div style={{ color: semantic.accentDanger }}>{error}</div>}
      {notice && <div style={{ color: semantic.accentSuccess }}>{notice}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
          gap: 8,
          color: semantic.text,
        }}
      >
        <div style={{ ...cardStyle, padding: 10 }}>
          <strong>Vehicle context</strong>
          <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {context?.vehicle?.nickname ||
              `${context?.vehicle?.year ?? ''} ${context?.vehicle?.make ?? ''} ${context?.vehicle?.model ?? ''}`}
          </div>
        </div>
        <div style={{ ...cardStyle, padding: 10 }}>
          <strong>Evidence</strong>
          <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {context?.codeCount ?? 0} codes · {context?.evidenceCount ?? 0} timeline entries ·{' '}
            {context?.priorServiceCount ?? 0} service records
          </div>
        </div>
        <div style={{ ...cardStyle, padding: 10 }}>
          <strong>Estimated total</strong>
          <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {(context?.estimatedUnits ?? 0).toLocaleString()} units ·{' '}
            {(context?.contextCharacters ?? 0).toLocaleString()} context characters
          </div>
        </div>
      </div>

      {result?.status === 'follow_up_required' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <strong style={{ color: semantic.text }}>Targeted follow-up</strong>
          {result.followUpQuestions.map((question) => (
            <label key={question} style={label}>
              {question}
              <textarea
                rows={2}
                value={answers[question] ?? ''}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question]: event.target.value }))
                }
                style={input}
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void runAssist()}
        disabled={providerDisabled || busy === 'assist'}
        style={{ ...button, opacity: providerDisabled || busy === 'assist' ? 0.55 : 1 }}
      >
        <Activity size={16} />
        {busy === 'assist'
          ? 'Analyzing safely…'
          : activeRequestKey
            ? 'Retry same request without duplicate charge'
            : result?.status === 'follow_up_required'
              ? 'Submit follow-up evidence'
              : 'Generate diagnostic plan'}
      </button>

      {result && (
        <div style={{ display: 'grid', gap: space.md, color: semantic.text }}>
          <div>
            <strong>Summary</strong>
            <p style={{ color: semantic.textMuted }}>{result.summary}</p>
          </div>
          <div>
            <strong>Facts and assumptions</strong>
            <ul>
              {result.facts.map((fact, index) => (
                <li key={`${fact.source}-${index}`}>
                  <em>{fact.source.replace('_', ' ')}:</em> {fact.statement}
                </li>
              ))}
              {result.assumptions.map((assumption, index) => (
                <li key={`assumption-${index}`}>
                  <em>assumption:</em> {assumption}
                </li>
              ))}
            </ul>
          </div>
          {!!result.hypotheses.length && (
            <div>
              <strong>Ranked hypotheses</strong>
              {result.hypotheses.map((hypothesis) => (
                <div
                  key={hypothesis.rank}
                  style={{ borderTop: `1px solid ${semantic.border}`, padding: '8px 0' }}
                >
                  #{hypothesis.rank} · {hypothesis.confidence} confidence · {hypothesis.description}
                  <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                    Supports: {hypothesis.supportingEvidence.join('; ') || 'None recorded'} ·
                    Against: {hypothesis.contradictingEvidence.join('; ') || 'None recorded'}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <strong>Safety warnings</strong>
            {result.safetyWarnings.map((warning) => (
              <div key={warning.category} style={{ color: semantic.accentWarning, marginTop: 6 }}>
                <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> {warning.category}:{' '}
                {warning.warning} {warning.escalation}
              </div>
            ))}
          </div>
          {!!result.recommendedTests.length && (
            <div>
              <strong>Recommended tests</strong>
              {result.recommendedTests.map((test) => (
                <div
                  key={test.priority}
                  style={{ borderTop: `1px solid ${semantic.border}`, padding: '8px 0' }}
                >
                  <strong>
                    {test.priority}. {test.title}
                  </strong>
                  <div style={{ color: semantic.textMuted }}>{test.rationale}</div>
                  <div>{test.procedure}</div>
                  <div style={{ color: semantic.accentWarning, fontSize: fontSize.sm }}>
                    Stop: {test.stopConditions.join('; ')}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {result.disclaimer}
            <br />
            Estimated use{' '}
            {(response?.estimatedUnits ?? history[0]?.estimatedUnits ?? 0).toLocaleString()} credits ·
            used {(response?.actualUnits ?? history[0]?.actualUnits ?? 0).toLocaleString()} credits
          </div>
        </div>
      )}

      <details>
        <summary style={{ cursor: 'pointer', color: semantic.text }}>
          Buy credits and review usage
        </summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {status?.packages.map((tokenPackage) => (
            <button
              type="button"
              key={tokenPackage.key}
              disabled={paymentsDisabled || busy === `purchase:${tokenPackage.key}`}
              onClick={() => void purchase(tokenPackage.key)}
              style={{
                ...button,
                background: semantic.bgPanel,
                color: semantic.text,
                border: `1px solid ${semantic.border}`,
              }}
            >
              {tokenPackage.name}: {tokenPackage.units.toLocaleString()} units ·{' '}
              {money(tokenPackage.amountMinor)}
            </button>
          ))}
          {paymentsDisabled && (
            <span style={{ color: semantic.accentDanger }}>
              Credit purchases are temporarily unavailable. Nothing will be charged. Contact your organization administrator for help.
            </span>
          )}
          {history.slice(0, 5).map((item) => (
            <div
              key={item.id}
              style={{
                borderTop: `1px solid ${semantic.border}`,
                paddingTop: 6,
                color: semantic.textMuted,
              }}
            >
              {String(item.status).replace(/_/g, ' ')} · {Number(item.actualUnits ?? 0).toLocaleString()} credits ·{' '}
              {new Date(item.createdAt).toLocaleString()}
            </div>
          ))}
          {!history.length && (
            <span style={{ color: semantic.textMuted }}>No Torque Assist usage yet.</span>
          )}
        </div>
      </details>
    </section>
  );
}
