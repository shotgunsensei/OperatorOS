'use client';

import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { meApi, tenantApi } from '@/lib/auth';

interface TenantRow {
  id: string; name: string; slug: string;
  type: 'personal' | 'company'; status: string;
  role?: 'owner' | 'admin' | 'member';
}

export default function TenantSettingsPage() {
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refresh = async () => {
    const me = await meApi.tenants();
    const current = me.current ?? me.tenants?.[0]?.id ?? null;
    if (!current) return null;
    const t = me.tenants.find((x: any) => x.id === current) ?? null;
    if (t) setName(t.name ?? '');
    return t as TenantRow | null;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await refresh();
        if (alive) setTenant(t);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isOwner = tenant?.role === 'owner';
  const dirty = !!tenant && name.trim() !== tenant.name && name.trim().length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !dirty || !isOwner) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await tenantApi.rename(tenant.id, name.trim());
      setTenant({ ...tenant, name: r.tenant.name });
      setSavedAt(Date.now());
    } catch (e: any) {
      setErr(e?.error || 'Failed to rename tenant');
    } finally {
      setBusy(false);
    }
  };

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
            {isOwner
              ? 'Update your tenant\u2019s display name. Slug and type are immutable.'
              : 'Read-only view. Only tenant owners can change settings.'}
          </p>
        </div>
      </header>

      {loading ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="tenant-settings-loading">Loading\u2026</div>
      ) : !tenant ? (
        <div style={{ color: colors.textMuted, padding: 24 }} data-testid="tenant-settings-empty">
          No active tenant.
        </div>
      ) : (
        <>
          <form
            onSubmit={save}
            style={{
              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
              borderRadius: 12, padding: 20, marginBottom: 16,
            }}
          >
            <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
              Display name
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                data-testid="input-tenant-name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!isOwner || busy}
                maxLength={120}
                style={{
                  flex: '1 1 240px', padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${colors.border}`, background: colors.bg,
                  color: colors.text, fontSize: 13,
                  opacity: isOwner ? 1 : 0.6,
                }}
              />
              <button
                data-testid="button-save-tenant-name"
                type="submit"
                disabled={!isOwner || !dirty || busy}
                title={!isOwner ? 'Only tenant owners can rename the tenant' : undefined}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: !isOwner || !dirty ? colors.bgHover : colors.accent,
                  color: !isOwner || !dirty ? colors.textMuted : '#fff',
                  cursor: !isOwner || !dirty || busy ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Save size={14} /> {busy ? 'Saving\u2026' : 'Save'}
              </button>
            </div>
            {err && (
              <div data-testid="tenant-settings-error" style={{ color: colors.accentRed, fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={12} /> {err}
              </div>
            )}
            {savedAt && !err && (
              <div data-testid="tenant-settings-saved" style={{ color: colors.accentGreen, fontSize: 12, marginTop: 8 }}>
                Saved.
              </div>
            )}
          </form>

          <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {row('Slug', tenant.slug, 'value-tenant-slug')}
            {row('Type', tenant.type, 'value-tenant-type')}
            {row('Status', tenant.status, 'value-tenant-status')}
            {tenant.role && row('Your role', tenant.role, 'value-tenant-role')}
          </div>
        </>
      )}
    </div>
  );
}
