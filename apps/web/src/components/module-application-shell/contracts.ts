import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

export type ModuleShellDensity = 'compact' | 'comfortable' | 'spacious';

export interface ModuleThemeTokens {
  id: string;
  colorScheme: 'light' | 'dark';
  colors: {
    background: string;
    panel: string;
    panelRaised: string;
    text: string;
    muted: string;
    border: string;
    primary: string;
    secondary: string;
    accent: string;
    danger: string;
    success: string;
    focus: string;
  };
  radius: {
    small: string;
    medium: string;
    large: string;
  };
  density: ModuleShellDensity;
  typography: {
    body: string;
    heading: string;
    accent?: string;
  };
  imagery?: {
    hero?: string;
    background?: string;
    overlay?: string;
  };
}

export type ModuleRouteActiveMatch =
  | { kind: 'exact' }
  | { kind: 'prefix' }
  | { kind: 'paths'; paths: readonly string[] };

export interface ModuleRouteManifestItem<
  Capability extends string = string,
  Role extends string = string,
> {
  id: string;
  canonicalPath: string;
  label: string;
  mobileLabel?: string;
  breadcrumbLabel?: string;
  icon: LucideIcon;
  activeMatch: ModuleRouteActiveMatch;
  requiredCapability?: Capability;
  requiredRoles?: readonly Role[];
  badge?: string;
  status?: 'ready' | 'attention' | 'disabled';
}

export interface ModuleRouteManifestGroup<
  Capability extends string = string,
  Role extends string = string,
> {
  id: string;
  label: string;
  items: readonly ModuleRouteManifestItem<Capability, Role>[];
}

export interface ModuleRouteAccess<Capability extends string = string, Role extends string = string> {
  capabilities?: ReadonlySet<Capability>;
  roles?: ReadonlySet<Role>;
}

export function normalizeModulePath(path: string): string {
  const pathname = path.split(/[?#]/u, 1)[0] || '/';
  const normalized = `/${pathname.split('/').filter(Boolean).join('/')}`;
  return normalized === '/' ? '/' : normalized.replace(/\/$/u, '');
}

export function isModuleRouteActive(item: ModuleRouteManifestItem, currentPath: string): boolean {
  const current = normalizeModulePath(currentPath);
  const canonical = normalizeModulePath(item.canonicalPath);
  if (item.activeMatch.kind === 'exact') return current === canonical;
  if (item.activeMatch.kind === 'prefix') return current === canonical || current.startsWith(`${canonical}/`);
  return item.activeMatch.paths.some(path => {
    const candidate = normalizeModulePath(path);
    return current === candidate || current.startsWith(`${candidate}/`);
  });
}

export function canAccessModuleRoute<Capability extends string, Role extends string>(
  item: ModuleRouteManifestItem<Capability, Role>,
  access: ModuleRouteAccess<Capability, Role>,
): boolean {
  if (item.requiredCapability && !access.capabilities?.has(item.requiredCapability)) return false;
  if (item.requiredRoles?.length && !item.requiredRoles.some(role => access.roles?.has(role))) return false;
  return true;
}

export function findActiveModuleRoute<Capability extends string, Role extends string>(
  groups: readonly ModuleRouteManifestGroup<Capability, Role>[],
  currentPath: string,
): ModuleRouteManifestItem<Capability, Role> | undefined {
  return groups.flatMap(group => group.items).find(item => isModuleRouteActive(item, currentPath));
}

export function moduleThemeStyle(theme: ModuleThemeTokens): CSSProperties {
  const density = theme.density === 'compact' ? '0.85' : theme.density === 'spacious' ? '1.15' : '1';
  return {
    colorScheme: theme.colorScheme,
    '--module-background': theme.colors.background,
    '--module-panel': theme.colors.panel,
    '--module-panel-raised': theme.colors.panelRaised,
    '--module-text': theme.colors.text,
    '--module-muted': theme.colors.muted,
    '--module-border': theme.colors.border,
    '--module-primary': theme.colors.primary,
    '--module-secondary': theme.colors.secondary,
    '--module-accent': theme.colors.accent,
    '--module-danger': theme.colors.danger,
    '--module-success': theme.colors.success,
    '--module-focus': theme.colors.focus,
    '--module-radius-small': theme.radius.small,
    '--module-radius-medium': theme.radius.medium,
    '--module-radius-large': theme.radius.large,
    '--module-density': density,
    '--module-font-body': theme.typography.body,
    '--module-font-heading': theme.typography.heading,
    '--module-font-accent': theme.typography.accent ?? theme.typography.heading,
    '--module-hero-image': theme.imagery?.hero ? `url("${theme.imagery.hero}")` : 'none',
    '--module-background-image': theme.imagery?.background ? `url("${theme.imagery.background}")` : 'none',
    '--module-image-overlay': theme.imagery?.overlay ?? 'transparent',
  } as CSSProperties;
}
