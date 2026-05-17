'use client';

/**
 * Gate 2 — Path-addressable Platform Command surface.
 *
 *   /platform                            → Overview
 *   /platform/tenants                    → Tenant list
 *   /platform/tenants/:id                → Tenant detail
 *   /platform/modules                    → Module list
 *   /platform/modules/:slug              → Module detail
 *   /platform/billing | /pricing | /health | /audit
 *
 * The catch-all segment is parsed into the `view` prop that PlatformPage
 * expects, and PlatformPage receives an `onNavigate` callback that pushes
 * to the Next.js router so the URL stays in sync with internal state.
 *
 * Non-super-admins land on a 403 screen instead of the page (in addition
 * to API-level enforcement) so accidentally sharing a /platform URL with
 * a customer doesn't leak the surface.
 */

import { useParams, useRouter } from 'next/navigation';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import LoginPage from '@/components/pages/LoginPage';
import PlatformPage, { type PlatformView } from '@/components/pages/PlatformPage';
import { useState, useEffect } from 'react';

function pathToView(slug: string[] | undefined): PlatformView {
  if (!slug || slug.length === 0) return { kind: 'dashboard' };
  const [head, ...rest] = slug;
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
    case 'health':  return { kind: 'health' };
    case 'audit':   return { kind: 'audit' };
    default:        return { kind: 'dashboard' };
  }
}

function viewToPath(v: PlatformView): string {
  // Post-route-split: Platform Command lives at /app/platform/*.
  // Legacy /platform/* URLs 308-redirect here via next.config.js,
  // but every in-app navigation should emit the canonical /app/* path
  // so the browser URL stays consistent with the rendered surface.
  switch (v.kind) {
    case 'dashboard': return '/app/platform';
    case 'tenants':   return '/app/platform/tenants';
    case 'tenant':    return `/app/platform/tenants/${v.id}`;
    case 'modules':   return '/app/platform/modules';
    case 'module':    return `/app/platform/modules/${v.slug}`;
    case 'users':     return '/app/platform/users';
    case 'user':      return `/app/platform/users/${v.id}`;
    case 'billing':   return '/app/platform/billing';
    case 'pricing':   return '/app/platform/pricing';
    case 'health':    return '/app/platform/health';
    case 'audit':     return '/app/platform/audit';
    default:          return '/app/platform';
  }
}

function PlatformGate() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const rawSlug = (params as any)?.slug;
  const slug: string[] | undefined = Array.isArray(rawSlug) ? rawSlug : (rawSlug ? [rawSlug] : undefined);
  const [view, setView] = useState<PlatformView>(() => pathToView(slug));

  // Re-derive view whenever the URL changes (browser back/forward).
  useEffect(() => { setView(pathToView(slug)); }, [JSON.stringify(slug)]);

  if (loading) {
    return <div style={{ padding: 48, color: '#8b949e', textAlign: 'center' }}>Loading…</div>;
  }
  if (!user) return <LoginPage onSwitch={() => router.push('/')} />;
  if ((user as any).platformRole !== 'super_admin') {
    return (
      <div style={{ padding: 48, color: '#f85149', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20 }}>403 — Platform Command requires super-admin role.</h1>
        <a href="/app" style={{ color: '#58a6ff' }}>← Return to your workspace</a>
      </div>
    );
  }
  return (
    <PlatformPage
      view={view}
      onNavigate={(v) => { setView(v); router.push(viewToPath(v)); }}
    />
  );
}

export default function PlatformRoute() {
  return (
    <AuthProvider>
      <ToastProvider>
        <PlatformGate />
      </ToastProvider>
    </AuthProvider>
  );
}
