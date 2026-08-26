'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, FileText, Grid2X2, LayoutDashboard, Megaphone, Palette, PlugZap, Settings, Sparkles, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell, type ModuleRouteManifestGroup, type ModuleThemeTokens } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { getActiveTenantId } from '@/lib/auth';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

const BrandForgeWorkspace = dynamic(() => import('./BrandForgeWorkspace'), {
  loading: () => <div role="status" aria-busy="true"><Activity size={18}/> Loading this creative route…</div>,
});

const theme: ModuleThemeTokens = {
  id: 'brandforge-magenta-creative-lab', colorScheme: 'dark', density: 'comfortable',
  colors: { background: '#09070f', panel: '#16101e', panelRaised: '#21132d', text: '#fff7ff', muted: '#c9b6cf', border: '#5d3a67', primary: '#f0abfc', secondary: '#a855f7', accent: '#fb7185', danger: '#fb7185', success: '#6ee7b7', focus: '#fbbf24' },
  radius: { small: '8px', medium: '13px', large: '20px' },
  typography: { body: 'Inter,ui-sans-serif,system-ui,sans-serif', heading: 'Inter,ui-sans-serif,system-ui,sans-serif', accent: 'ui-monospace,"Cascadia Code",monospace' },
  imagery: { overlay: 'radial-gradient(circle at 82% 0,rgba(217,70,239,.18),transparent 32rem),radial-gradient(circle at 6% 10%,rgba(168,85,247,.12),transparent 28rem)' },
};

const nav: readonly ModuleRouteManifestGroup[] = [
  { id: 'create', label: 'Creative production', items: [
    { id: 'overview', canonicalPath: '/', label: 'Dashboard', icon: LayoutDashboard, activeMatch: { kind: 'exact' } },
    { id: 'brands', canonicalPath: '/brands', label: 'Brands', icon: Palette, activeMatch: { kind: 'prefix' } },
    { id: 'personas', canonicalPath: '/personas', label: 'Personas', icon: Users, activeMatch: { kind: 'prefix' } },
    { id: 'campaigns', canonicalPath: '/campaigns', label: 'Campaigns', icon: Megaphone, activeMatch: { kind: 'prefix' } },
    { id: 'content', canonicalPath: '/content', label: 'Content & assets', icon: FileText, activeMatch: { kind: 'prefix' } },
    { id: 'calendar', canonicalPath: '/calendar', label: 'Calendar', icon: CalendarDays, activeMatch: { kind: 'prefix' } },
    { id: 'approvals', canonicalPath: '/approvals', label: 'Approvals', icon: CheckCircle2, activeMatch: { kind: 'prefix' } },
  ] },
  { id: 'grow', label: 'Growth and control', items: [
    { id: 'automation', canonicalPath: '/ai-workflows', label: 'AI workflows', icon: Sparkles, activeMatch: { kind: 'prefix' } },
    { id: 'analytics', canonicalPath: '/analytics', label: 'Analytics', icon: BarChart3, activeMatch: { kind: 'prefix' } },
    { id: 'reports', canonicalPath: '/reports', label: 'Reports', icon: FileText, activeMatch: { kind: 'prefix' } },
    { id: 'integrations', canonicalPath: '/integrations', label: 'Integrations', icon: PlugZap, activeMatch: { kind: 'prefix' } },
    { id: 'settings', canonicalPath: '/settings', label: 'Settings', icon: Settings, activeMatch: { kind: 'prefix' } },
  ] },
];

const copy: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  dashboard: { eyebrow: 'Creative command', title: 'BrandForgeOS dashboard', subtitle: 'Coordinate real brands, campaigns, assets, approvals, and measurable launch work.' },
  brands: { eyebrow: 'Reusable identity systems', title: 'Brands and audiences', subtitle: 'Manage durable brand kits, voice, visual rules, assets, and audience evidence.' },
  personas: { eyebrow: 'Audience evidence', title: 'Personas', subtitle: 'Maintain durable audience profiles that campaigns can select and measure.' },
  campaigns: { eyebrow: 'Campaign production', title: 'Campaigns', subtitle: 'Move briefs, offers, content, and approval state through a durable campaign workflow.' },
  content: { eyebrow: 'Content production', title: 'Content and assets', subtitle: 'Create reviewable copy and generation artifacts without presenting provider-disabled output as complete.' },
  calendar: { eyebrow: 'Publishing rhythm', title: 'Content calendar', subtitle: 'Schedule persisted campaign deliverables and review upcoming work.' },
  approvals: { eyebrow: 'Human review', title: 'Approvals', subtitle: 'Review campaign and deliverable state before release or export.' },
  'ai-workflows': { eyebrow: 'Provider-aware creation', title: 'AI workflows', subtitle: 'Generate review-ready drafts with recorded provenance and honest provider state.' },
  analytics: { eyebrow: 'Measured creative work', title: 'Analytics', subtitle: 'Review persisted campaign performance and recommendations.' },
  reports: { eyebrow: 'Portable evidence', title: 'Reports and exports', subtitle: 'Create and retrieve authorized creative-operation reports and exports.' },
  integrations: { eyebrow: 'Controlled connections', title: 'Integrations', subtitle: 'Configure provider connections without weakening OperatorOS authority or secret handling.' },
  settings: { eyebrow: 'Workspace control', title: 'BrandForgeOS settings', subtitle: 'Review onboarding, plan usage, security, and creative workspace preferences.' },
};

function area(path?: string): string {
  const root = (path || '/').split(/[?#]/u, 1)[0].replace(/^\/modules\/brandforgeos\/?/u, '').split('/').filter(Boolean)[0] || 'dashboard';
  if (['dashboard','home','login'].includes(root)) return 'dashboard';
  if (root === 'brands') return 'brands';
  if (root === 'personas') return 'personas';
  if (['campaigns','offers'].includes(root)) return 'campaigns';
  if (['content','assets','copy-studio'].includes(root)) return 'content';
  if (root === 'calendar' || root === 'calendar-items') return 'calendar';
  if (root === 'approvals') return 'approvals';
  if (['ai-workflows','generations'].includes(root)) return 'ai-workflows';
  if (root === 'analytics') return 'analytics';
  if (['reports','exports'].includes(root)) return 'reports';
  if (root === 'integrations') return 'integrations';
  if (['settings','activity','admin','onboarding','pricing','legal','privacy','terms'].includes(root)) return 'settings';
  return root;
}

export default function BrandForgeRouteShell({ routePath }: { baseUrl?: string; routePath?: string }) {
  const pathname = usePathname(); const { user, loading: authLoading } = useAuth(); const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId(); const currentArea = area(routePath || pathname); const page = copy[currentArea] ?? copy.dashboard;
  const source = pathname.startsWith('/app/') || pathname.startsWith('/modules/'); const hrefFor = useCallback((path: string) => source ? `/modules/brandforgeos${path === '/' ? '/dashboard' : path}` : path, [source]);
  const navigation = useMemo(() => nav.map(group => ({ ...group, items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })) })), [hrefFor]);
  return <ModuleApplicationShell moduleId="brandforgeos" moduleName="BrandForgeOS" theme={theme} currentPath={hrefFor(currentArea === 'dashboard' ? '/' : `/${currentArea}`)} navigation={navigation}
    brand={<Link href={hrefFor('/')} style={{ color:'#fff7ff', textDecoration:'none', fontWeight:900 }}>BrandForge<span style={{color:'#f0abfc'}}>OS</span></Link>}
    organization={{ label:'Organization', value:activeTenant?.name ?? tenantId ?? 'No organization selected' }} accessContext={{label:'Access',value:user?.platformRole==='super_admin'?'Platform administrator':activeRole ?? 'member'}}
    utilityActions={[{label:'My Apps',href:DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl,icon:Grid2X2},{label:'Profile',href:DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl,icon:UserRound}]}
    page={{...page}} state={authLoading||tenantLoading?'loading':!tenantId?'empty':'ready'} stateMessage={!tenantId?'Choose an organization before opening BrandForgeOS.':undefined} mobileNavigation="drawer" testId="brandforgeos-module-shell" pageHeaderTestId="brandforgeos-module-header">
    {tenantId && <BrandForgeWorkspace key={`${tenantId}-${currentArea}`} routePath={currentArea === 'dashboard' ? '/' : `/${currentArea}`} embedded />}
  </ModuleApplicationShell>;
}
