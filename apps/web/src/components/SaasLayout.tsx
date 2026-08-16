'use client';

import React, { useState, useEffect } from 'react';
import { Menu, X, ChevronLeft, Grid2X2, LifeBuoy } from 'lucide-react';
import { useAuth } from './AuthProvider';
import TenantMessenger from './TenantMessenger';
import TenantSwitcher from './TenantSwitcher';
import { buildNavSections } from '@/lib/sidebar-nav';
import { isSuperAdmin, isTenantAdmin } from '@/lib/rbac';
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
  const [showUserMenu, setShowUserMenu] = useState(false);
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
  const sections = buildNavSections({ isSuperAdmin: userIsSuperAdmin, isTenantAdmin: userIsTenantAdmin });
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
        transition: isMobile ? 'none' : 'width 0.2s, min-width 0.2s',
        overflow: 'hidden',
        ...(isMobile ? {
          position: 'fixed' as const, top: 0, left: 0, bottom: 0, zIndex: 1001,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          visibility: mobileOpen ? 'visible' as const : 'hidden' as const,
          transition: 'transform 0.25s ease, visibility 0.25s ease',
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
        <OperatorMark size={32} glow />
        {(isMobile || !collapsed) && (
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>OperatorOS</div>
            <div style={{ fontSize: 11, color: colors.textMuted }}>Business operations workspace</div>
          </div>
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

      <div style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
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

      <div style={{ padding: '12px 8px', borderTop: `1px solid ${colors.border}`, position: 'relative' }}>
        {showUserMenu && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 8, right: 8,
            background: colors.bgSecondary, border: `1px solid ${colors.border}`,
             borderRadius: 8, padding: 4, marginBottom: 4, zIndex: 100,
          }} role="menu" aria-label="Account actions">
            <button
              role="menuitem"
              data-testid="menu-settings"
              onClick={() => { handleNavigate('settings'); setShowUserMenu(false); }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6,
                background: 'transparent', color: colors.text, cursor: 'pointer', textAlign: 'left', fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = colors.bgHover}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >Settings</button>
            <button
              role="menuitem"
              data-testid="menu-logout"
              onClick={async () => {
                await logout();
                setShowUserMenu(false);
                // Marketing redesign: signing out from the console drops the
                // user on the new public marketing surface at `/` rather than
                // re-rendering an embedded login screen in place.
                if (typeof window !== 'undefined') window.location.href = '/';
              }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6,
                background: 'transparent', color: colors.accentRed, cursor: 'pointer', textAlign: 'left', fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = colors.bgHover}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >Sign out</button>
          </div>
        )}
        <button
          type="button"
          data-testid="user-menu-button"
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-expanded={showUserMenu}
          aria-haspopup="menu"
          aria-label={`Account menu for ${user?.name || user?.email || 'current user'}`}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', border: 'none', borderRadius: 8,
            background: 'transparent', color: colors.text, cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = colors.bgHover}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: colors.accent, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#fff', flexShrink: 0,
          }}>
            {user?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          {(isMobile || !collapsed) && (
            <div style={{ overflow: 'hidden', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
            </div>
          )}
        </button>
      </div>
    </nav>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', height: '100dvh', background: colors.bg, color: colors.text }}>
      <a className="ops-skip-link" href="#workspace-main">Skip to main content</a>
      {isMobile && mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          style={{ position: 'fixed', inset: 0, padding: 0, border: 'none', background: 'rgba(0,0,0,0.66)', zIndex: 1000, cursor: 'pointer' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {sidebar}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          data-testid="topbar"
          style={{
            height: isMobile ? 48 : 52,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 16px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSecondary,
            flexShrink: 0,
          }}
        >
          {isMobile && (
            <>
              <button
                type="button"
                aria-label="Open navigation"
                data-testid="button-open-sidebar"
                onClick={() => setMobileOpen(true)}
                style={{ background: 'none', border: 'none', color: colors.text, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              ><Menu size={20} /></button>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, color: '#fff',
              }}>O</div>
               <span aria-live="polite" style={{ minWidth: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 600, color: '#fff' }}>{currentPage.label}</span>
            </>
          )}
          {!isMobile && (
            <div style={{ minWidth: 0 }} aria-live="polite">
              <div style={{ color: colors.textDim, fontSize: 11, fontWeight: 700 }}>{currentPage.section}</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 750 }}>{currentPage.label}</div>
            </div>
          )}
          <div style={{ flex: 1 }} />
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
            href="https://operatoros.net/john"
            aria-label="Open help and support"
            title="Help and support"
            style={{ minWidth: isMobile ? 44 : 38, minHeight: isMobile ? 44 : 38, borderRadius: 8, border: `1px solid ${colors.border}`, color: colors.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <LifeBuoy size={16} aria-hidden="true" />
          </a>
          <TenantSwitcher />
        </div>

        <main id="workspace-main" tabIndex={-1} style={{ flex: 1, overflow: 'auto', background: colors.bg }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { colors };
