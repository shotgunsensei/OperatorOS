'use client';

import { useEffect, useState } from 'react';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import TenantProvider, { useTenant } from '@/components/TenantProvider';
import { ToastProvider } from '@/components/Toast';
import SaasLayout from '@/components/SaasLayout';
import LoginPage from '@/components/pages/LoginPage';
import RegisterPage from '@/components/pages/RegisterPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import SuspendedPage from '@/components/pages/SuspendedPage';
import UnauthorizedPage from '@/components/pages/UnauthorizedPage';
import AiToolsPage from '@/components/pages/AiToolsPage';
import BillingPage from '@/components/pages/BillingPage';
import SettingsPage from '@/components/pages/SettingsPage';
import AppsPage from '@/components/pages/AppsPage';
import PlatformPage from '@/components/pages/PlatformPage';
import MyAppsPage from '@/components/pages/MyAppsPage';
import TenantCommandCenterPage from '@/components/pages/TenantCommandCenterPage';
import TenantUsersPage from '@/components/pages/TenantUsersPage';
import TenantModulesPage from '@/components/pages/TenantModulesPage';
import TenantSettingsPage from '@/components/pages/TenantSettingsPage';
import TenantBillingPage from '@/components/pages/TenantBillingPage';
import SharedServicesAdminPage from '@/components/pages/SharedServicesAdminPage';
import OperatorLoader from '@/components/brand/OperatorLoader';
import { isSuperAdmin, isTenantAdmin } from '@/lib/rbac';

const LINKABLE_CONSOLE_PAGES = new Set([
  'my-apps',
  'apps',
  'billing',
  'settings',
  'command-center',
  'tenant-users',
  'tenant-modules',
  'tenant-billing',
  'tenant-settings',
  'tenant-shared-services',
]);

function initialConsolePage(): string {
  if (typeof window === 'undefined') return 'my-apps';
  const requested = new URLSearchParams(window.location.search).get('page');
  return requested && LINKABLE_CONSOLE_PAGES.has(requested) ? requested : 'my-apps';
}

/**
 * Console route — /app
 *
 * Marketing redesign Phase 1 split this surface off `/` so the public
 * landing pages (/, /modules, /pricing, /how-it-works) can live on
 * their own polished shell. All existing in-app logic is preserved
 * exactly as-is: the same providers, the same SaasLayout sidebar, the
 * same role-aware default landings, and the same auth flow (signed-out
 * visitors see LoginPage/RegisterPage inline; on success they stay
 * here and land in the workspace).
 *
 * The plain "Loading OperatorOS…" splash is replaced with the branded
 * OperatorLoader so the first paint matches the new identity.
 *
 * Logout still flows through AuthProvider; SaasLayout's menu-logout
 * now hard-navigates back to `/` (the marketing site) after the call.
 */
function AppContent() {
  const { user, loading, authError, logout, clearAuthError } = useAuth();
  const { activeRole: tenantRole } = useTenant();
  const [authPage, setAuthPage] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>('login');
  const [activePage, setActivePage] = useState<string>(initialConsolePage);

  useEffect(() => {
    if (!user) {
      setActivePage('my-apps');
      setAuthPage('login');
    }
  }, [user?.id]);

  useEffect(() => {
    const restoreRoute = () => setActivePage(initialConsolePage());
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem('operatoros.pendingInviteToken'); } catch {}
    if (pending) {
      // Canonical invite URL post-split lives under /app/*.
      window.location.replace(`/app/invites/${encodeURIComponent(pending)}`);
    }
  }, [loading, user]);

  if (loading) {
    return <OperatorLoader />;
  }

  if (authError?.code === 'ACCOUNT_SUSPENDED') {
    return <SuspendedPage onLogout={async () => { clearAuthError(); await logout(); }} message={authError.message} />;
  }

  if (!user) {
    const handleSwitch = (page: string) => setAuthPage(page as any);
    if (authPage === 'register') return <RegisterPage onSwitch={handleSwitch} />;
    if (authPage === 'forgot-password') return <ForgotPasswordPage onSwitch={handleSwitch} />;
    if (authPage === 'reset-password') return <ResetPasswordPage onSwitch={handleSwitch} />;
    return <LoginPage onSwitch={handleSwitch} />;
  }

  const userIsSuperAdmin = isSuperAdmin((user as any)?.platformRole);
  const userIsTenantAdmin = isTenantAdmin(tenantRole, (user as any)?.platformRole);

  const handleNavigate = (page: string) => {
    if (page === 'platform' && userIsSuperAdmin) {
      // Canonical Platform URL post-split lives under /app/*.
      window.location.href = '/app/platform';
      return;
    }
    if (LINKABLE_CONSOLE_PAGES.has(page)) {
      const url = new URL(window.location.href);
      if (page === 'my-apps') url.searchParams.delete('page');
      else url.searchParams.set('page', page);
      const nextRoute = `${url.pathname}${url.search}${url.hash}`;
      const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextRoute !== currentRoute) window.history.pushState(null, '', nextRoute);
    }
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'my-apps': return <MyAppsPage onNavigate={handleNavigate} />;
      case 'apps': return <AppsPage onNavigate={handleNavigate} />;
      case 'ai-tools': return <AiToolsPage />;
      case 'billing': return <BillingPage />;
      case 'settings': return <SettingsPage />;
      case 'command-center':
        return userIsTenantAdmin
          ? <TenantCommandCenterPage onNavigate={handleNavigate} />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can access the Command Center." />;
      case 'tenant-users':
        return userIsTenantAdmin
          ? <TenantUsersPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can manage members." />;
      case 'tenant-modules':
        return userIsTenantAdmin
          ? <TenantModulesPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can view organization tools." />;
      case 'tenant-billing':
        return userIsTenantAdmin
          ? <TenantBillingPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can view organization billing." />;
      case 'tenant-settings':
        return userIsTenantAdmin
          ? <TenantSettingsPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can edit organization settings." />;
      case 'tenant-shared-services':
        return userIsTenantAdmin
          ? <SharedServicesAdminPage onNavigate={handleNavigate} />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only organization owners or admins can manage shared services." />;
      case 'platform':
        return userIsSuperAdmin
          ? <PlatformPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only platform super-administrators can access this page." />;
      default: return <MyAppsPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <SaasLayout activePage={activePage} onNavigate={handleNavigate} tenantRole={tenantRole}>
      {renderPage()}
    </SaasLayout>
  );
}

export default function ConsolePage() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
