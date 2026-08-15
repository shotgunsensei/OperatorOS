import {
  ArchiveRestore,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import type { ModuleRouteManifestGroup, ModuleThemeTokens } from '@/components/module-application-shell';

export type TradeFlowKitCapability = 'read' | 'manage';
export type TradeFlowKitRole = 'viewer' | 'member' | 'admin' | 'owner' | 'platform-admin';

export const TRADEFLOWKIT_THEME: ModuleThemeTokens = {
  id: 'tradeflowkit-orange-navy',
  colorScheme: 'light',
  colors: {
    background: 'hsl(0 0% 100%)',
    panel: 'hsl(0 0% 100%)',
    panelRaised: 'hsl(214 25% 96%)',
    text: 'hsl(0 0% 9%)',
    muted: 'hsl(215 16% 40%)',
    border: 'hsl(0 0% 89%)',
    primary: 'hsl(25 95% 36%)',
    secondary: 'hsl(214 88% 45%)',
    accent: 'hsl(25 95% 48%)',
    danger: 'hsl(0 72% 45%)',
    success: 'hsl(154 72% 31%)',
    focus: 'hsl(214 88% 45%)',
  },
  radius: { small: '7px', medium: '9px', large: '14px' },
  density: 'comfortable',
  typography: {
    body: '"Open Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    heading: '"Open Sans", ui-sans-serif, system-ui, sans-serif',
    accent: '"Open Sans", ui-sans-serif, system-ui, sans-serif',
  },
};

const prefix = '/modules/tradeflowkit';

export const TRADEFLOWKIT_NAVIGATION: readonly ModuleRouteManifestGroup<TradeFlowKitCapability, TradeFlowKitRole>[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { id: 'dashboard', canonicalPath: `${prefix}/dashboard`, label: 'Dashboard', icon: LayoutDashboard, activeMatch: { kind: 'exact' }, requiredCapability: 'read' },
      { id: 'leads', canonicalPath: `${prefix}/leads`, label: 'Leads', icon: ClipboardList, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
      { id: 'customers', canonicalPath: `${prefix}/customers`, label: 'Customers', icon: Users, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
      { id: 'jobs', canonicalPath: `${prefix}/jobs`, label: 'Jobs', icon: BriefcaseBusiness, activeMatch: { kind: 'paths', paths: [`${prefix}/jobs`, `${prefix}/tasks`] }, requiredCapability: 'read' },
      { id: 'quotes', canonicalPath: `${prefix}/quotes`, label: 'Quotes', icon: FileText, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
      { id: 'invoices', canonicalPath: `${prefix}/invoices`, label: 'Invoices', icon: Receipt, activeMatch: { kind: 'paths', paths: [`${prefix}/invoices`, `${prefix}/payments`] }, requiredCapability: 'read' },
      { id: 'analytics', canonicalPath: `${prefix}/analytics`, label: 'Analytics', icon: BarChart3, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'settings', canonicalPath: `${prefix}/settings`, label: 'Settings', mobileLabel: 'More', icon: Settings, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
      { id: 'trash', canonicalPath: `${prefix}/trash`, label: 'Trash', icon: ArchiveRestore, activeMatch: { kind: 'prefix' }, requiredCapability: 'read', requiredRoles: ['admin', 'owner', 'platform-admin'] },
    ],
  },
] as const;

export const TRADEFLOWKIT_MOBILE_ROUTE_IDS = ['dashboard', 'leads', 'jobs', 'settings'] as const;
