'use client';

import React, { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { tenantApi, meApi } from '@/lib/auth';
import { EmptyState, ErrorState, LoadingState } from '../ExperiencePrimitives';

interface TenantModule {
  tenantModuleId: string;
  moduleId: string;
  moduleSlug: string | null;
  moduleName: string | null;
  category: string | null;
  status: string;
  source: string;
  allowAllMembers: boolean;
}

export default function TenantModulesPage() {
  const [items, setItems] = useState<TenantModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await meApi.tenants();
        const current = me.current ?? me.tenants?.[0]?.id ?? null;
        if (!current) return;
        if (alive) setTenantId(current);
        const data = await tenantApi.listModules(current);
        if (alive) setItems(data.modules ?? []);
      } catch {
        if (alive) { setItems([]); setLoadError(true); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const statusColor = (s: string) =>
    s === 'enabled' || s === 'purchased' || s === 'beta' ? colors.accentGreen
      : s === 'trial' ? colors.accentYellow
      : colors.accentRed;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }} data-testid="page-tenant-modules">
      <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Boxes size={24} color={colors.accent} />
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Tool access</h1>
          <p style={{ color: colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Review the tools available to everyone in this organization. Individual access is managed under Team members.
          </p>
        </div>
      </header>

      {loading ? (
        <div data-testid="modules-loading"><LoadingState label="Loading organization tools…" /></div>
      ) : loadError ? (
        <ErrorState title="Tool access is unavailable" description="Your organization’s access has not changed. Refresh the page and try again." />
      ) : items.length === 0 ? (
        <div data-testid="modules-empty"><EmptyState title="No organization-wide tools yet" description="Browse available tools to see pricing and the next step." /></div>
      ) : (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {items.map(m => (
            <div
              key={m.tenantModuleId}
              data-testid={`row-module-${m.moduleSlug ?? m.moduleId}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderTop: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{m.moduleName}</div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>
                  {(m.category ?? 'Business tool').replace(/[_-]/g, ' ')} · {m.allowAllMembers ? 'Available to every team member' : 'Assigned individually'}
                </div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 999,
                color: statusColor(m.status),
                border: `1px solid ${statusColor(m.status)}55`,
              }}>{m.status === 'enabled' || m.status === 'purchased' ? 'Available' : m.status === 'trial' ? 'Trial' : m.status === 'beta' ? 'Beta' : 'Unavailable'}</span>
              {m.allowAllMembers && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 999,
                  color: colors.accent, border: `1px solid ${colors.accent}55`,
                }}>Everyone has access</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
