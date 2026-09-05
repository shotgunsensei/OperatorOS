'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bot,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileUp,
  Grid2X2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  LifeBuoy,
  UserRound,
  Wrench,
} from 'lucide-react';
import { ModuleApplicationShell } from '@/components/module-application-shell';
import { useAuth } from '@/components/AuthProvider';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import {
  moduleShellApi,
  type TorqueShedDashboard,
  type TorqueShedDiagnostic,
  type TorqueShedVehicle,
  type TorqueAssistResponse,
  type TorqueAssistResult,
  type TorqueAssistStatus,
  type TorqueTokenPurchaseStatus,
} from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';
import TorqueShedNativeAuthorizePanel from './TorqueShedNativeAuthorizePanel';
import OutcomeWorkflowAction from './OutcomeWorkflowAction';
import {
  TORQUESHED_NAVIGATION,
  TORQUESHED_THEME,
  resolveTorqueShedRoute,
} from './TorqueShedRoute.contract';
import {
  formatTorqueShedError,
  translateTorqueShedError,
  type TorqueErrorPresentation,
} from '@/lib/torque-error-translator';

const routeLoading = () => <div role="status" style={{ ...cardStyle, color: semantic.textMuted }}>Loading this TorqueShed route…</div>;
const TorqueShedMarketplacePanel = dynamic(() => import('./TorqueShedSocialPanels').then(module => module.TorqueShedMarketplacePanel), { loading: routeLoading });
const TorqueShedCommunityPanel = dynamic(() => import('./TorqueShedSocialPanels').then(module => module.TorqueShedCommunityPanel), { loading: routeLoading });
const TorqueShedJournalPanel = dynamic(() => import('./TorqueShedRestorationPanels').then(module => module.TorqueShedJournalPanel), { loading: routeLoading });
const TorqueShedLiveBayPanel = dynamic(() => import('./TorqueShedRestorationPanels').then(module => module.TorqueShedLiveBayPanel), { loading: routeLoading });
const TorqueShedUtilityPanel = dynamic(() => import('./TorqueShedRestorationPanels').then(module => module.TorqueShedUtilityPanel), { loading: routeLoading });

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

function purchaseMessage(status: TorqueTokenPurchaseStatus): string {
  if (status.state === 'credited' && status.credited) return 'Credits added';
  if (status.state === 'paid_pending_credit') return 'Payment received; credits are being applied';
  if (['creating_checkout', 'checkout_open', 'payment_pending'].includes(status.state)) return 'Verifying payment';
  if (status.state === 'cancelled') return 'Checkout cancelled; no credits were added';
  if (status.state === 'expired') return 'Checkout expired; no credits were added';
  if (status.state === 'failed') return 'Payment failed; no credits were added';
  if (status.state === 'refunded' && status.settlementPolicy.state === 'refund_review') {
    return `Payment refunded; available credits were reversed and ${status.settlementPolicy.units.toLocaleString()} spent units require administrator review`;
  }
  if (status.state === 'refunded') return 'Payment refunded; purchased credits were reversed under policy';
  if (status.settlementPolicy.state === 'dispute_lost') {
    return `Payment dispute lost; ${status.settlementPolicy.units.toLocaleString()} spent units require administrator review`;
  }
  return 'Payment disputed; purchased credits are frozen';
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

export default function TorqueShedWorkspace({ routePath }: { baseUrl?: string; routePath?: string } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { activeTenant, activeRole } = useTenant();
  const moduleAccessLevel = useModuleAccessLevel();
  const platformAdmin = user?.platformRole === 'super_admin';
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const canManageModule = canWriteModule && (platformAdmin || activeRole === 'owner' || activeRole === 'admin' || moduleAccessLevel === 'manager');
  const route = resolveTorqueShedRoute(routePath || pathname);
  const sourceRouted = pathname.startsWith('/app/') || pathname.startsWith('/modules/');
  const hrefFor = useCallback((path: string) => sourceRouted ? `/modules/torqueshed${path === '/' ? '/dashboard' : path}` : path, [sourceRouted]);
  const navigation = useMemo(() => TORQUESHED_NAVIGATION.map(group => ({
    ...group,
    items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })),
  })), [hrefFor]);
  const [dashboard, setDashboard] = useState<TorqueShedDashboard | null>(null);
  const [vehicles, setVehicles] = useState<TorqueShedVehicle[]>([]);
  const [builds, setBuilds] = useState<Array<Record<string, any>>>([]);
  const [diagnostics, setDiagnostics] = useState<TorqueShedDiagnostic[]>([]);
  const [reminders, setReminders] = useState<Array<Record<string, any>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, any>>>([]);
  const [vendors, setVendors] = useState<Array<Record<string, any>>>([]);
  const [vehicleDetail, setVehicleDetail] = useState<Record<string, any> | null>(null);
  const [diagnosticDetail, setDiagnosticDetail] = useState<Record<string, any> | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '100' });
    if (search.trim()) query.set('search', search.trim());
    const failures: string[] = [];
    const task = async <T,>(label: string, request: Promise<T>, apply: (value: T) => void) => {
      try { apply(await request); } catch (next) { failures.push(`${label}: ${formatTorqueShedError(next)}`); }
    };
    const tasks: Array<Promise<void>> = [];
    const needsVehicles = ['dashboard', 'garage', 'service', 'diagnostics', 'live', 'credits'].includes(route.area);
    const needsBuilds = ['dashboard', 'builds', 'journal', 'live'].includes(route.area);
    const needsDiagnostics = ['dashboard', 'diagnostics', 'live', 'credits'].includes(route.area) || route.kind === 'exports';
    if (route.area === 'dashboard') tasks.push(task('Overview', moduleShellApi.torqueshed.dashboard(), setDashboard));
    if (needsVehicles) tasks.push(task('Vehicles', moduleShellApi.torqueshed.listVehicles(query.toString()), value => setVehicles(value.vehicles)));
    if (needsBuilds) tasks.push(task('Builds', moduleShellApi.torqueshed.listBuilds(), value => setBuilds(value.builds)));
    if (needsDiagnostics) tasks.push(task('Diagnostics', moduleShellApi.torqueshed.listDiagnostics('limit=100'), value => setDiagnostics(value.diagnostics)));
    if (route.area === 'service' || route.area === 'dashboard') tasks.push(task('Reminders', moduleShellApi.torqueshed.listReminders(), value => setReminders(value.reminders)));
    if (route.area === 'templates') {
      tasks.push(task('Templates', moduleShellApi.torqueshed.listTemplates(), value => setTemplates(value.templates)));
      tasks.push(task('Vendors', moduleShellApi.torqueshed.listVendors(), value => setVendors(value.vendors)));
    } else if (route.area === 'service') {
      tasks.push(task('Vendors', moduleShellApi.torqueshed.listVendors(), value => setVendors(value.vendors)));
    }
    await Promise.allSettled(tasks);
    if (failures.length) setError(failures.join(' '));
    setLoading(false);
  }, [route.area, search]);

  const openVehicle = useCallback(async (id: string) => {
    setBusy('vehicle-detail');
    setError('');
    try {
      setVehicleDetail(await moduleShellApi.torqueshed.getVehicle(id));
    } catch (next) {
      setError(formatTorqueShedError(next));
    } finally {
      setBusy('');
    }
  }, []);

  const openDiagnostic = useCallback(async (id: string) => {
    setBusy('diagnostic-detail');
    setError('');
    try {
      setDiagnosticDetail(await moduleShellApi.torqueshed.getDiagnostic(id));
    } catch (next) {
      setError(formatTorqueShedError(next));
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
    setVehicleDetail(null);
    setDiagnosticDetail(null);
    if (route.kind === 'vehicle-detail' && route.recordId) void openVehicle(route.recordId);
    if ((route.kind === 'diagnostic-detail' || route.kind === 'diagnostic-assist') && route.recordId) void openDiagnostic(route.recordId);
  }, [openDiagnostic, openVehicle, route.kind, route.recordId]);

  async function mutate(
    name: string,
    operation: () => Promise<unknown>,
    form?: HTMLFormElement,
    refresh?: () => Promise<void>,
  ) {
    if (!canWriteModule) {
      setError('Your TorqueShed access is read-only. Ask an organization administrator for edit access.');
      return;
    }
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
      setError(formatTorqueShedError(next));
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
    if (!canWriteModule) return;
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
    if (!canWriteModule) return;
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
    if (!canWriteModule) return;
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

  if (route.kind === 'native-auth') return <TorqueShedNativeAuthorizePanel canWrite={canWriteModule} />;

  const pageAction = route.kind === 'vehicle-new' ? null
    : route.area === 'garage' && canWriteModule ? (
      <Link href={hrefFor('/garage/vehicles/new')} style={{ ...button, textDecoration: 'none' }}><Plus size={16} /> Add vehicle</Link>
    ) : route.kind === 'diagnostic-assist' ? (
      <Link href={hrefFor(`/diagnostics/${route.recordId}`)} style={{ ...button, textDecoration: 'none' }}><ClipboardCheck size={16} /> Diagnostic record</Link>
    ) : route.kind === 'diagnostic-detail' ? (
      <Link href={hrefFor(`/diagnostics/${route.recordId}/assist`)} style={{ ...button, textDecoration: 'none' }}><Bot size={16} /> Open Torque Assist</Link>
    ) : route.area === 'diagnostics' && canWriteModule ? (
      <Link href={hrefFor('/diagnostics/new')} style={{ ...button, textDecoration: 'none' }}><Plus size={16} /> New diagnostic</Link>
    ) : null;

  return (
    <ModuleApplicationShell
      moduleId="torqueshed"
      moduleName="TorqueShed"
      theme={TORQUESHED_THEME}
      currentPath={hrefFor(route.canonicalPath)}
      navigation={navigation}
      brand={(
        <Link href={hrefFor('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#f8fafc', textDecoration: 'none', fontWeight: 900 }}>
          <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, color: '#f59e0b', border: '1px solid #f59e0b66', background: '#f59e0b18' }}><Wrench size={21} /></span>
          <span>TorqueShed</span>
        </Link>
      )}
      organization={{ label: 'Organization', value: activeTenant?.name ?? (user?.currentTenantId ? 'Selected organization' : 'No organization selected'), testId: 'torqueshed-organization-context' }}
      accessContext={{ label: 'Access', value: platformAdmin ? 'Platform administrator' : !canWriteModule ? 'Read-only access' : activeRole === 'owner' ? 'Organization owner' : activeRole === 'admin' ? 'Organization administrator' : moduleAccessLevel === 'manager' ? 'TorqueShed manager' : 'Garage member', testId: 'torqueshed-access-context' }}
      utilityActions={[
        { label: 'My Apps', href: DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl, icon: Grid2X2, testId: 'torqueshed-my-apps' },
        { label: 'Profile', href: hrefFor('/profile'), icon: UserRound, testId: 'torqueshed-profile' },
        { label: 'Help', href: buildOperatorOSHelpUrl({ module: 'torqueshed', page: route.canonicalPath }), icon: LifeBuoy, testId: 'torqueshed-help' },
      ]}
      topActions={<TorqueCreditBalanceChip href={hrefFor('/billing/credits')} />}
      page={{ eyebrow: route.eyebrow, title: route.title, subtitle: route.subtitle, actions: pageAction, detailLabel: route.recordId }}
      pageHeaderTestId="torqueshed-route-header"
      onRetry={() => void load()}
      mobileNavigation="drawer"
      testId="torqueshed-module-shell"
      dataAttributes={{ 'data-torqueshed-route': route.kind }}
    >
      <style>{`
        [data-testid="torqueshed-module-shell"] { box-sizing:border-box; width:100%; min-width:0; }
        [data-testid="torqueshed-module-shell"] *,[data-testid="torqueshed-module-shell"] *:before,[data-testid="torqueshed-module-shell"] *:after { box-sizing:border-box; min-width:0; }
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
        .ts28-stats small { display:block; color:#a8a29e; font-weight:600; margin-top:3px; }
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
        @media (max-width: 760px) { [data-testid="torqueshed-builds"], [data-testid="torqueshed-diagnostics"] { grid-template-columns: minmax(0, 1fr) !important; } .ts28-three{grid-template-columns:minmax(0,1fr)} }
        @media (max-width: 560px) { [data-testid="torqueshed-garage"] form > div, [data-testid="torqueshed-service"] form > div,.ts28-two { grid-template-columns: minmax(0, 1fr) !important; }.ts28-send{grid-template-columns:1fr}.ts28-send button{width:100%}.ts28-message{max-width:96%}.ts28-stats{grid-template-columns:1fr}.ts28-hero svg{display:none} }
      `}</style>
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

      {!canWriteModule && <div role="status" data-testid="torqueshed-read-only" style={{ ...cardStyle, borderColor: '#fbbf24', color: '#fde68a', marginBottom: space.lg }}>Read-only access: you can review garage records, diagnostics, service history, builds, marketplace listings, community discussions, and reports. Creating, changing, sharing, messaging, purchasing, and AI analysis actions are disabled.</div>}
      {route.area === 'marketplace' && <TorqueShedMarketplacePanel listingId={route.recordId} canWrite={canWriteModule} />}
      {route.area === 'community' && <TorqueShedCommunityPanel canWrite={canWriteModule} canManage={canManageModule} />}
      {route.area === 'journal' && <TorqueShedJournalPanel builds={builds} canWrite={canWriteModule} />}
      {route.area === 'live' && <TorqueShedLiveBayPanel vehicles={vehicles} builds={builds} diagnostics={diagnostics} initialBayId={route.recordId} canWrite={canWriteModule} />}
      {route.kind === 'profile' && <TorqueProfilePanel email={user?.email ?? 'Signed-in OperatorOS user'} organization={activeTenant?.name ?? 'Current organization'} />}
      {route.area === 'tools' && route.kind !== 'profile' && <TorqueShedUtilityPanel diagnostics={diagnostics} routeKind={route.kind as 'activity' | 'search' | 'exports' | 'settings'} canWrite={canWriteModule} />}
      {route.area === 'credits' && <TorqueCreditsPanel diagnostics={diagnostics} canWrite={canWriteModule} />}

      {route.area === 'dashboard' && (
        <section data-testid="torqueshed-dashboard" style={{ display: 'grid', gap: space.lg }}>
          {canWriteModule && (vehicles.length === 0 || diagnostics.length === 0) && (
            <article style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, flexWrap: 'wrap', borderColor: '#f59e0b66', background: '#f59e0b0b' }}>
              <div>
                <h2 style={{ margin: 0, color: semantic.text, fontSize: 18 }}>{vehicles.length === 0 ? 'Start with the vehicle' : 'Ready to diagnose a concern?'}</h2>
                <p style={{ margin: '6px 0 0', color: semantic.textMuted, lineHeight: 1.5 }}>
                  {vehicles.length === 0
                    ? 'Add the year, make, and model once. Then service history, reminders, and diagnostics stay connected to that vehicle.'
                    : 'Open a diagnostic session to record the customer concern, codes, tests, evidence, and final fix.'}
                </p>
              </div>
              <Link href={hrefFor(vehicles.length === 0 ? '/garage/vehicles/new' : '/diagnostics/new')} style={{ ...button, textDecoration: 'none' }}>
                {vehicles.length === 0 ? <Plus size={16} /> : <Activity size={16} />}
                {vehicles.length === 0 ? 'Add vehicle' : 'Start diagnostic'}
              </Link>
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

      {route.area === 'garage' && (
        <section
          data-testid="torqueshed-garage"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          {route.kind === 'vehicle-new' && <div style={{ display: 'grid', gap: space.md }}>
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
              <button disabled={!canWriteModule || busy === 'Vehicle'} style={button}>
                <Plus size={16} />
                Save vehicle
              </button>
            </form>
          </div>}
          {route.kind !== 'vehicle-new' && <div style={{ display: 'grid', gap: space.md, minWidth: 0 }}>
            {route.kind === 'garage' && <>
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
                  onClick={() => router.push(hrefFor(`/garage/vehicles/${row.id}`))}
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
            </>}
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
          </div>}
        </section>
      )}

      {route.area === 'service' && (
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
            <button disabled={!canWriteModule || !vehicles.length || busy === 'Service record'} style={button}>
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
            <button disabled={!canWriteModule || !vehicles.length || busy === 'Service reminder'} style={button}>
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

      {route.area === 'builds' && (
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
            <button type="submit" disabled={!canWriteModule} style={button}>
              <Plus size={16} />
              Save build
            </button>
          </form>
          <div style={{ display: 'grid', gap: space.md }}>
            {builds.filter((row) => route.kind !== 'build-detail' || row.id === route.recordId).map((row) => (
              <article key={row.id} style={{ ...cardStyle, borderLeft: '3px solid #f59e0b' }}>
                <h3 style={{ margin: 0, color: semantic.text }}><Link href={hrefFor(`/builds/${row.id}`)} style={{ color: 'inherit' }}>{row.title}</Link></h3>
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
                  <input name="title" required aria-label={`Add task to ${row.title}`} placeholder="Add a build task" style={input} />
                  <button type="submit" disabled={!canWriteModule} style={button}>
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

      {route.area === 'diagnostics' && (
        <section
          data-testid="torqueshed-diagnostics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(300px,.85fr) minmax(340px,1.4fr)',
            gap: space.lg,
            alignItems: 'start',
          }}
        >
          {route.kind === 'diagnostic-new' && <form onSubmit={diagnosticForm} style={{ ...cardStyle, display: 'grid', gap: space.sm }}>
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
            <button disabled={!canWriteModule || !vehicles.length} style={button}>
              <Plus size={16} />
              Start session
            </button>
          </form>}
          <div style={{ display: 'grid', gap: space.md }}>
            {route.kind === 'diagnostics' && <>
            {diagnostics.map((row) => (
              <button
                key={row.id}
                data-record-id={row.id}
                onClick={() => router.push(hrefFor(`/diagnostics/${row.id}`))}
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
            {!diagnostics.length && !loading && (
              <article style={{ ...cardStyle, color: semantic.textMuted }}>
                <h2 style={{ marginTop: 0, color: semantic.text }}>No diagnostic sessions yet</h2>
                <p style={{ marginBottom: space.md }}>
                  Start an evidence-first diagnostic to record the concern, codes, tests, findings, and verified repair.
                </p>
                {canWriteModule && <Link href={hrefFor('/diagnostics/new')} style={{ ...button, textDecoration: 'none' }}>
                  <Plus size={16} /> Start diagnostic
                </Link>}
              </article>
            )}
            </>}
            {diagnosticDetail && (
              <DiagnosticDetail
                detail={diagnosticDetail}
                busy={busy}
                canWrite={canWriteModule}
                canManageTraining={canManageModule}
                mutate={mutate}
                refresh={() => openDiagnostic(diagnosticDetail.diagnostic.id)}
                showAssist={route.kind === 'diagnostic-assist'}
                assistHref={hrefFor(`/diagnostics/${diagnosticDetail.diagnostic.id}/assist`)}
                creditsHref={hrefFor(`/billing/credits?diagnostic=${encodeURIComponent(diagnosticDetail.diagnostic.id)}`)}
              />
            )}
          </div>
        </section>
      )}

      {route.area === 'templates' && (
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
            <button type="submit" disabled={!canWriteModule} style={button}>
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
            <button type="submit" disabled={!canWriteModule} style={button}>
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
    </ModuleApplicationShell>
  );
}

type TorqueCreditLedger = Awaited<ReturnType<typeof moduleShellApi.torqueshed.getTokenLedger>>;

function TorqueProfilePanel({ email, organization }: { email: string; organization: string }) {
  return (
    <section data-testid="torqueshed-profile-route" className="ts28-grid">
      <article style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Your TorqueShed account</h2>
        <p style={{ color: semantic.textMuted }}>TorqueShed uses your OperatorOS sign-in, so you do not need a second account or password.</p>
        <div className="ts28-row"><div><strong>{email}</strong><small>Signed-in identity</small></div><ShieldCheck size={18} color="#f59e0b" /></div>
        <div className="ts28-row"><div><strong>{organization}</strong><small>Active organization</small></div><Wrench size={18} color="#f59e0b" /></div>
      </article>
      <article style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Account and security</h2>
        <p style={{ color: semantic.textMuted }}>Manage your profile, password, organization access, roles, plan, and billing in OperatorOS.</p>
        <a href={DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl} style={{ ...button, textDecoration: 'none' }}>Open OperatorOS profile and security</a>
      </article>
    </section>
  );
}

function TorqueCreditBalanceChip({ href }: { href: string }) {
  const [ledger, setLedger] = useState<TorqueCreditLedger | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    void moduleShellApi.torqueshed.getTokenLedger().then((next) => {
      if (active) setLedger(next);
    }).catch(() => {
      if (active) setUnavailable(true);
    });
    return () => { active = false; };
  }, []);
  return (
    <Link
      href={href}
      data-testid="torqueshed-credit-balance"
      style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8, border: '1px solid #f59e0b66', color: '#fbbf24', textDecoration: 'none', fontWeight: 800 }}
      title={unavailable ? 'Credit balance is temporarily unavailable' : 'Open credits and usage'}
    >
      <Coins size={16} /> {unavailable ? 'Credits unavailable' : ledger ? `${ledger.availableBalance.toLocaleString()} credits` : 'Loading credits…'}
    </Link>
  );
}

function TorqueCreditsPanel({ diagnostics, canWrite }: { diagnostics: TorqueShedDiagnostic[]; canWrite: boolean }) {
  const searchParams = useSearchParams();
  const requestedDiagnostic = searchParams.get('diagnostic') ?? '';
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState(requestedDiagnostic);
  const [status, setStatus] = useState<TorqueAssistStatus | null>(null);
  const [ledger, setLedger] = useState<TorqueCreditLedger | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<TorqueTokenPurchaseStatus | null>(null);
  const [purchaseReference, setPurchaseReference] = useState(searchParams.get('purchase') ?? '');
  const [purchaseKeys, setPurchaseKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<TorqueErrorPresentation | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const settled = await Promise.allSettled([
      moduleShellApi.torqueshed.getTorqueAssistStatus(),
      moduleShellApi.torqueshed.getTokenLedger(),
    ] as const);
    if (settled[0].status === 'fulfilled') setStatus(settled[0].value);
    if (settled[1].status === 'fulfilled') setLedger(settled[1].value);
    const failure = settled.find((entry) => entry.status === 'rejected');
    if (failure?.status === 'rejected') setError(translateTorqueShedError(failure.reason));
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedDiagnosticId && diagnostics[0]?.id) setSelectedDiagnosticId(diagnostics[0].id);
  }, [diagnostics, selectedDiagnosticId]);

  const refreshPurchaseStatus = useCallback(async (purchaseId = purchaseReference) => {
    if (!purchaseId) return null;
    try {
      const next = await moduleShellApi.torqueshed.getTorqueTokenPurchaseStatus(purchaseId);
      setPurchaseStatus(next);
      setPurchaseReference(purchaseId);
      if (next.state === 'credited' && next.credited) {
        setNotice(`Credits added. Your available balance is ${next.balance.toLocaleString()} units.`);
        await load();
      }
      return next;
    } catch (next) {
      setError(translateTorqueShedError(next));
      return null;
    }
  }, [load, purchaseReference]);

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/iu.test(purchaseReference)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const delays = [1_000, 2_000, 3_000, 5_000, 8_000, 13_000];
    setNotice('Verifying payment. Returning from checkout does not add credits by itself.');
    const poll = async () => {
      const next = await refreshPurchaseStatus(purchaseReference);
      if (stopped || !next || next.terminal) return;
      if (attempt < delays.length) timer = setTimeout(poll, delays[attempt++]);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [purchaseReference, refreshPurchaseStatus]);

  async function purchase(packageKey: string) {
    if (!canWrite || !selectedDiagnosticId) return;
    const purchaseKey = purchaseKeys[packageKey] || key(`token-purchase:${packageKey}`);
    setPurchaseKeys((current) => ({ ...current, [packageKey]: purchaseKey }));
    setBusy(packageKey);
    setError(null);
    setNotice('');
    try {
      const next = await moduleShellApi.torqueshed.purchaseTorqueTokens(
        { diagnosticSessionId: selectedDiagnosticId, packageKey },
        purchaseKey,
      );
      const checkoutUrl = next.purchase.providerCheckoutUrl;
      if (typeof checkoutUrl === 'string' && checkoutUrl.startsWith('https://')) {
        window.location.assign(checkoutUrl);
        return;
      }
      const purchaseId = String(next.purchase.id ?? '');
      if (purchaseId) {
        setPurchaseReference(purchaseId);
        await refreshPurchaseStatus(purchaseId);
      }
      setNotice('Checkout was created. Credits appear only after the payment service confirms payment.');
      await load();
    } catch (next) {
      setError(translateTorqueShedError(next));
    } finally {
      setBusy('');
    }
  }

  const paymentsDisabled = !canWrite || !status?.purchaseReadiness.ready || !selectedDiagnosticId;
  return (
    <section data-testid="torqueshed-credits-route" style={{ display: 'grid', gap: space.lg }}>
      <div className="ts28-stats" aria-label="TorqueShed credit balance">
        <b>{(ledger?.availableBalance ?? status?.availableBalance ?? 0).toLocaleString()}<small>Available credits</small></b>
        <b>{(ledger?.reservedUnits ?? status?.reservedUnits ?? 0).toLocaleString()}<small>Credits currently in use</small></b>
        <b>{(ledger?.ledgerBalance ?? status?.ledgerBalance ?? 0).toLocaleString()}<small>Total credits</small></b>
      </div>

      {error && (
        <div role="alert" data-error-code={error.code} style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger }}>
          <strong>{error.message}</strong>
          {error.administratorAction && <details style={{ color: semantic.textMuted, marginTop: 6 }}><summary>Administrator details</summary>{error.administratorAction}</details>}
        </div>
      )}
      {notice && <div role="status" style={{ ...cardStyle, borderColor: '#16a34a77', color: semantic.accentSuccess }}>{notice}</div>}
      {!canWrite && <div role="status" data-testid="torqueshed-credits-read-only" style={{ ...cardStyle, borderColor: '#fbbf24', color: '#fde68a' }}>You can review your credit balance and purchase history. Edit access is required before TorqueShed can open a checkout or spend credits on a new analysis.</div>}
      {purchaseStatus && (
        <div data-testid="torque-purchase-status" style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span><strong>{purchaseMessage(purchaseStatus)}</strong><br /><small style={{ color: semantic.textMuted }}>{status?.packages.find((item) => item.key === purchaseStatus.packageKey)?.name ?? 'Diagnostic credit package'} · {purchaseStatus.units.toLocaleString()} credits · {money(purchaseStatus.amountMinor)}</small><details style={{ color: semantic.textMuted, marginTop: 4 }}><summary>Technical details</summary><code>{purchaseStatus.packageKey}</code></details></span>
          <button type="button" onClick={() => void refreshPurchaseStatus()} style={{ ...button, minHeight: 36, padding: '7px 10px' }}><RefreshCw size={14} /> Refresh status</button>
        </div>
      )}

      <article style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Buy diagnostic credits</h2>
        <p style={{ color: semantic.textMuted }}>Choose the diagnostic these credits will support. Credits are added only after the payment service confirms payment.</p>
        <label style={label}>
          Diagnostic session
          <select aria-label="Diagnostic session for credit purchase" value={selectedDiagnosticId} onChange={(event) => setSelectedDiagnosticId(event.target.value)} style={input}>
            <option value="">Select a diagnostic</option>
            {diagnostics.map((diagnostic) => <option key={diagnostic.id} value={diagnostic.id}>{diagnostic.title}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginTop: space.md }}>
          {status?.packages.map((tokenPackage) => (
            <button type="button" key={tokenPackage.key} disabled={paymentsDisabled || busy === tokenPackage.key} onClick={() => void purchase(tokenPackage.key)} style={{ ...button, minHeight: 76, background: semantic.bgPanel, color: semantic.text, border: `1px solid ${semantic.border}`, display: 'grid' }}>
              <span>{tokenPackage.name}</span><small>{tokenPackage.units.toLocaleString()} credits · {money(tokenPackage.amountMinor)}</small>
            </button>
          ))}
        </div>
        {!diagnostics.length && <p style={{ color: semantic.accentWarning }}>Start a diagnostic first so the credits are applied to the correct vehicle issue.</p>}
        {!status?.purchaseReadiness.ready && (
          <div style={{ color: semantic.accentDanger, marginTop: space.md }} data-testid="torque-credit-purchase-readiness">
            <strong>{status?.purchaseReadiness.userMessage ?? 'Credit purchase readiness is being checked. Nothing will be charged.'}</strong>
            {status?.purchaseReadiness.administratorAction && <div style={{ color: semantic.textMuted }}>{status.purchaseReadiness.administratorAction}</div>}
            {status?.purchaseReadiness.code && <details style={{ color: semantic.textMuted, marginTop: 6 }}><summary>Technical details</summary><code>{status.purchaseReadiness.code}</code></details>}
          </div>
        )}
      </article>

      <div className="ts28-grid">
        <article style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Recent purchases</h2>
          {ledger?.purchases.slice(0, 10).map((item) => (
            <div key={item.id} className="ts28-row"><div><strong>{status?.packages.find((tokenPackage) => tokenPackage.key === item.packageKey)?.name ?? 'Diagnostic credit package'}</strong><small>{new Date(String(item.createdAt)).toLocaleString()}</small><details><summary>Technical details</summary><code>{String(item.packageKey)}</code></details></div><button type="button" style={{ ...button, minHeight: 34, padding: '6px 9px' }} onClick={() => void refreshPurchaseStatus(String(item.id))}>{String(item.status).replaceAll('_', ' ')}</button></div>
          ))}
          {!ledger?.purchases.length && <p style={{ color: semantic.textMuted }}>No credit purchases yet.</p>}
        </article>
        <article style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Credit activity</h2>
          {ledger?.entries.slice(0, 10).map((item) => (
            <div key={item.id} className="ts28-row"><div><strong>{String(item.entryType ?? item.type ?? 'credit activity').replaceAll('_', ' ')}</strong><small>{new Date(String(item.createdAt)).toLocaleString()}</small></div><span>{Number(item.units ?? item.amount ?? 0).toLocaleString()} credits</span></div>
          ))}
          {!ledger?.entries.length && <p style={{ color: semantic.textMuted }}>No usage or purchase activity yet.</p>}
        </article>
      </div>
    </section>
  );
}

function DiagnosticDetail({
  detail,
  busy,
  canWrite,
  canManageTraining,
  mutate,
  refresh,
  showAssist,
  assistHref,
  creditsHref,
}: {
  detail: Record<string, any>;
  busy: string;
  canWrite: boolean;
  canManageTraining: boolean;
  mutate: (
    name: string,
    operation: () => Promise<unknown>,
    form?: HTMLFormElement,
    refresh?: () => Promise<void>,
  ) => Promise<void>;
  refresh: () => Promise<void>;
  showAssist: boolean;
  assistHref: string;
  creditsHref: string;
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
      {showAssist ? (
        <TorqueAssistPanel diagnostic={diagnostic} creditsHref={creditsHref} canWrite={canWrite} />
      ) : (
        <Link href={assistHref} style={{ ...button, textDecoration: 'none', marginBottom: space.md }}>
          <Bot size={16} /> Open Torque Assist for this diagnostic
        </Link>
      )}
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
          disabled={!canWrite || busy === 'Diagnostic status'}
          style={input}
        >
          {['open', 'testing', 'repairing', 'verified', 'resolved', 'archived'].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: space.md, margin: `${space.lg}px 0` }}>
        <OutcomeWorkflowAction
          workflowKey="torqueshed.diagnostic_to_snapproof"
          aggregateId={diagnostic.id}
          sourceVersion={diagnostic.version}
          sourceDeepLink={`/modules/torqueshed/diagnostics/${diagnostic.id}`}
          title="Build a customer proof package"
          description="Carry this vehicle, concern, diagnostic observations, repair, and verification into a field-ready closeout report without typing the job twice."
          destinationLabel="SnapProofOS"
          actionLabel="Preview customer proof"
          confirmationText="Create a connected diagnostic job and draft report in SnapProofOS. This does not send anything to the customer."
          disabled={!canWrite}
          disabledReason={!canWrite ? 'You need diagnostic edit access to create a customer proof package.' : undefined}
          previewItems={[
            { label: 'Diagnostic job', detail: 'Vehicle and customer concern connected to the current session' },
            { label: 'Recorded observations', detail: 'Existing diagnostic entries copied as field evidence notes' },
            { label: 'Draft closeout report', detail: 'Ready for manager review, branding, and secure delivery' },
          ]}
          testId="torqueshed-build-customer-proof"
        />
        <OutcomeWorkflowAction
          workflowKey="torqueshed.diagnostic_to_faultlinelab"
          aggregateId={diagnostic.id}
          sourceVersion={diagnostic.version}
          sourceDeepLink={`/modules/torqueshed/diagnostics/${diagnostic.id}`}
          title="Teach the team from this diagnosis"
          description="Turn the finished diagnostic path into a practice draft with common identifiers masked, ready for a trainer's full privacy and accuracy review."
          destinationLabel="FaultlineLab"
          actionLabel="Preview training draft"
          payload={{ authorApproved: true, privacyReviewed: true }}
          disabled={!canManageTraining || !['verified', 'resolved'].includes(diagnostic.status)}
          disabledReason={!canManageTraining
            ? 'An organization owner or administrator must approve this training draft.'
            : !['verified', 'resolved'].includes(diagnostic.status)
              ? 'Verify or resolve the diagnosis before turning it into team training.'
              : undefined}
          confirmationText="Create an unpublished authoring draft in FaultlineLab with common identifiers masked. I have reviewed this diagnostic for customer-sensitive information; a trainer must still complete a full privacy and accuracy review before publication."
          previewItems={[
            { label: 'Masked practice scenario', detail: 'Concern, symptoms, tests, and resolution become a draft with common identifiers masked' },
            { label: 'Trainer review step', detail: 'The draft remains unpublished until an author validates the cause and learning path' },
          ]}
          testId="torqueshed-create-training-draft"
        />
      </div>
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
          <input name="code" required aria-label="Diagnostic trouble code" placeholder="P0171" style={input} />
          <input name="description" aria-label="Trouble code description" placeholder="Description" style={input} />
          <input name="freezeFrame" aria-label="Freeze-frame note" placeholder="Freeze-frame note" style={input} />
          <button type="submit" disabled={!canWrite} style={button}>
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
          <select name="kind" aria-label="Evidence kind" style={input}>
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
          <input name="title" required aria-label="Evidence title" placeholder="Fuel pressure under load" style={input} />
          <input name="valueText" aria-label="Evidence observation or result" placeholder="Observation or result" style={input} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input name="valueNumeric" type="number" step="any" aria-label="Evidence numeric value" placeholder="Value" style={input} />
            <input name="unit" aria-label="Evidence unit" placeholder="Unit" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input name="referenceMin" type="number" step="any" aria-label="Reference minimum" placeholder="Min" style={input} />
            <input name="referenceMax" type="number" step="any" aria-label="Reference maximum" placeholder="Max" style={input} />
          </div>
          <input name="outcome" aria-label="Evidence outcome" placeholder="Outcome" style={input} />
          <button type="submit" disabled={!canWrite} style={button}>
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
          aria-label="Attach diagnostic evidence"
          accept="image/png,image/jpeg,application/pdf,text/plain,text/csv,application/json"
          required
          style={{ color: semantic.textMuted }}
        />
        <button type="submit" disabled={!canWrite} style={button}>
          <FileUp size={15} />
          Attach evidence
        </button>
      </form>
    </article>
  );
}

function TorqueAssistPanel({ diagnostic, creditsHref, canWrite }: { diagnostic: TorqueShedDiagnostic; creditsHref: string; canWrite: boolean }) {
  const [status, setStatus] = useState<TorqueAssistStatus | null>(null);
  const [context, setContext] = useState<Record<string, any> | null>(null);
  const [history, setHistory] = useState<Array<Record<string, any>>>([]);
  const [ledger, setLedger] = useState<{
    balance: number;
    ledgerBalance: number;
    reservedUnits: number;
    availableBalance: number;
    entries: Array<Record<string, any>>;
    purchases: Array<Record<string, any>>;
  } | null>(null);
  const [response, setResponse] = useState<TorqueAssistResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeRequestKey, setActiveRequestKey] = useState('');
  const [busy, setBusy] = useState('');
  const [assistError, setAssistError] = useState<TorqueErrorPresentation | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const settled = await Promise.allSettled([
      moduleShellApi.torqueshed.getTorqueAssistStatus(),
      moduleShellApi.torqueshed.getTorqueAssistContext(diagnostic.id),
      moduleShellApi.torqueshed.getTorqueAssistHistory(diagnostic.id),
      moduleShellApi.torqueshed.getTokenLedger(),
    ] as const);
    if (settled[0].status === 'fulfilled') setStatus(settled[0].value);
    if (settled[1].status === 'fulfilled') setContext(settled[1].value);
    if (settled[2].status === 'fulfilled') setHistory(settled[2].value.requests);
    if (settled[3].status === 'fulfilled') setLedger(settled[3].value);
    const failure = settled.find((entry) => entry.status === 'rejected');
    if (failure?.status === 'rejected') setAssistError(translateTorqueShedError(failure.reason));
  }, [diagnostic.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`torqueshed:checkout-form:${diagnostic.id}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        setAnswers(Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
      }
    } catch {
      // Session-scoped form recovery is optional; persistent diagnostic data
      // remains authoritative when storage is unavailable.
    }
  }, [diagnostic.id]);

  useEffect(() => {
    try {
      if (Object.keys(answers).length > 0) {
        window.sessionStorage.setItem(`torqueshed:checkout-form:${diagnostic.id}`, JSON.stringify(answers));
      }
    } catch {
      // Form recovery is best effort and never carries authority.
    }
  }, [answers, diagnostic.id]);

  const result = (response?.result ??
    history[0]?.responseJson ??
    null) as TorqueAssistResult | null;
  const providerDisabled = !status || status.provider.state === 'disabled';
  const availableUnits = ledger?.availableBalance ?? status?.availableBalance ?? 0;
  const estimatedUnits = Number(context?.estimatedUnits ?? 0);
  const clearlyInsufficient = estimatedUnits > 0 && availableUnits < estimatedUnits;
  const assistUnavailable = providerDisabled || !context || clearlyInsufficient;

  async function runAssist() {
    if (!canWrite) return;
    const requestKey = activeRequestKey || key('torque-assist');
    if (!activeRequestKey) setActiveRequestKey(requestKey);
    setBusy('assist');
    setAssistError(null);
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
      try { window.sessionStorage.removeItem(`torqueshed:checkout-form:${diagnostic.id}`); } catch {}
      setNotice(
        next.replayed
          ? 'Your previous result was restored; you were not charged again.'
          : `Diagnostic plan created. ${next.actualUnits.toLocaleString()} credits used; ${next.remainingBalance.toLocaleString()} credits remain.`,
      );
      await load();
    } catch (next) {
      setAssistError(translateTorqueShedError(next));
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
            <Coins size={17} /> {availableUnits.toLocaleString()} units available
          </strong>
          <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
            {(ledger?.ledgerBalance ?? status?.ledgerBalance ?? status?.balance ?? 0).toLocaleString()} total units
            {' · '}{(ledger?.reservedUnits ?? status?.reservedUnits ?? 0).toLocaleString()} reserved
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
      {assistError && (
        <div data-testid="torque-assist-error" data-error-code={assistError.code} style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger, padding: 10 }}>
          <strong>{assistError.message}</strong>
          {assistError.noCreditsConsumed && <div>No credits were consumed for this failed request.</div>}
          <div style={{ color: semantic.textMuted }}>{assistError.administratorAction}</div>
          {(assistError.correlationId || assistError.requestId) && (
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              Support reference: {assistError.correlationId ?? assistError.requestId}
            </div>
          )}
        </div>
      )}
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
          <strong>Maximum reservation</strong>
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
        disabled={!canWrite || assistUnavailable || busy === 'assist'}
        style={{ ...button, opacity: !canWrite || assistUnavailable || busy === 'assist' ? 0.55 : 1 }}
      >
        <Activity size={16} />
        {busy === 'assist'
          ? 'Analyzing safely…'
          : activeRequestKey
            ? 'Retry without another charge'
            : result?.status === 'follow_up_required'
              ? 'Answer follow-up questions'
              : clearlyInsufficient
                ? 'More credits required'
                : 'Generate diagnostic plan'}
      </button>

      {result && (
        <div style={{ display: 'grid', gap: space.md, color: semantic.text }}>
          <div>
            <strong>Summary</strong>
            <p style={{ color: semantic.textMuted }}>{result.summary}</p>
          </div>
          <div>
            <strong>What we know and what we are assuming</strong>
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
              <strong>Most likely causes</strong>
              {result.hypotheses.map((hypothesis) => (
                <div
                  key={hypothesis.rank}
                  style={{ borderTop: `1px solid ${semantic.border}`, padding: '8px 0' }}
                >
                  #{hypothesis.rank} · {hypothesis.confidence} confidence · {hypothesis.description}
                  <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                    Why it fits: {hypothesis.supportingEvidence.join('; ') || 'None recorded'} ·
                    What conflicts: {hypothesis.contradictingEvidence.join('; ') || 'None recorded'}
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

      {!canWrite && <div role="status" style={{ color: '#fde68a' }}>Read-only access lets you review prior analysis. New analysis and credit purchases are disabled.</div>}
      <Link href={creditsHref} style={{ color: '#fbbf24', fontWeight: 800 }}>
        Buy credits and review usage
      </Link>
    </section>
  );
}
