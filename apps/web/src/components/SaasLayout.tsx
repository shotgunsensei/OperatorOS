'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import OperatorOSAccountMenu from './OperatorOSAccountMenu';
import chrome from './OperatorOSChrome.module.css';
import { Menu, X, ChevronLeft, Grid2X2, LifeBuoy } from 'lucide-react';
import { useAuth } from './AuthProvider';
import TenantMessenger from './TenantMessenger';
import TenantSwitcher from './TenantSwitcher';
import { buildNavSections } from '@/lib/sidebar-nav';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../packages/modules/navigation.js';
import { isSuperAdmin, isTenantAdmin } from '@/lib/rbac';
import OperatorLogo from './brand/OperatorLogo';
import OperatorMark from './brand/OperatorMark';

// Centralized palette. Re-exported below + via lib/design-tokens.ts so all
// downstream pages share the same source of truth.
const colors = {
  bg: '#0b0f14',
  bgSecondary: '#121820',
  bgHover: '#202b38',
  border: '#2b3746',
  text: '#f1f5f9',
  textMuted: '#aeb9c7',
  textDim: '#8492a6',
  accent: '#2f6feb',
  accentGreen: '#4bc26b',
  accentRed: '#ff6b63',
  accentYellow: '#e0a82e',
  accentPurple: '#a99bf5',
};

const pageLabels: Record<string, { section: string; label: string }> = {
  'my-apps': { section: 'Workspace', label: 'Home' },
  apps: { section: 'Workspace', label: 'Browse tools' },
  'ai-tools': { section: 'Workspace', label: 'AI tools' },
  'command-center': { section: 'Organization', label: 'Overview' },
  'tenant-users': { section: 'Organization', label: 'Team members' },
  'tenant-modules': { section: 'Organization', label: 'Tool access' },
  'tenant-billing': { section: 'Organization', label: 'Billing and add-ons' },
  'tenant-settings': { section: 'Organization', label: 'Organization settings' },
  'tenant-shared-services': { section: 'Organization', label: 'Shared services' },
  billing: { section: 'Account', label: 'Workspace plan' },
  settings: { section: 'Account', label: 'Profile and security' },
  platform: { section: 'Platform', label: 'Platform administration' },
};

interface SaasLayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  // Optional override — set when the active tenant role is known to the
  // shell (e.g. from a /me/tenants response). Falls back to false when
  // unavailable, hiding tenant-admin entries (safer default).
  tenantRole?: 'owner' | 'admin' | 'member' | 'viewer' | null;
}

export default function SaasLayout({ activePage, onNavigate, children, tenantRole }: SaasLayoutProps) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [navigationSearch, setNavigationSearch] = useState('');
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleNavigate = (page: string) => {
    onNavigate(page);
    if (isMobile) setMobileOpen(false);
  };

  const userIsSuperAdmin = isSuperAdmin((user as any)?.platformRole);
  const userIsTenantAdmin = isTenantAdmin(tenantRole, (user as any)?.platformRole);
  const sections = buildNavSections({ isSuperAdmin: userIsSuperAdmin, isTenantAdmin: userIsTenantAdmin }).map(section => ({ ...section, items: section.items.filter(item => item.label.toLowerCase().includes(navigationSearch.trim().toLowerCase())) })).filter(section => section.items.length);
  const currentPage = pageLabels[activePage] ?? { section: 'Workspace', label: 'OperatorOS' };

  const sidebarWidth = isMobile ? 260 : (collapsed ? 64 : 240);

  const sidebar = (
    <nav
      data-testid="sidebar-nav"
      aria-label="OperatorOS navigation"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: colors.bgSecondary,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',

        overflow: 'hidden',
        ...(isMobile ? {
          position: 'fixed' as const, top: 0, left: 0, bottom: 0, zIndex: 1001,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          visibility: mobileOpen ? 'visible' as const : 'hidden' as const,

        } : {}),
      }}
    >
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: (isMobile || !collapsed) ? '0 20px' : '0 16px',
          borderBottom: `1px solid ${colors.border}`,
          gap: 12,
        }}
        data-testid="sidebar-logo"
      >
        {(isMobile || !collapsed) ? (
          <OperatorLogo
            size={34}
            wordmarkSize={14}
            tagline="Business operations workspace"
            style={{ flex: 1, minWidth: 0 }}
          />
        ) : (
          <OperatorMark size={32} glow />
        )}
        {isMobile && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={(e) => { e.stopPropagation(); setMobileOpen(false); }}
            data-testid="button-close-sidebar"
            style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        )}
        {!isMobile && (
          <button
            type="button"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={() => setCollapsed(!collapsed)}
            style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', border: 'none', borderRadius: 7, background: 'transparent', color: colors.textDim, cursor: 'pointer' }}
          >
            <ChevronLeft
              size={16}
              style={{
                transform: collapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>
        )}
      </div>

      {isMobile && <Dialog.Title className="ops-visually-hidden">OperatorOS navigation</Dialog.Title>}
      {(isMobile || !collapsed) && <div style={{ padding: 12 }}><input className={chrome.navSearch} aria-label="Find a workspace page" placeholder="Find a page" value={navigationSearch} onChange={event => setNavigationSearch(event.target.value)} /></div>}
      <div style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {sections.length === 0 && <p style={{ padding: 12, color: colors.textMuted }}>No matching pages.</p>}
        {sections.map((section, sIdx) => (
          <div
            key={section.label}
            style={{ marginTop: sIdx === 0 ? 0 : 8 }}
            data-testid={`sidebar-section-${section.label.toLowerCase()}`}
          >
            {(isMobile || !collapsed) && (
              <div style={{
                padding: '6px 12px 4px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                color: colors.textDim,
                userSelect: 'none' as const,
              }}>{section.label}</div>
            )}
            {collapsed && !isMobile && sIdx > 0 && (
              <div style={{
                height: 1, background: colors.border, margin: '4px 12px 6px',
              }} />
            )}
            {section.items.map(item => {
              const isActive = activePage === item.id;
              const Icon = item.Icon;
              const itemStyle = {
                width: '100%',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: (!isMobile && collapsed) ? '10px 14px' : '10px 12px',
                margin: '1px 0',
                border: 'none',
                 borderRadius: 8,
                background: isActive ? colors.bgHover : 'transparent',
                color: isActive ? colors.accent : colors.text,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                textAlign: 'left' as const,
                transition: 'background 0.15s',
                textDecoration: 'none',
                boxSizing: 'border-box' as const,
              };
              const hoverOn = (e: React.MouseEvent) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = colors.bgHover; };
              const hoverOff = (e: React.MouseEvent) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; };

              // External links (e.g. Contact) navigate away instead of switching
              // the in-app page, so they render as an anchor rather than a button.
              if (item.href) {
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    data-testid={`nav-${item.id}`}
                    onClick={() => { if (isMobile) setMobileOpen(false); }}
                    style={itemStyle}
                    onMouseEnter={hoverOn}
                    onMouseLeave={hoverOff}
                    title={collapsed && !isMobile ? item.label : undefined}
                  >
                    <Icon size={16} style={{ flexShrink: 0 }} />
                    {(isMobile || !collapsed) && <span>{item.label}</span>}
                  </a>
                );
              }

              return (
                <button
                  type="button"
                  key={item.id}
                  data-testid={`nav-${item.id}`}
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  style={itemStyle}
                  onMouseEnter={hoverOn}
                  onMouseLeave={hoverOff}
                  title={collapsed && !isMobile ? item.label : undefined}
                >
                  <Icon size={16} style={{ flexShrink: 0 }} />
                  {(isMobile || !collapsed) && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${colors.border}` }}>
        <OperatorOSAccountMenu triggerTestId="user-menu-button" compact={collapsed && !isMobile} label={user?.name || 'Account'} items={[
          { label: 'Profile and security', onSelect: () => handleNavigate('settings'), testId: 'menu-settings' },
          { label: 'Workspace plan', onSelect: () => handleNavigate('billing') },
          { label: 'Sign out', testId: 'menu-logout', onSelect: () => { void logout().then(() => { window.location.href = '/'; }).catch(() => setLogoutError('Sign out could not be confirmed. Please try again.')); } },
        ]} />
        {logoutError && <p role="alert" style={{ color: colors.accentRed, fontSize: 13 }}>{logoutError}</p>}
      </div>
    </nav>
  );

  return (
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
    <div className={chrome.workspace} style={{ display: 'flex', minHeight: '100dvh', height: '100dvh', background: colors.bg, color: colors.text }}>
      <a className="ops-skip-link" href="#workspace-main">Skip to main content</a>
      {isMobile ? <Dialog.Portal><Dialog.Overlay className={chrome.overlay} /><Dialog.Content asChild aria-describedby={undefined}>{sidebar}</Dialog.Content></Dialog.Portal> : sidebar}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          data-testid="topbar"
          style={{
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            gap: isMobile ? 8 : 12,
            padding: isMobile ? '8px 12px' : '0 16px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSecondary,
            flexShrink: 0,
          }}
        >
          {isMobile && (
            <>
              <Dialog.Trigger asChild><button
                type="button"
                aria-label="Open navigation"
                data-testid="button-open-sidebar"
                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', background: 'none', border: 'none', color: colors.text, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              ><Menu size={20} /></button></Dialog.Trigger>
              <span aria-live="polite" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 600, color: '#fff' }}>{currentPage.label}</span>
            </>
          )}
          {!isMobile && (
            <div style={{ minWidth: 0 }} aria-live="polite">
              <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 700 }}>{currentPage.section}</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 750 }}>{currentPage.label}</div>
            </div>
          )}
          {!isMobile && <div style={{ flex: 1 }} />}
          <TenantMessenger />
          <button
            type="button"
            onClick={() => handleNavigate('my-apps')}
              aria-label="Switch OperatorOS tool"
            title="Switch module"
            style={{ minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : 38, padding: '7px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 650 }}
          >
            <Grid2X2 size={15} aria-hidden="true" />
            {!isMobile && 'Switch module'}
          </button>
          <a
            href={DEFAULT_OPERATOROS_NAVIGATION_URLS.supportUrl}
            aria-label="Open help and support"
            title="Help and support"
            style={{ minWidth: isMobile ? 44 : 38, minHeight: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${colors.border}`, color: colors.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <LifeBuoy size={16} aria-hidden="true" />
          </a>
          <div style={isMobile ? { flexBasis: '100%', minWidth: 0 } : { minWidth: 0 }}><TenantSwitcher /></div>
        </div>

        <main id="workspace-main" tabIndex={-1} style={{ flex: 1, overflow: 'auto', background: colors.bg }}>
          {children}
        </main>
      </div>
    </div>
    </Dialog.Root>
  );
}

export { colors };
