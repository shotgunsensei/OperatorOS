'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { meApi, tenantApi, getActiveTenantId, setActiveTenantId } from '@/lib/auth';
import { useAuth } from './AuthProvider';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  type?: string;
  status?: string;
  // Membership role for the current user. Absent when listed via the
  // super-admin "all tenants" surface for a tenant the user is not a
  // member of.
  role?: 'owner' | 'admin' | 'member' | 'viewer' | null;
}

interface TenantContextValue {
  // Tenants the user is a member of (always populated for authenticated users).
  tenants: TenantSummary[];
  // Every tenant on the platform — only populated for super_admin users.
  allTenants: TenantSummary[];
  activeTenant: TenantSummary | null;
  activeRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  loading: boolean;
  // Switches the active tenant: writes users.current_tenant_id server-side,
  // updates localStorage so the X-Tenant-Id header tracks, and reloads the
  // page so every panel rehydrates against the new tenant context.
  switchTenant: (tenantId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue>({
  tenants: [],
  allTenants: [],
  activeTenant: null,
  activeRole: null,
  loading: true,
  switchTenant: async () => {},
  refresh: async () => {},
});

export function useTenant() {
  return useContext(TenantContext);
}

export default function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, captureIdentity } = useAuth();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [allTenants, setAllTenants] = useState<TenantSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownsState, setOwnsState] = useState<() => boolean>(() => () => false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);

  const isSuperAdmin = (user as any)?.platformRole === 'super_admin';

  const refresh = useCallback(async () => {
    const identityCurrent = captureIdentity(user);
    if (!mounted.current || !identityCurrent()) return;
    const version = ++requestVersion.current;
    const current = () => mounted.current && requestVersion.current === version && identityCurrent();
    if (!user) {
      setTenants([]);
      setAllTenants([]);
      setActiveId(null);
      setActiveTenantId(null);
      setOwnsState(() => identityCurrent);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch both lists up front so super-admins can keep an active tenant
      // they don't have membership in (e.g. after switching to one via the
      // "All tenants" view). Resolving the active id against only the
      // membership list would clobber that selection on every refresh.
      const [me, allRes] = await Promise.all([
        meApi.tenants(),
        isSuperAdmin ? meApi.allTenants().catch(() => ({ tenants: [] })) : Promise.resolve({ tenants: [] }),
      ]);
      if (!current()) return;
      const list: TenantSummary[] = me?.tenants ?? [];
      const all: TenantSummary[] = allRes?.tenants ?? [];
      setTenants(list);
      setAllTenants(isSuperAdmin ? all : []);
      setOwnsState(() => identityCurrent);

      // Visible to *this* user — members for everyone, members ∪ all for super-admins.
      const visibleIds = new Set<string>(list.map((t) => t.id));
      if (isSuperAdmin) for (const t of all) visibleIds.add(t.id);

      const localCached = getActiveTenantId();
      const candidate =
        (me?.current && visibleIds.has(me.current) ? me.current : null) ??
        (localCached && visibleIds.has(localCached) ? localCached : null) ??
        list[0]?.id ??
        (isSuperAdmin ? all[0]?.id : null) ??
        null;
      setActiveId(candidate);
      setActiveTenantId(candidate);
    } catch {
      if (!current()) return;
      setTenants([]);
      setAllTenants([]);
      setActiveId(null);
      setActiveTenantId(null);
      setOwnsState(() => identityCurrent);
    } finally {
      if (current()) setLoading(false);
    }
  }, [user, isSuperAdmin, captureIdentity]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; requestVersion.current++; };
  }, [refresh]);

  const switchTenant = useCallback(async (tenantId: string) => {
    const identityCurrent = captureIdentity(user);
    if (!mounted.current || !identityCurrent()) return;
    await tenantApi.switch(tenantId);
    if (!mounted.current || !identityCurrent()) return;
    requestVersion.current++;
    setActiveTenantId(tenantId);
    setActiveId(tenantId);
    // Hard reload so every cached query/panel re-fetches with the new
    // X-Tenant-Id header. Simpler and safer than threading invalidation
    // through every consumer.
    if (typeof window !== 'undefined') window.location.reload();
  }, [user, captureIdentity]);

  // Never present another accepted identity's cached memberships while its
  // replacement request is pending, including a fresh login with the same ID.
  const stateCurrent = ownsState();
  const memberTenants = stateCurrent ? tenants : [];
  const adminTenants = stateCurrent ? allTenants : [];
  // Merge: members list is authoritative for role; super-admin sees all.
  const visibleTenants = isSuperAdmin
    ? mergeTenantLists(memberTenants, adminTenants)
    : memberTenants;

  const activeTenant =
    visibleTenants.find((t) => t.id === activeId) ?? null;
  const activeRole = (activeTenant?.role ?? null) as TenantContextValue['activeRole'];

  return (
    <TenantContext.Provider value={{
      tenants: memberTenants,
      allTenants: adminTenants,
      activeTenant,
      activeRole,
      loading: stateCurrent ? loading : Boolean(user),
      switchTenant,
      refresh,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

function mergeTenantLists(member: TenantSummary[], all: TenantSummary[]): TenantSummary[] {
  const byId = new Map<string, TenantSummary>();
  for (const t of all) byId.set(t.id, { ...t, role: null });
  for (const t of member) byId.set(t.id, { ...byId.get(t.id), ...t });
  return Array.from(byId.values());
}
