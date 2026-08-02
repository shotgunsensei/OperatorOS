import {
  LayoutGrid, Store, Sparkles, Receipt, Settings as SettingsIcon,
  Building2, Users as UsersIcon, Boxes, ShieldCheck, Mail,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  // When set, the item is an external link (rendered as an anchor) instead of
  // an internal page navigation handled by the console router.
  href?: string;
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
    label: 'Workspace',
    items: [
      { id: 'my-apps', label: 'Home', Icon: LayoutGrid },
      { id: 'apps', label: 'Browse tools', Icon: Store },
      { id: 'ai-tools', label: 'AI tools', Icon: Sparkles },
    ],
  });

  if (opts.isTenantAdmin) {
    sections.push({
      label: 'Organization',
      items: [
        { id: 'command-center', label: 'Overview', Icon: Building2 },
        { id: 'tenant-users', label: 'Team members', Icon: UsersIcon },
        { id: 'tenant-modules', label: 'Tool access', Icon: Boxes },
        { id: 'tenant-billing', label: 'Billing and add-ons', Icon: Receipt },
        { id: 'tenant-settings', label: 'Organization settings', Icon: SettingsIcon },
      ],
    });
  }

  if (opts.isSuperAdmin) {
    sections.push({
      label: 'Platform',
      items: [{ id: 'platform', label: 'Platform administration', Icon: ShieldCheck }],
    });
  }

  sections.push({
    label: 'Account',
    items: [
      { id: 'billing', label: 'Workspace plan', Icon: Receipt },
      { id: 'settings', label: 'Profile and security', Icon: SettingsIcon },
      { id: 'contact', label: 'Help and support', Icon: Mail, href: 'https://operatoros.net/john' },
    ],
  });

  return sections;
}
