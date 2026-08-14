export type PlatformView =
  | { kind: 'dashboard' }
  | { kind: 'tenants' }
  | { kind: 'tenant'; id: string }
  | { kind: 'modules' }
  | { kind: 'module'; slug: string }
  | { kind: 'users' }
  | { kind: 'user'; id: string }
  | { kind: 'billing' }
  | { kind: 'pricing' }
  | { kind: 'health' }
  | { kind: 'audit' }
  | { kind: 'sso' };

export const PLATFORM_COMMAND_BASE = '/app/platform';

function normalizeSlug(slug: string[] | string | null | undefined): string[] | undefined {
  if (!slug) return undefined;
  return Array.isArray(slug) ? slug : [slug];
}

export function pathToPlatformView(slug: string[] | string | null | undefined): PlatformView {
  const parts = normalizeSlug(slug);
  if (!parts || parts.length === 0) return { kind: 'dashboard' };

  const [head, ...rest] = parts;
  switch (head) {
    case 'tenants':
      if (rest[0]) return { kind: 'tenant', id: rest[0] };
      return { kind: 'tenants' };
    case 'modules':
      if (rest[0]) return { kind: 'module', slug: rest[0] };
      return { kind: 'modules' };
    case 'users':
      if (rest[0]) return { kind: 'user', id: rest[0] };
      return { kind: 'users' };
    case 'billing': return { kind: 'billing' };
    case 'pricing': return { kind: 'pricing' };
    case 'health': return { kind: 'health' };
    case 'audit': return { kind: 'audit' };
    case 'sso': return { kind: 'sso' };
    default: return { kind: 'dashboard' };
  }
}

export function platformViewToPath(view: PlatformView): string {
  switch (view.kind) {
    case 'dashboard': return PLATFORM_COMMAND_BASE;
    case 'tenants': return `${PLATFORM_COMMAND_BASE}/tenants`;
    case 'tenant': return `${PLATFORM_COMMAND_BASE}/tenants/${view.id}`;
    case 'modules': return `${PLATFORM_COMMAND_BASE}/modules`;
    case 'module': return `${PLATFORM_COMMAND_BASE}/modules/${view.slug}`;
    case 'users': return `${PLATFORM_COMMAND_BASE}/users`;
    case 'user': return `${PLATFORM_COMMAND_BASE}/users/${view.id}`;
    case 'billing': return `${PLATFORM_COMMAND_BASE}/billing`;
    case 'pricing': return `${PLATFORM_COMMAND_BASE}/pricing`;
    case 'health': return `${PLATFORM_COMMAND_BASE}/health`;
    case 'audit': return `${PLATFORM_COMMAND_BASE}/audit`;
    case 'sso': return `${PLATFORM_COMMAND_BASE}/sso`;
    default: return PLATFORM_COMMAND_BASE;
  }
}
