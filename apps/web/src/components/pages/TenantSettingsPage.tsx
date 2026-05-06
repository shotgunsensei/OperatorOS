'use client';

import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { meApi } from '@/lib/auth';

interface TenantRow {
  id: string; name: string; slug: string;
  type: 'personal' | 'company'; status: string;
  role?: string;
}

export default function TenantSettingsPage() {
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await meApi.tenants();
        const current = me.current ?? me.tenants?.[0]?.id ?? null;
        if (!alive || !current) return;
        const t = me.tenants.find((x: any) => x.id === current);
        if (alive) setTenant(t ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const row = (label: string, value: React.ReactNode, testId: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${colors.border}` }}>
      <span style={{ color: colors.textMuted, fontSize: 13 }}>{label}</span>
      <span data-testid={testId} style={{ color: '#fff', fontSize: 13 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }} data-testid="page-tenant-settings">
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <SettingsIcon size={24} color={colors.accent} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Tenant Settings</h1>
          <p style={{ color: colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Display settings for the active tenant. Rename/transfer flows arrive in a follow-up.
          </p>
        </div>
      </header>

      {loading ? (
        <div style={{ color: colors.textMuted, padding: 24 }}>Loading…</div>
      ) : !tenant ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="tenant-settings-empty">
          No active tenant.
        </div>
      ) : (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {row('Name', tenant.name, 'value-tenant-name')}
          {row('Slug', tenant.slug, 'value-tenant-slug')}
          {row('Type', tenant.type, 'value-tenant-type')}
          {row('Status', tenant.status, 'value-tenant-status')}
          {tenant.role && row('Your role', tenant.role, 'value-tenant-role')}
        </div>
      )}
    </div>
  );
}
