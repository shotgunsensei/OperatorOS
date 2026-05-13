'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Shield } from 'lucide-react';
import { useTenant, type TenantSummary } from './TenantProvider';
import { useAuth } from './AuthProvider';
import { useToast } from './Toast';
import { isSuperAdmin } from '@/lib/rbac';

const colors = {
  bgSecondary: '#0d1117',
  bgHover: '#161b22',
  border: '#21262d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  textDim: '#484f58',
  accent: '#58a6ff',
  accentPurple: '#bc8cff',
};

export default function TenantSwitcher() {
  const { user } = useAuth();
  const { tenants, allTenants, activeTenant, loading, switchTenant, refresh } = useTenant();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const userIsSuperAdmin = isSuperAdmin((user as any)?.platformRole);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const handlePick = async (tenantId: string) => {
    if (tenantId === activeTenant?.id) { setOpen(false); return; }
    setBusyId(tenantId);
    try {
      await switchTenant(tenantId);
      // switchTenant reloads the page; this is mostly defensive.
      setOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to switch tenant', err);
      const message = friendlySwitchError(err);
      toast(message, 'error');
      setBusyId(null);
      // Keep the picker open so the user can choose another tenant.
      // If the failure indicates the tenant is no longer reachable, refresh
      // the underlying list so the stale entry disappears (or has its
      // updated status reflected). Swallow refresh errors so a transient
      // refresh failure can't trigger an infinite retry loop.
      if (isTenantGoneError(err)) {
        refresh().catch((refreshErr) => {
          // eslint-disable-next-line no-console
          console.error('Failed to refresh tenant list after switch error', refreshErr);
        });
      }
    }
  };

  const memberList = tenants;
  const otherTenants = userIsSuperAdmin && showAll
    ? allTenants.filter((t) => !memberList.some((m) => m.id === t.id))
    : [];

  return (
    <div ref={ref} style={{ position: 'relative' }} data-testid="tenant-switcher">
      <button
        data-testid="button-tenant-switcher"
        onClick={() => setOpen(!open)}
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          color: colors.text,
          cursor: loading ? 'default' : 'pointer',
          fontSize: 13,
          fontWeight: 500,
          minWidth: 0,
          maxWidth: 260,
        }}
        title={activeTenant?.name || 'No tenant'}
      >
        <Building2 size={14} style={{ color: colors.accent, flexShrink: 0 }} />
        <span
          data-testid="text-active-tenant"
          style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
        >
          {loading ? 'Loading…' : (activeTenant?.name ?? 'No tenant')}
        </span>
        {activeTenant?.role && (
          <span
            data-testid="text-active-tenant-role"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: colors.textMuted,
              padding: '2px 6px',
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              flexShrink: 0,
            }}
          >{activeTenant.role}</span>
        )}
        <ChevronDown size={14} style={{ color: colors.textDim, flexShrink: 0 }} />
      </button>

      {open && (
        <div
          data-testid="tenant-switcher-menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: 280,
            maxWidth: 360,
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: 4,
            zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          <SectionLabel>Your tenants</SectionLabel>
          {memberList.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: colors.textMuted }}>
              You are not a member of any tenant.
            </div>
          )}
          {memberList.map((t) => (
            <TenantRow
              key={t.id}
              tenant={t}
              active={t.id === activeTenant?.id}
              busy={busyId === t.id}
              onPick={() => handlePick(t.id)}
            />
          ))}

          {userIsSuperAdmin && (
            <>
              <div style={{ height: 1, background: colors.border, margin: '6px 4px' }} />
              <button
                data-testid="button-toggle-all-tenants"
                onClick={() => setShowAll((v) => !v)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  color: colors.accentPurple,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12,
                  fontWeight: 600,
                }}
                onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = colors.bgHover}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <Shield size={12} />
                {showAll ? 'Hide all tenants' : 'Show all tenants (super admin)'}
              </button>
              {showAll && otherTenants.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 12, color: colors.textMuted }}>
                  No other tenants on the platform.
                </div>
              )}
              {showAll && otherTenants.map((t) => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  active={t.id === activeTenant?.id}
                  busy={busyId === t.id}
                  onPick={() => handlePick(t.id)}
                  superView
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// The API rejects /v1/tenants/:id/switch with structured errors:
//   - 404 TENANT_NOT_FOUND  (cross-tenant, archived, or no membership)
//   - 403 TENANT_SUSPENDED  (tenant exists but is suspended)
// Surface the server-provided message when present, with a sensible
// fallback per known code so the user always sees a helpful reason.
function friendlySwitchError(err: unknown): string {
  const e = (err ?? {}) as { status?: number; code?: string; error?: string; message?: string };
  const serverMsg = e.error || e.message;
  if (e.code === 'TENANT_SUSPENDED') {
    return serverMsg || 'That tenant is suspended. Contact your platform administrator.';
  }
  if (e.code === 'TENANT_NOT_FOUND' || e.status === 404) {
    return serverMsg || "That tenant isn't available. It may have been archived or removed.";
  }
  if (e.status === 403) {
    return serverMsg || "You don't have access to that tenant.";
  }
  return serverMsg || 'Could not switch tenant. Please try again.';
}

// True when the failure indicates the tenant is no longer reachable for this
// user (archived/removed → 404 TENANT_NOT_FOUND, or suspended → 403
// TENANT_SUSPENDED). In those cases we refresh the underlying tenant list so
// the picker drops or restyles the stale entry.
function isTenantGoneError(err: unknown): boolean {
  const e = (err ?? {}) as { status?: number; code?: string };
  if (e.code === 'TENANT_NOT_FOUND' || e.code === 'TENANT_SUSPENDED') return true;
  return false;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '6px 12px 4px',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: colors.textDim,
    }}>{children}</div>
  );
}

function TenantRow({
  tenant, active, busy, onPick, superView,
}: {
  tenant: TenantSummary;
  active: boolean;
  busy: boolean;
  onPick: () => void;
  superView?: boolean;
}) {
  const status = (tenant.status || 'active').toLowerCase();
  const inactive = status !== 'active';
  const nameColor = inactive ? colors.textMuted : colors.text;
  return (
    <button
      data-testid={`button-pick-tenant-${tenant.id}`}
      onClick={onPick}
      disabled={busy}
      title={inactive ? `Tenant is ${status}` : undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: active ? colors.bgHover : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: nameColor,
        cursor: busy ? 'progress' : 'pointer',
        textAlign: 'left',
        fontSize: 13,
        opacity: inactive ? 0.7 : 1,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <Building2 size={14} style={{ color: inactive ? colors.textDim : (superView ? colors.accentPurple : colors.accent), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: active ? 600 : 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: nameColor,
          fontStyle: inactive ? 'italic' : 'normal',
        }}>{tenant.name}</div>
        <div style={{ fontSize: 11, color: colors.textMuted }}>
          {tenant.slug}{tenant.role ? ` · ${tenant.role}` : (superView ? ' · not a member' : '')}
        </div>
      </div>
      {inactive && <StatusBadge status={status} />}
      {active && <Check size={14} style={{ color: colors.accent, flexShrink: 0 }} />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuspended = status === 'suspended';
  const bg = isSuspended ? '#3b1d1d' : '#2a2118';
  const fg = isSuspended ? '#f0883e' : '#d2a8ff';
  return (
    <span
      data-testid={`badge-tenant-status-${status}`}
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: fg,
        background: bg,
        padding: '2px 6px',
        borderRadius: 4,
        flexShrink: 0,
      }}
    >{status}</span>
  );
}
