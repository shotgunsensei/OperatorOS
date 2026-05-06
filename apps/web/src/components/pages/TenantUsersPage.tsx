'use client';

import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, Mail, ShieldAlert, ChevronDown, ChevronRight, Boxes } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { tenantApi, meApi } from '@/lib/auth';

interface Member {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  status: string;
}
interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}
interface AccessRow {
  moduleId: string;
  moduleSlug: string | null;
  moduleName: string | null;
  tenantModuleStatus: string;
  allowAllMembers: boolean;
  accessLevel: 'none' | 'user' | 'manager';
}

const ACCESS_LEVELS: AccessRow['accessLevel'][] = ['none', 'user', 'manager'];

export default function TenantUsersPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // userId of the currently expanded module-access matrix (only one open at a
  // time to keep the row count manageable on narrow screens).
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accessByUser, setAccessByUser] = useState<Record<string, AccessRow[]>>({});
  const [accessLoading, setAccessLoading] = useState<string | null>(null);

  const reload = async (id: string) => {
    const [u, i] = await Promise.all([
      tenantApi.listUsers(id).catch(() => ({ users: [] })),
      tenantApi.listInvites(id).catch(() => ({ invites: [] })),
    ]);
    setMembers(u.users ?? []);
    setInvites(i.invites ?? []);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = await meApi.tenants();
      const current = me.current ?? me.tenants?.[0]?.id ?? null;
      if (!alive) return;
      setTenantId(current);
      if (current) await reload(current);
    })();
    return () => { alive = false; };
  }, []);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setErr(null);
    setBusy(true);
    try {
      await tenantApi.createInvite(tenantId, email.trim(), role);
      setEmail('');
      await reload(tenantId);
    } catch (e: any) {
      setErr(e?.error || 'Failed to create invite');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (userId: string, next: Member['role']) => {
    if (!tenantId) return;
    try {
      await tenantApi.updateUser(tenantId, userId, next);
      await reload(tenantId);
    } catch (e: any) {
      window.alert(e?.error || 'Failed to update role');
    }
  };

  const removeMember = async (userId: string) => {
    if (!tenantId) return;
    if (!confirm('Remove this member from the tenant?')) return;
    try {
      await tenantApi.removeUser(tenantId, userId);
      await reload(tenantId);
    } catch (e: any) {
      window.alert(e?.error || 'Failed to remove member');
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!tenantId) return;
    try {
      await tenantApi.revokeInvite(tenantId, inviteId);
      await reload(tenantId);
    } catch {}
  };

  const toggleExpand = async (userId: string) => {
    if (!tenantId) return;
    if (expanded === userId) { setExpanded(null); return; }
    setExpanded(userId);
    if (!accessByUser[userId]) {
      setAccessLoading(userId);
      try {
        const r = await tenantApi.getUserModuleAccess(tenantId, userId);
        setAccessByUser(prev => ({ ...prev, [userId]: r.grid ?? [] }));
      } catch {
        setAccessByUser(prev => ({ ...prev, [userId]: [] }));
      } finally {
        setAccessLoading(null);
      }
    }
  };

  const setAccess = async (userId: string, slug: string, level: AccessRow['accessLevel']) => {
    if (!tenantId) return;
    try {
      await tenantApi.setUserModuleAccess(tenantId, userId, slug, level);
      const r = await tenantApi.getUserModuleAccess(tenantId, userId);
      setAccessByUser(prev => ({ ...prev, [userId]: r.grid ?? [] }));
    } catch (e: any) {
      window.alert(e?.error || 'Failed to update access');
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }} data-testid="page-tenant-users">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#fff' }}>Tenant Members</h1>
        <p style={{ color: colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          Invite members, change roles, revoke access, and grant per-module access.
        </p>
      </header>

      {/* Invite form */}
      <section style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        borderRadius: 12, padding: 20, marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserPlus size={16} color={colors.accent} /> Invite a member
        </h2>
        <form onSubmit={submitInvite} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <input
            data-testid="input-invite-email"
            type="email"
            required
            placeholder="someone@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              flex: '1 1 240px', padding: '8px 12px', borderRadius: 6,
              border: `1px solid ${colors.border}`, background: colors.bg,
              color: colors.text, fontSize: 13,
            }}
          />
          <select
            data-testid="select-invite-role"
            value={role}
            onChange={e => setRole(e.target.value as any)}
            style={{
              padding: '8px 12px', borderRadius: 6,
              border: `1px solid ${colors.border}`, background: colors.bg,
              color: colors.text, fontSize: 13,
            }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button
            data-testid="button-send-invite"
            type="submit"
            disabled={busy}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: colors.accent, color: '#fff', cursor: busy ? 'wait' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >Send invite</button>
        </form>
        {err && (
          <div style={{ color: colors.accentRed, fontSize: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={12} /> {err}
          </div>
        )}
      </section>

      {/* Members */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#fff' }}>Members</h2>
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {members.length === 0 ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: 13 }} data-testid="members-empty">No members yet.</div>
          ) : members.map(m => {
            const isOpen = expanded === m.userId;
            const grid = accessByUser[m.userId];
            return (
              <div key={m.userId} style={{ borderTop: `1px solid ${colors.border}` }}>
                <div
                  data-testid={`row-member-${m.userId}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                  }}
                >
                  <button
                    data-testid={`button-expand-access-${m.userId}`}
                    onClick={() => toggleExpand(m.userId)}
                    title="Per-module access"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: isOpen ? colors.accent : colors.textMuted, padding: 0,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#fff' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{m.email}</div>
                  </div>
                  <select
                    data-testid={`select-role-${m.userId}`}
                    value={m.role}
                    onChange={e => changeRole(m.userId, e.target.value as any)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: `1px solid ${colors.border}`, background: colors.bg,
                      color: colors.text, fontSize: 12,
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button
                    data-testid={`button-remove-${m.userId}`}
                    onClick={() => removeMember(m.userId)}
                    style={{
                      padding: 6, borderRadius: 6, border: `1px solid ${colors.border}`,
                      background: 'transparent', color: colors.accentRed, cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                    }}
                  ><Trash2 size={14} /></button>
                </div>

                {isOpen && (
                  <div
                    data-testid={`access-matrix-${m.userId}`}
                    style={{ background: colors.bg, padding: '8px 16px 16px 40px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted, fontSize: 12, margin: '4px 0 8px' }}>
                      <Boxes size={12} /> Per-module access
                    </div>
                    {accessLoading === m.userId && !grid ? (
                      <div style={{ color: colors.textMuted, fontSize: 12 }}>Loading\u2026</div>
                    ) : !grid || grid.length === 0 ? (
                      <div style={{ color: colors.textMuted, fontSize: 12 }} data-testid={`access-empty-${m.userId}`}>
                        No modules enabled for this tenant.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {grid.map(g => (
                          <div
                            key={g.moduleId}
                            data-testid={`access-row-${m.userId}-${g.moduleSlug}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '8px 12px', borderRadius: 8,
                              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
                            }}
                          >
                            <div style={{ flex: 1, fontSize: 12, color: colors.text }}>
                              {g.moduleName ?? g.moduleSlug ?? g.moduleId}
                              {g.allowAllMembers && (
                                <span style={{ marginLeft: 8, fontSize: 10, color: colors.accent }}>
                                  open to all
                                </span>
                              )}
                            </div>
                            <select
                              data-testid={`select-access-${m.userId}-${g.moduleSlug}`}
                              value={g.accessLevel}
                              onChange={e => g.moduleSlug && setAccess(m.userId, g.moduleSlug, e.target.value as AccessRow['accessLevel'])}
                              disabled={!g.moduleSlug}
                              style={{
                                padding: '4px 8px', borderRadius: 6,
                                border: `1px solid ${colors.border}`,
                                background: colors.bg, color: colors.text, fontSize: 11,
                              }}
                            >
                              {ACCESS_LEVELS.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending invites */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: '#fff' }}>Pending invites</h2>
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {invites.length === 0 ? (
            <div style={{ padding: 16, color: colors.textMuted, fontSize: 13 }} data-testid="invites-empty">
              No pending invites.
            </div>
          ) : invites.map(i => (
            <div
              key={i.id}
              data-testid={`row-invite-${i.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderTop: `1px solid ${colors.border}`,
              }}
            >
              <Mail size={14} color={colors.textMuted} />
              <div style={{ flex: 1, fontSize: 13, color: colors.text }}>{i.email}</div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                border: `1px solid ${colors.border}`, color: colors.textMuted,
              }}>{i.role}</span>
              <button
                data-testid={`button-revoke-${i.id}`}
                onClick={() => revokeInvite(i.id)}
                style={{
                  padding: '4px 8px', borderRadius: 6, border: `1px solid ${colors.border}`,
                  background: 'transparent', color: colors.accentRed, cursor: 'pointer', fontSize: 12,
                }}
              >Revoke</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
