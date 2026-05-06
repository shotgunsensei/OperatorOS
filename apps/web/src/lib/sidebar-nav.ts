import {
  LayoutGrid, Store, Sparkles, Receipt, Settings as SettingsIcon,
  Building2, Users as UsersIcon, Boxes, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface SidebarRoleFlags {
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

export function buildNavSections(opts: SidebarRoleFlags): NavSection[] {
  const sections: NavSection[] = [];

  sections.push({
    label: 'Launch',
    items: [
      { id: 'my-apps', label: 'My Apps', Icon: LayoutGrid },
      { id: 'apps', label: 'App Marketplace', Icon: Store },
      { id: 'ai-tools', label: 'AI Assistant', Icon: Sparkles },
    ],
  });

  if (opts.isTenantAdmin) {
    sections.push({
      label: 'Tenant',
      items: [
        { id: 'command-center', label: 'Command Center', Icon: Building2 },
        { id: 'tenant-users', label: 'Members', Icon: UsersIcon },
        { id: 'tenant-modules', label: 'Modules', Icon: Boxes },
        { id: 'tenant-billing', label: 'Tenant Billing', Icon: Receipt },
        { id: 'tenant-settings', label: 'Tenant Settings', Icon: SettingsIcon },
      ],
    });
  }

  if (opts.isSuperAdmin) {
    sections.push({
      label: 'Platform',
      items: [{ id: 'platform', label: 'Platform Command', Icon: ShieldCheck }],
    });
  }

  sections.push({
    label: 'Account',
    items: [
      { id: 'billing', label: 'Billing', Icon: Receipt },
      { id: 'settings', label: 'Settings', Icon: SettingsIcon },
    ],
  });

  return sections;
}
