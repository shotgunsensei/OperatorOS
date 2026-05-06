'use client';

import React, { useEffect, useState } from 'react';
import { Building2, Users as UsersIcon, Boxes, Activity } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { tenantApi, meApi } from '@/lib/auth';

interface Props {
  onNavigate: (page: string) => void;
}

export default function TenantCommandCenterPage({ onNavigate }: Props) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [memberCount, setMemberCount] = useState<number>(0);
  const [moduleCount, setModuleCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await meApi.tenants();
        const current = me.current ?? me.tenants?.[0]?.id;
        if (!current) { if (alive) setLoading(false); return; }
        const t = me.tenants.find((x: any) => x.id === current);
        if (alive && t) {
          setTenantId(t.id);
          setTenantName(t.name);
        }
        // Load counts in parallel — if either fails, render zeros.
        const [users, mods] = await Promise.all([
          tenantApi.listUsers(current).catch(() => ({ users: [] })),
          tenantApi.listModules(current).catch(() => ({ modules: [] })),
        ]);
        if (alive) {
          setMemberCount(users.users?.length ?? 0);
          setModuleCount(
            (mods.modules ?? []).filter((m: any) => m.status !== 'archived' && m.status !== 'disabled').length,
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const card = (label: string, value: React.ReactNode, Icon: any, action?: { page: string; label: string }) => (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}
      style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={18} color={colors.accent} />
        <div style={{ fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value}</div>
      {action && (
        <button
          data-testid={`button-go-${action.page}`}
          onClick={() => onNavigate(action.page)}
          style={{
            alignSelf: 'flex-start', padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${colors.border}`, background: 'transparent',
            color: colors.accent, fontSize: 12, cursor: 'pointer',
          }}
        >{action.label} →</button>
      )}
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }} data-testid="page-command-center">
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Building2 size={28} color={colors.accent} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>{tenantName || 'Tenant Command Center'}</h1>
          <p style={{ color: colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Operational overview for the active tenant.
          </p>
        </div>
      </header>

      {loading ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="cc-loading">Loading…</div>
      ) : !tenantId ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="cc-no-tenant">
          No active tenant. Switch tenant from the user menu.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
          {card('Members', memberCount, UsersIcon, { page: 'tenant-users', label: 'Manage members' })}
          {card('Active modules', moduleCount, Boxes, { page: 'tenant-modules', label: 'Manage modules' })}
          {card('Recent activity', '—', Activity)}
        </div>
      )}
    </div>
  );
}
