'use client';

/**
 * Gate 2 — Path-addressable Platform Command surface.
 *
 * Canonical:
 *   /app/platform                         -> Overview
 *   /app/platform/tenants                 -> Tenant list
 *   /app/platform/tenants/:id             -> Tenant detail
 *   /app/platform/modules                 -> Module list
 *   /app/platform/modules/:slug           -> Module detail
 *   /app/platform/users                   -> User list
 *   /app/platform/users/:id               -> User detail
 *   /app/platform/billing | /pricing | /health | /audit | /sso
 *
 * Legacy `/platform[/...]` URLs 308-redirect here through next.config.js.
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
import PlatformPage from '@/components/pages/PlatformPage';
import { pathToPlatformView, platformViewToPath, type PlatformView } from '@/lib/platform-routes';
import { useState, useEffect } from 'react';

function PlatformGate() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const rawSlug = (params as any)?.slug;
  const slug: string[] | undefined = Array.isArray(rawSlug) ? rawSlug : (rawSlug ? [rawSlug] : undefined);
  const [view, setView] = useState<PlatformView>(() => pathToPlatformView(slug));

  // Re-derive view whenever the URL changes (browser back/forward).
  useEffect(() => { setView(pathToPlatformView(slug)); }, [JSON.stringify(slug)]);

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
      onNavigate={(v) => { setView(v); router.push(platformViewToPath(v)); }}
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
