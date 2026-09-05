'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useCallback, useMemo } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, FileText, Grid2X2, LayoutDashboard, LifeBuoy, Megaphone, Palette, PlugZap, Settings, Sparkles, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { ModuleApplicationShell, type ModuleRouteManifestGroup, type ModuleThemeTokens } from '@/components/module-application-shell';
import { useTenant } from '@/components/TenantProvider';
import { useModuleAccessLevel } from '@/components/ModuleAccessContext';
import { getActiveTenantId } from '@/lib/auth';
import { buildOperatorOSHelpUrl, DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

const BrandForgeWorkspace = dynamic(() => import('./BrandForgeWorkspace'), {
  loading: () => <div role="status" aria-busy="true"><Activity size={18}/> Opening your creative workspace…</div>,
});

const theme: ModuleThemeTokens = {
  id: 'brandforge-magenta-creative-lab', colorScheme: 'dark', density: 'comfortable',
  colors: { background: '#09070f', panel: '#16101e', panelRaised: '#21132d', text: '#fff7ff', muted: '#c9b6cf', border: '#5d3a67', primary: '#f0abfc', secondary: '#a855f7', accent: '#fb7185', danger: '#fb7185', success: '#6ee7b7', focus: '#fbbf24' },
  radius: { small: '8px', medium: '13px', large: '20px' },
  typography: { body: '"Inter Variable",ui-sans-serif,system-ui,sans-serif', heading: '"Inter Variable",ui-sans-serif,system-ui,sans-serif', accent: 'ui-monospace,"Cascadia Code",monospace' },
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
  dashboard: { eyebrow: 'Move ideas toward launch', title: 'BrandForgeOS dashboard', subtitle: 'See active brands, campaigns, content deadlines, approvals, and performance in one creative workspace.' },
  brands: { eyebrow: 'Create once and stay consistent', title: 'Brands and audiences', subtitle: 'Build reusable brand kits with voice, colors, visual rules, approved assets, and audience guidance.' },
  personas: { eyebrow: 'Create for a real audience', title: 'Personas', subtitle: 'Describe the people each offer serves so campaigns start with a focused message.' },
  campaigns: { eyebrow: 'Take a campaign from brief to approval', title: 'Campaigns', subtitle: 'Keep the offer, audience, content, tasks, and review decisions together through launch preparation.' },
  content: { eyebrow: 'Prepare assets people can review', title: 'Content and assets', subtitle: 'Create and compare copy, landing-page drafts, and campaign assets before they are approved for use.' },
  calendar: { eyebrow: 'Keep production on schedule', title: 'Content calendar', subtitle: 'Plan campaign deliverables, spot late work, and see what needs review next.' },
  approvals: { eyebrow: 'Approve before anything leaves the team', title: 'Approvals', subtitle: 'Review campaigns and deliverables before they are exported or recorded as released.' },
  'ai-workflows': { eyebrow: 'Turn the brief into a strong first draft', title: 'AI workflows', subtitle: 'Use your saved brand, audience, offer, and channels to prepare drafts for human review.' },
  analytics: { eyebrow: 'Learn what is working', title: 'Analytics', subtitle: 'Review recorded campaign results and decide what to continue, change, or stop.' },
  reports: { eyebrow: 'Package work for your team or client', title: 'Reports and exports', subtitle: 'Create and download campaign reports and files your team or client can review.' },
  integrations: { eyebrow: 'Move approved work into the tools your team uses', title: 'Connections and exports', subtitle: 'Download logos and campaign files for Canva or Figma, or send an approved campaign to Deploy Ops. Direct publishing connections are not available yet.' },
  settings: { eyebrow: 'Give every campaign the right context', title: 'Workspace profile', subtitle: 'Maintain the business profile, goals, and preferred channels that guide campaign work. OperatorOS owns membership, access, and billing.' },
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

function workspaceRoute(path?: string): string {
  const raw = path || '/';
  if (/^[a-z][a-z0-9+.-]*:/iu.test(raw) || raw.startsWith('//') || /[\u0000-\u001f\u007f]/u.test(raw)) return '/';
  const clean = raw.split(/[?#]/u, 1)[0].replace(/^\/modules\/brandforgeos\/?/u, '');
  return `/${clean.split('/').filter(Boolean).join('/')}`;
}

export default function BrandForgeRouteShell({ routePath }: { baseUrl?: string; routePath?: string }) {
  const pathname = usePathname(); const { user, loading: authLoading } = useAuth(); const { activeTenant, activeRole, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? user?.currentTenantId ?? getActiveTenantId(); const currentRoute = workspaceRoute(routePath || pathname); const currentArea = area(currentRoute); const page = copy[currentArea] ?? copy.dashboard;
  const moduleAccessLevel = useModuleAccessLevel();
  const platformAdmin = user?.platformRole === 'super_admin';
  const canWriteModule = platformAdmin || (activeRole !== 'viewer' && (moduleAccessLevel
    ? moduleAccessLevel === 'user' || moduleAccessLevel === 'manager'
    : Boolean(activeRole)));
  const canAdminModule = canWriteModule && (platformAdmin || activeRole === 'owner' || activeRole === 'admin');
  const source = pathname.startsWith('/app/') || pathname.startsWith('/modules/'); const hrefFor = useCallback((path: string) => source ? `/modules/brandforgeos${path === '/' ? '/dashboard' : path}` : path, [source]);
  const navigation = useMemo(() => nav.map(group => ({ ...group, items: group.items.map(item => ({ ...item, canonicalPath: hrefFor(item.canonicalPath) })) })), [hrefFor]);
  return <ModuleApplicationShell moduleId="brandforgeos" moduleName="BrandForgeOS" theme={theme} currentPath={hrefFor(currentArea === 'dashboard' ? '/' : `/${currentArea}`)} navigation={navigation}
    brand={<Link href={hrefFor('/')} style={{ color:'#fff7ff', textDecoration:'none', fontWeight:900 }}>BrandForge<span style={{color:'#f0abfc'}}>OS</span></Link>}
    organization={{ label:'Organization', value:activeTenant?.name ?? (tenantId ? 'Selected organization' : 'No organization selected') }} accessContext={{label:'Access',value:platformAdmin?'Platform administrator':!canWriteModule?'Read-only access':activeRole === 'owner'?'Organization owner':activeRole === 'admin'?'Organization administrator':moduleAccessLevel === 'manager'?'Brand manager':'Brand contributor'}}
    utilityActions={[{label:'My Apps',href:DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl,icon:Grid2X2},{label:'Profile',href:DEFAULT_OPERATOROS_NAVIGATION_URLS.profileUrl,icon:UserRound},{label:'Help',href:buildOperatorOSHelpUrl({module:'brandforgeos',page:currentArea==='dashboard'?'/':`/${currentArea}`}),icon:LifeBuoy}]}
    page={{...page}} state={authLoading||tenantLoading?'loading':!tenantId?'empty':'ready'} stateMessage={!tenantId?'Choose an organization before opening BrandForgeOS.':undefined} mobileNavigation="drawer" testId="brandforgeos-module-shell" pageHeaderTestId="brandforgeos-module-header">
    {tenantId && <BrandForgeWorkspace key={`${tenantId}-${currentArea}-${currentRoute}`} routePath={currentRoute} tenantKey={tenantId} embedded hrefFor={hrefFor} canWrite={canWriteModule} canAdmin={canAdminModule} />}
  </ModuleApplicationShell>;
}
