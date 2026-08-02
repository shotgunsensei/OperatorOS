'use client';

import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, ShieldAlert, Crown, AlertTriangle } from 'lucide-react';
import {
  cardStyle, panelStyle, buttonStyles, badgeStyles,
  semantic, space, fontSize, radius,
} from '@/lib/design-tokens';
import { meApi, tenantApi } from '@/lib/auth';
import { useTenant } from '@/components/TenantProvider';

interface TenantRow {
  id: string; name: string; slug: string;
  type: 'personal' | 'company'; status: string;
  role?: 'owner' | 'admin' | 'member';
}
interface Member {
  membershipId: string; userId: string; email: string;
  name: string; role: 'owner' | 'admin' | 'member'; status: string;
}

export default function TenantSettingsPage() {
  // Task #66: hold a handle on the global TenantProvider so a successful
  // rename refreshes the top-right tenant dropdown immediately, without
  // a page reload.
  const tenantCtx = useTenant();
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Owner transfer
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferErr, setTransferErr] = useState<string | null>(null);

  const refresh = async (): Promise<TenantRow | null> => {
    const me = await meApi.tenants();
    const current = me.current ?? me.tenants?.[0]?.id ?? null;
    if (!current) return null;
    const t = me.tenants.find((x: any) => x.id === current) ?? null;
    if (t) setName(t.name ?? '');
    let memberRows: Member[] = [];
    try {
      const data = await tenantApi.listUsers(current);
      memberRows = data.users ?? [];
    } catch { /* admins/members may not be allowed */ }
    setMembers(memberRows);

    // Find my own user id by matching the auth me payload via /v1/me/tenants
    // (tenants list doesn't include user id directly, derive from members).
    try {
      const meRow = (await import('@/lib/auth')).authApi;
      const who = await meRow.me();
      setMeId(who?.user?.id ?? null);
    } catch { setMeId(null); }
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
  const isSuspended = tenant?.status === 'suspended';
  const dirty = !!tenant && name.trim() !== tenant.name && name.trim().length > 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !dirty || !isOwner || isSuspended) return;
    setErr(null); setBusy(true);
    try {
      const r = await tenantApi.rename(tenant.id, name.trim());
      setTenant({ ...tenant, name: r.tenant.name });
      setSavedAt(Date.now());
      // Task #66: refresh the global tenant context so the top-right
      // dropdown re-renders with the new name without a page reload.
      try { await tenantCtx.refresh(); } catch { /* best-effort */ }
    } catch (e: any) {
      setErr('We could not save the organization name. The current name is unchanged. Check the entry and try again.');
    } finally { setBusy(false); }
  };

  const transfer = async () => {
    if (!tenant || !isOwner || !transferTo || isSuspended) return;
    const target = members.find(m => m.userId === transferTo);
    if (!target) return;
    if (!confirm(
      `Transfer ownership of "${tenant.name}" to ${target.name || target.email}? ` +
      `Your role will change to administrator. Only the new owner can reverse this change.`,
    )) return;
    setTransferErr(null); setTransferBusy(true);
    try {
      // Promote target to owner first (so we never end in a no-owner state),
      // then demote the current owner to admin.
      await tenantApi.updateUser(tenant.id, target.userId, 'owner');
      if (meId && meId !== target.userId) {
        await tenantApi.updateUser(tenant.id, meId, 'admin');
      }
      const t = await refresh();
      if (t) setTenant(t);
      setTransferTo('');
    } catch (e: any) {
      setTransferErr('We could not transfer ownership. The current owner and team access are unchanged. Try again in a moment.');
    } finally { setTransferBusy(false); }
  };

  const meta = (label: string, value: React.ReactNode, testId: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${semantic.border}` }}>
      <span style={{ color: semantic.textMuted, fontSize: fontSize.body }}>{label}</span>
      <span data-testid={testId} style={{ color: '#fff', fontSize: fontSize.body }}>{value}</span>
    </div>
  );

  const otherMembers = members.filter(m => m.userId !== meId);

  return (
    <div style={{ padding: space.xxl, maxWidth: 800, margin: '0 auto' }} data-testid="page-tenant-settings">
      <header style={{ marginBottom: space.xl, display: 'flex', alignItems: 'center', gap: 12 }}>
        <SettingsIcon size={24} color={semantic.accent} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Organization settings</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            {isOwner
              ? 'Update the organization name or choose another team member to become the owner.'
              : 'Read-only view. Only the organization owner can change these settings.'}
          </p>
        </div>
      </header>

      {isSuspended && (
        <div
          data-testid="tenant-settings-suspended"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            background: `${semantic.accentDanger}15`,
            display: 'flex', alignItems: 'center', gap: space.md,
            marginBottom: space.lg,
          }}
        >
          <AlertTriangle size={18} color={semantic.accentDanger} />
          <div>
            <div style={{ color: semantic.accentDanger, fontWeight: 600, fontSize: fontSize.body }}>
              This organization is suspended.
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
              Name changes and ownership transfer are unavailable until a platform administrator restores access.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="tenant-settings-loading">Loading\u2026</div>
      ) : !tenant ? (
        <div style={{ color: semantic.textMuted, padding: space.xl }} data-testid="tenant-settings-empty">
          No organization is selected. Return to Home and choose an organization first.
        </div>
      ) : (
        <>
          {/* Rename */}
          <form onSubmit={save} style={{ ...cardStyle, marginBottom: space.lg }}>
            <label htmlFor="organization-display-name" style={{ fontSize: fontSize.sm, color: semantic.textMuted, display: 'block', marginBottom: 6 }}>
              Organization name
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="organization-display-name"
                data-testid="input-tenant-name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!isOwner || busy || isSuspended}
                maxLength={120}
                style={{
                  flex: '1 1 240px', padding: '8px 12px', borderRadius: radius.sm,
                  border: `1px solid ${semantic.border}`, background: semantic.bg,
                  color: semantic.text, fontSize: fontSize.body,
                  opacity: !isOwner || isSuspended ? 0.6 : 1,
                }}
              />
              <button
                data-testid="button-save-tenant-name"
                type="submit"
                disabled={!isOwner || !dirty || busy || isSuspended}
                title={
                  isSuspended ? 'Organization is suspended'
                  : !isOwner ? 'Only the organization owner can rename it'
                  : undefined
                }
                style={{
                  ...buttonStyles.primary,
                  background: !isOwner || !dirty || isSuspended ? semantic.bgHover : semantic.accent,
                  color: !isOwner || !dirty || isSuspended ? semantic.textMuted : '#fff',
                  cursor: !isOwner || !dirty || busy || isSuspended ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                 <Save size={14} /> {busy ? 'Saving…' : 'Save organization name'}
              </button>
            </div>
            {err && (
              <div data-testid="tenant-settings-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldAlert size={12} /> {err}
              </div>
            )}
            {savedAt && !err && (
              <div data-testid="tenant-settings-saved" style={{ color: semantic.accentSuccess, fontSize: fontSize.sm, marginTop: 8 }}>
                Organization name saved.
              </div>
            )}
          </form>

          {/* Owner transfer */}
          {isOwner && (
            <section data-testid="tenant-owner-transfer" style={{ ...cardStyle, marginBottom: space.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
                <Crown size={14} color={semantic.accentWarning} />
                <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>
                  Transfer ownership
                </h2>
              </div>
              <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: `0 0 ${space.md}px` }}>
                Choose another team member to become the owner. Your role will change to administrator, and only the new owner can reverse the transfer.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <select
                  aria-label="New organization owner"
                  data-testid="select-transfer-target"
                  value={transferTo}
                  onChange={e => setTransferTo(e.target.value)}
                  disabled={transferBusy || otherMembers.length === 0 || isSuspended}
                  style={{
                    flex: '1 1 240px', padding: '8px 12px', borderRadius: radius.sm,
                    border: `1px solid ${semantic.border}`, background: semantic.bg,
                    color: semantic.text, fontSize: fontSize.body,
                  }}
                >
                  <option value="">{otherMembers.length === 0 ? 'No other members yet' : 'Choose a member\u2026'}</option>
                  {otherMembers.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {(m.name || m.email)} ({m.role === 'admin' ? 'Administrator' : m.role === 'owner' ? 'Owner' : 'Team member'})
                    </option>
                  ))}
                </select>
                <button
                  data-testid="button-transfer-ownership"
                  onClick={transfer}
                  disabled={!transferTo || transferBusy || isSuspended}
                  title={isSuspended ? 'Organization is suspended' : undefined}
                  style={{
                    ...buttonStyles.primary,
                    background: !transferTo || isSuspended ? semantic.bgHover : semantic.accentWarning,
                    color: !transferTo || isSuspended ? semantic.textMuted : '#fff',
                    cursor: !transferTo || transferBusy || isSuspended ? 'not-allowed' : 'pointer',
                  }}
                >{transferBusy ? 'Transferring\u2026' : 'Transfer ownership'}</button>
              </div>
              {transferErr && (
                <div data-testid="tenant-transfer-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldAlert size={12} /> {transferErr}
                </div>
              )}
            </section>
          )}

          <div style={panelStyle}>
            {meta(
              'Organization status',
              <span style={
                tenant.status === 'suspended' ? badgeStyles.danger
                : tenant.status === 'archived' ? badgeStyles.neutral
                : badgeStyles.success
              }>{tenant.status === 'active' ? 'Active' : tenant.status === 'suspended' ? 'Suspended' : 'Archived'}</span>,
              'value-tenant-status',
            )}
            {tenant.role && meta('Your role', tenant.role === 'owner' ? 'Owner' : tenant.role === 'admin' ? 'Administrator' : 'Team member', 'value-tenant-role')}
            {isOwner && (
              <details style={{ borderTop: `1px solid ${semantic.border}`, padding: '12px 16px', color: semantic.textMuted }}>
                <summary style={{ cursor: 'pointer', color: semantic.text, fontWeight: 700 }}>Technical organization details</summary>
                <div style={{ marginTop: 10 }}>{meta('Organization identifier', tenant.slug, 'value-tenant-slug')}{meta('Organization type', tenant.type, 'value-tenant-type')}</div>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}
