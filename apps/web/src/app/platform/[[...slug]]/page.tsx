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

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import TenantProvider from '@/components/TenantProvider';
import { ToastProvider } from '@/components/Toast';
import LoginPage from '@/components/pages/LoginPage';
import PlatformPage from '@/components/pages/PlatformPage';
import PlatformCommandShell from '@/components/platform/PlatformCommandShell';
import { pathToPlatformView, platformViewToPath, type PlatformView } from '@/lib/platform-routes';
import ContactLink from '@/components/ContactLink';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../../packages/modules/navigation.js';

function PlatformGate() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const rawSlug = (params as any)?.slug;
  const slug: string[] | undefined = Array.isArray(rawSlug) ? rawSlug : (rawSlug ? [rawSlug] : undefined);
  // The URL is the only view state. This makes refresh, deep links, and the
  // browser Back/Forward history authoritative instead of mirroring them in
  // component state.
  const view: PlatformView = pathToPlatformView(slug);

  if (loading) {
    return <PlatformCommandShell accessState="loading" view={view} />;
  }
  if (!user) return <LoginPage onSwitch={() => router.push('/')} />;
  if ((user as any).platformRole !== 'super_admin') {
    return (
      <PlatformCommandShell
        accessState="denied"
        view={view}
        deniedActions={<Link href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl}>Return to My Apps</Link>}
      />
    );
  }
  return (
    <PlatformCommandShell accessState="authorized" view={view}>
      <PlatformPage
        view={view}
        showNavigation={false}
        onNavigate={(nextView) => router.push(platformViewToPath(nextView))}
      />
    </PlatformCommandShell>
  );
}

export default function PlatformRoute() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ToastProvider>
          <PlatformGate />
          <ContactLink />
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
