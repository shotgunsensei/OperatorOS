'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';

const colors = {
  bg: '#010409',
  bgSecondary: '#0d1117',
  bgHover: '#161b22',
  border: '#21262d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  textDim: '#484f58',
  accent: '#58a6ff',
  accentGreen: '#3fb950',
  accentRed: '#f85149',
  accentYellow: '#d29922',
  accentPurple: '#bc8cff',
};

interface NavItem {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Work',
    items: [
      { id: 'workspace', label: 'Workspaces', icon: '⬡' },
      { id: 'projects', label: 'Projects', icon: '◧' },
      { id: 'tasks', label: 'Tasks', icon: '☑' },
      { id: 'notes', label: 'Notes', icon: '◪' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '◫' },
      { id: 'activity', label: 'Activity', icon: '◉' },
      { id: 'ai-tools', label: 'AI Assistant', icon: '✦' },
    ],
  },
  {
    label: 'Shotgun OS',
    items: [
      { id: 'apps', label: 'Apps', icon: '▦' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'billing', label: 'Billing', icon: '◈' },
      { id: 'settings', label: 'Settings', icon: '⚙' },
      { id: 'admin', label: 'Admin', icon: '⛊', adminOnly: true },
    ],
  },
];

interface SaasLayoutProps {
  activePage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

export default function SaasLayout({ activePage, onNavigate, children }: SaasLayoutProps) {
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

  const filteredSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(item => !item.adminOnly || user?.role === 'admin'),
  })).filter(section => section.items.length > 0);

  const sidebarWidth = isMobile ? 260 : (collapsed ? 64 : 240);

  const sidebar = (
    <nav
      data-testid="sidebar-nav"
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
          transition: 'transform 0.25s ease',
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
          cursor: isMobile ? 'default' : 'pointer',
          gap: 12,
        }}
        onClick={() => { if (!isMobile) setCollapsed(!collapsed); }}
        data-testid="sidebar-logo"
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>O</div>
        {(isMobile || !collapsed) && (
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>OperatorOS</div>
            <div style={{ fontSize: 10, color: colors.textDim }}>Powered by Shotgun Ninjas</div>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} data-testid="button-close-sidebar"
            style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 20, cursor: 'pointer', padding: 4 }}>
            ✕
          </button>
        )}
      </div>

      <div style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {filteredSections.map((section, sIdx) => (
          <div key={section.label} style={{ marginTop: sIdx === 0 ? 0 : 8 }}>
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
              return (
                <button
                  key={item.id}
                  data-testid={`nav-${item.id}`}
                  onClick={() => handleNavigate(item.id)}
                  style={{
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
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.target as HTMLElement).style.background = colors.bgHover; }}
                  onMouseLeave={e => { if (!isActive) (e.target as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, width: 20, textAlign: 'center' }}>{item.icon}</span>
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
          }}>
            <button
              data-testid="menu-settings"
              onClick={() => { handleNavigate('settings'); setShowUserMenu(false); }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6,
                background: 'transparent', color: colors.text, cursor: 'pointer', textAlign: 'left', fontSize: 13,
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = colors.bgHover}
              onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
            >Settings</button>
            <button
              data-testid="menu-logout"
              onClick={async () => { await logout(); setShowUserMenu(false); }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', borderRadius: 6,
                background: 'transparent', color: colors.accentRed, cursor: 'pointer', textAlign: 'left', fontSize: 13,
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.background = colors.bgHover}
              onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
            >Sign out</button>
          </div>
        )}
        <button
          data-testid="user-menu-button"
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', border: 'none', borderRadius: 8,
            background: 'transparent', color: colors.text, cursor: 'pointer',
          }}
          onMouseEnter={e => (e.target as HTMLElement).style.background = colors.bgHover}
          onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
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
    <div style={{ display: 'flex', height: '100vh', background: colors.bg, color: colors.text }}>
      {isMobile && mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {sidebar}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isMobile && (
          <div style={{
            height: 48, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 16px', borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSecondary, flexShrink: 0,
          }}>
            <button
              data-testid="button-open-sidebar"
              onClick={() => setMobileOpen(true)}
              style={{ background: 'none', border: 'none', color: colors.text, fontSize: 20, cursor: 'pointer', padding: 4 }}
            >☰</button>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fff',
            }}>O</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>OperatorOS</span>
          </div>
        )}

        <main style={{ flex: 1, overflow: 'auto', background: colors.bg }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { colors };
