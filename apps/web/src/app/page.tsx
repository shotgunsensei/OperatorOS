'use client';

import { useEffect, useState } from 'react';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
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
import { meApi } from '@/lib/auth';

function AppContent() {
  const { user, loading, authError, logout, clearAuthError } = useAuth();
  const [authPage, setAuthPage] = useState<'login' | 'register' | 'forgot-password' | 'reset-password'>('login');
  // Default landing is set per-role once we know the user (effect below).
  // 'my-apps' is the safe fallback for any non-admin user.
  const [activePage, setActivePage] = useState<string>('my-apps');
  const [tenantRole, setTenantRole] = useState<'owner' | 'admin' | 'member' | null>(null);

  // Discover the caller's tenant role for the active tenant. We use this to
  // (a) decide the default landing page and (b) reveal Tenant Admin entries
  // in the sidebar. We only run once per login.
  useEffect(() => {
    if (!user) { setTenantRole(null); return; }
    let alive = true;
    (async () => {
      try {
        const me = await meApi.tenants();
        const current = me.current ?? me.tenants?.[0]?.id ?? null;
        const t = me.tenants?.find((x: any) => x.id === current) ?? null;
        if (!alive) return;
        const role = (t?.role ?? null) as any;
        setTenantRole(role);
        // Set the *initial* landing only — user nav after login is preserved.
        if (activePage === 'my-apps') {
          if ((user as any).platformRole === 'super_admin') {
            // Super admins land on the dedicated /platform surface.
            setActivePage('platform');
          } else if (role === 'owner' || role === 'admin') {
            setActivePage('command-center');
          }
        }
      } catch {
        // Ignore — leave defaults in place.
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // If the user landed on /invites/:token before signing in, the invite page
  // parks the token in localStorage and bounces them here. Once they finish
  // login/register, send them right back so the invite gets accepted.
  useEffect(() => {
    if (loading || !user) return;
    let pending: string | null = null;
    try { pending = localStorage.getItem('operatoros.pendingInviteToken'); } catch {}
    if (pending) {
      window.location.replace(`/invites/${encodeURIComponent(pending)}`);
    }
  }, [loading, user]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#010409', color: '#8b949e',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
          }}>O</div>
          <div style={{ fontSize: 14 }}>Loading OperatorOS...</div>
        </div>
      </div>
    );
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

  const isSuperAdmin = (user as any)?.platformRole === 'super_admin';
  const isTenantAdmin = tenantRole === 'owner' || tenantRole === 'admin' || isSuperAdmin;

  const handleNavigate = (page: string) => {
    // Super admins clicking the Platform Command entry are routed to the
    // standalone /platform page so the URL reflects where they are.
    if (page === 'platform' && isSuperAdmin) {
      window.location.href = '/platform';
      return;
    }
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'my-apps': return <MyAppsPage onNavigate={setActivePage} />;
      case 'apps': return <AppsPage onNavigate={setActivePage} />;
      case 'ai-tools': return <AiToolsPage />;
      case 'billing': return <BillingPage />;
      case 'settings': return <SettingsPage />;
      case 'command-center':
        return isTenantAdmin
          ? <TenantCommandCenterPage onNavigate={setActivePage} />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can access the Command Center." />;
      case 'tenant-users':
        return isTenantAdmin
          ? <TenantUsersPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can manage members." />;
      case 'tenant-modules':
        return isTenantAdmin
          ? <TenantModulesPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can view tenant modules." />;
      case 'tenant-billing':
        return isTenantAdmin
          ? <TenantBillingPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can view tenant billing." />;
      case 'tenant-settings':
        return isTenantAdmin
          ? <TenantSettingsPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can edit tenant settings." />;
      case 'platform':
        return isSuperAdmin
          ? <PlatformPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only platform super-administrators can access this page." />;
      default: return <MyAppsPage onNavigate={setActivePage} />;
    }
  };

  return (
    <SaasLayout activePage={activePage} onNavigate={handleNavigate} tenantRole={tenantRole}>
      {renderPage()}
    </SaasLayout>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
