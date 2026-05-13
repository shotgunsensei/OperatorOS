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
import { isSuperAdmin, isTenantAdmin } from '@/lib/rbac';

function LandingPage({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  const arsenalProducts = [
    {
      name: 'OperatorOS',
      image: '/favicon.svg',
      useCase: 'Serves as the central operating layer so visitors can unify their apps, teams, billing, and execution in one place.',
    },
    {
      name: 'StudyForge',
      image: '/icons/icon-192x192.svg',
      useCase: 'Helps knowledge-based teams turn learning systems into repeatable workflows that improve onboarding speed and consistency.',
    },
    {
      name: 'CallCommand',
      image: '/icons/icon-144x144.svg',
      useCase: 'Supports customer-facing and sales-heavy businesses with structured call operations that reduce dropped follow-up and increase close rates.',
    },
    {
      name: 'NinjaLaunchKit',
      image: '/icons/icon-96x96.svg',
      useCase: 'Gives founders and operators launch-ready checklists, assets, and workflows to speed up go-to-market execution.',
    },
    {
      name: 'Ninjamation',
      image: '/icons/icon-72x72.svg',
      useCase: 'Enables teams to produce motion-ready creative assets that improve engagement for ads, social, and product storytelling.',
    },
  ] as const;

  const cardStyle = {
    background: 'rgba(22, 27, 34, 0.75)',
    border: '1px solid rgba(139, 148, 158, 0.25)',
    borderRadius: 16,
    padding: 20,
  } as const;

  return (
    <div style={{ minHeight: '100vh', background: '#010409', color: '#f0f6fc' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 20px 56px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/favicon.svg" alt="OperatorOS logo" style={{ width: 44, height: 44, borderRadius: 12, background: '#0d1117', border: '1px solid #30363d', padding: 6 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>OperatorOS</div>
              <div style={{ fontSize: 12, color: '#8b949e' }}>Run your operations, apps, and growth from one system.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onSignIn} style={{ background: 'transparent', color: '#f0f6fc', border: '1px solid #30363d', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: 600 }}>Sign in</button>
            <button onClick={onGetStarted} style={{ background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontWeight: 700 }}>Sign up</button>
          </div>
        </header>

        <section style={{ marginTop: 44, ...cardStyle, padding: 28 }}>
          <p style={{ margin: 0, color: '#79c0ff', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', fontSize: 12 }}>Business Operating System</p>
          <h1 style={{ margin: '10px 0 12px', fontSize: 'clamp(28px, 4.5vw, 48px)', lineHeight: 1.1 }}>OperatorOS is the home base for people and teams running modern businesses.</h1>
          <p style={{ margin: '0 0 20px', color: '#c9d1d9', maxWidth: 760, lineHeight: 1.5 }}>
            Instead of juggling disconnected tools, you get one connected ecosystem for daily execution: launch apps,
            team coordination, AI-assisted workflows, billing visibility, and tenant-level administration.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} style={{ background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>Create your account</button>
            <button onClick={onSignIn} style={{ background: '#161b22', color: '#f0f6fc', border: '1px solid #30363d', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>I already have an account</button>
          </div>
        </section>

        <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <article style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>What is OperatorOS?</h2>
            <p style={{ margin: 0, color: '#c9d1d9', lineHeight: 1.5 }}>A unified operating layer for businesses and operators to organize apps, users, permissions, and execution in one place.</p>
          </article>
          <article style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>What applications does it house?</h2>
            <p style={{ margin: 0, color: '#c9d1d9', lineHeight: 1.5 }}>Workspace apps, AI tools, team management, tenant modules, billing controls, and platform-level administration tools.</p>
          </article>
          <article style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>What do those applications do?</h2>
            <p style={{ margin: 0, color: '#c9d1d9', lineHeight: 1.5 }}>They help you launch initiatives faster, keep your team aligned, manage access securely, and automate repetitive work with AI assistance.</p>
          </article>
          <article style={cardStyle}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>How does the ecosystem help daily?</h2>
            <p style={{ margin: 0, color: '#c9d1d9', lineHeight: 1.5 }}>Everyone works from the same source of truth, reducing tool sprawl, miscommunication, and manual handoffs across day-to-day operations.</p>
          </article>
        </section>

        <section style={{ marginTop: 24, ...cardStyle }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 22 }}>ShotgunNinjas Arsenal</h2>
          <p style={{ margin: '0 0 16px', color: '#c9d1d9', lineHeight: 1.5 }}>
            Each product in the arsenal is positioned to create measurable value for the person or business visiting this page.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {arsenalProducts.map((product) => (
              <article key={product.name} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 14, padding: 14 }}>
                <img src={product.image} alt={`${product.name} product`} style={{ width: '100%', height: 140, objectFit: 'contain', borderRadius: 10, background: '#161b22', border: '1px solid #30363d', padding: 10 }} />
                <h3 style={{ margin: '12px 0 8px', fontSize: 18 }}>{product.name}</h3>
                <p style={{ margin: 0, color: '#c9d1d9', lineHeight: 1.45, fontSize: 14 }}>{product.useCase}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, authError, logout, clearAuthError } = useAuth();
  const { activeRole: tenantRole } = useTenant();
  const [authPage, setAuthPage] = useState<'landing' | 'login' | 'register' | 'forgot-password' | 'reset-password'>('landing');
  const [activePage, setActivePage] = useState<string>('my-apps');
  const [didInitialLand, setDidInitialLand] = useState(false);

  useEffect(() => {
    if (!user) {
      setDidInitialLand(false);
      setActivePage('my-apps');
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user || didInitialLand) return;
    if (activePage !== 'my-apps') { setDidInitialLand(true); return; }
    if (isSuperAdmin((user as any).platformRole)) {
      setActivePage('platform');
      setDidInitialLand(true);
    } else if (isTenantAdmin(tenantRole, (user as any).platformRole)) {
      setActivePage('command-center');
      setDidInitialLand(true);
    } else if (tenantRole === 'member') {
      setDidInitialLand(true);
    }
  }, [user?.id, tenantRole]);

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
    if (authPage === 'landing') return <LandingPage onGetStarted={() => setAuthPage('register')} onSignIn={() => setAuthPage('login')} />;
    if (authPage === 'register') return <RegisterPage onSwitch={handleSwitch} />;
    if (authPage === 'forgot-password') return <ForgotPasswordPage onSwitch={handleSwitch} />;
    if (authPage === 'reset-password') return <ResetPasswordPage onSwitch={handleSwitch} />;
    return <LoginPage onSwitch={handleSwitch} />;
  }

  const userIsSuperAdmin = isSuperAdmin((user as any)?.platformRole);
  const userIsTenantAdmin = isTenantAdmin(tenantRole, (user as any)?.platformRole);

  const handleNavigate = (page: string) => {
    if (page === 'platform' && userIsSuperAdmin) {
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
        return userIsTenantAdmin
          ? <TenantCommandCenterPage onNavigate={setActivePage} />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can access the Command Center." />;
      case 'tenant-users':
        return userIsTenantAdmin
          ? <TenantUsersPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can manage members." />;
      case 'tenant-modules':
        return userIsTenantAdmin
          ? <TenantModulesPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can view tenant modules." />;
      case 'tenant-billing':
        return userIsTenantAdmin
          ? <TenantBillingPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can view tenant billing." />;
      case 'tenant-settings':
        return userIsTenantAdmin
          ? <TenantSettingsPage />
          : <UnauthorizedPage onGoBack={() => handleNavigate('my-apps')} message="Only tenant owners or admins can edit tenant settings." />;
      case 'platform':
        return userIsSuperAdmin
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
      <TenantProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
