'use client';

import { useState } from 'react';
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

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'projects', label: 'Projects', icon: '◧' },
  { id: 'tasks', label: 'Tasks', icon: '☑' },
  { id: 'notes', label: 'Notes', icon: '◪' },
  { id: 'activity', label: 'Activity', icon: '◉' },
  { id: 'ai-tools', label: 'AI Tools', icon: '✦' },
  { id: 'workspace', label: 'Workspaces', icon: '⬡' },
  { id: 'billing', label: 'Billing', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'admin', label: 'Admin', icon: '⛊', adminOnly: true },
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

  const filteredNavItems = navItems.filter(item => !item.adminOnly || user?.role === 'admin');

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.bg, color: colors.text }}>
      <nav
        data-testid="sidebar-nav"
        style={{
          width: collapsed ? 64 : 240,
          minWidth: collapsed ? 64 : 240,
          background: colors.bgSecondary,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: collapsed ? '0 16px' : '0 20px',
            borderBottom: `1px solid ${colors.border}`,
            cursor: 'pointer',
            gap: 12,
          }}
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-logo"
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
          }}>O</div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>OperatorOS</div>
              <div style={{ fontSize: 10, color: colors.textDim }}>Powered by Shotgun Ninjas</div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {filteredNavItems.map(item => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                data-testid={`nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: collapsed ? '10px 14px' : '10px 12px',
                  margin: '2px 0',
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
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
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
                onClick={() => { onNavigate('settings'); setShowUserMenu(false); }}
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
            {!collapsed && (
              <div style={{ overflow: 'hidden', textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
              </div>
            )}
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, overflow: 'auto', background: colors.bg }}>
        {children}
      </main>
    </div>
  );
}

export { colors };
