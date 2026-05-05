'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/auth';
import { useToast } from '../Toast';
import { colors } from '../SaasLayout';

type Tab = 'overview' | 'users' | 'audit' | 'billing' | 'modules';

const adminColors = {
  cardBg: 'rgba(30,33,40,0.95)',
  headerBg: 'rgba(20,22,28,0.98)',
  rowHover: 'rgba(56,139,253,0.06)',
  badgeGreen: 'rgba(63,185,80,0.15)',
  badgeYellow: 'rgba(210,153,34,0.15)',
  badgeRed: 'rgba(248,81,73,0.15)',
  badgePurple: 'rgba(163,113,247,0.15)',
  badgeBlue: 'rgba(56,139,253,0.15)',
};

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span data-testid={`badge-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{
      fontSize: 11, padding: '2px 10px', borderRadius: 10, background: bg, color, fontWeight: 500,
      display: 'inline-block', lineHeight: '18px', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    active: { color: colors.accentGreen, bg: adminColors.badgeGreen },
    suspended: { color: colors.accentYellow, bg: adminColors.badgeYellow },
    deleted: { color: colors.accentRed, bg: adminColors.badgeRed },
    pending: { color: colors.textMuted, bg: 'rgba(139,148,158,0.15)' },
  };
  const s = map[status] || map.pending;
  return <Badge label={status} color={s.color} bg={s.bg} />;
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    starter: { color: colors.textMuted, bg: 'rgba(139,148,158,0.12)' },
    pro: { color: colors.accent, bg: adminColors.badgeBlue },
    elite: { color: colors.accentPurple, bg: adminColors.badgePurple },
  };
  const p = map[plan?.toLowerCase()] || map.starter;
  return <Badge label={plan || 'None'} color={p.color} bg={p.bg} />;
}

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
  return (
    <div data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{
      background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '20px 24px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, background: `${color}15`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ isOpen, title, message, confirmText, confirmColor, onConfirm, onCancel, children }: {
  isOpen: boolean; title: string; message: string; confirmText: string; confirmColor: string;
  onConfirm: () => void; onCancel: () => void; children?: any;
}) {
  if (!isOpen) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div data-testid="confirm-modal" style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: 32, width: 440, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 20, lineHeight: 1.6 }}>{message}</div>
        {children}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button data-testid="button-cancel" onClick={onCancel} style={{
            padding: '8px 20px', borderRadius: 8, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.text, fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button data-testid="button-confirm" onClick={onConfirm} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminApi.getMetrics().then(setMetrics).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: colors.textMuted }}>Loading overview...</div>;
  if (!metrics) return <div style={{ padding: 40, color: colors.textMuted }}>Failed to load metrics</div>;

  const totalSubs = Object.values(metrics.subscriptions).reduce((a: number, b: any) => a + b, 0);

  return (
    <div data-testid="admin-overview">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Users" value={metrics.users.total} color={colors.accent} icon="👥" />
        <StatCard label="Active Users" value={metrics.users.active} color={colors.accentGreen} icon="✓" />
        <StatCard label="Suspended" value={metrics.users.suspended} color={colors.accentYellow} icon="⏸" />
        <StatCard label="Trialing" value={metrics.users.trialing || 0} color={colors.accentPurple} icon="⏳" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Users by Plan</div>
          {Object.entries(metrics.subscriptions).map(([slug, cnt]) => {
            const pct = totalSubs > 0 ? ((cnt as number) / (totalSubs as number)) * 100 : 0;
            const planColor = slug === 'elite' ? colors.accentPurple : slug === 'pro' ? colors.accent : colors.textMuted;
            return (
              <div key={slug} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: colors.text, textTransform: 'capitalize' }}>{slug}</span>
                  <span style={{ fontSize: 13, color: planColor, fontWeight: 600 }}>{cnt as number}</span>
                </div>
                <div style={{ height: 6, background: colors.bg, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: planColor, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Platform Usage</div>
          {[
            { label: 'Workspaces', value: metrics.content.workspaces, color: colors.accent },
            { label: 'Projects', value: metrics.content.projects, color: '#f59e0b' },
            { label: 'Tasks', value: metrics.content.tasks, color: '#06b6d4' },
            { label: 'Notes', value: metrics.content.notes, color: colors.accentPurple },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
              <span style={{ fontSize: 13, color: colors.text }}>{item.label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Recent Signups</div>
          {(metrics.recentSignups || []).length === 0 ? (
            <div style={{ fontSize: 13, color: colors.textDim, padding: '12px 0' }}>No recent signups</div>
          ) : (
            metrics.recentSignups.map((u: any) => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: colors.textDim }}>{u.email}</div>
                </div>
                <div style={{ fontSize: 11, color: colors.textDim }}>{new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Recent Admin Actions</div>
          {(metrics.recentActions || []).length === 0 ? (
            <div style={{ fontSize: 13, color: colors.textDim, padding: '12px 0' }}>No recent actions</div>
          ) : (
            metrics.recentActions.slice(0, 8).map((a: any) => (
              <div key={a.id} style={{ padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ActionBadge action={a.action} />
                    <span style={{ fontSize: 11, color: colors.textDim }}>{a.adminName}</span>
                  </div>
                  <span style={{ fontSize: 10, color: colors.textDim }}>{timeAgo(a.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    user_suspended: { color: colors.accentYellow, bg: adminColors.badgeYellow },
    user_reactivated: { color: colors.accentGreen, bg: adminColors.badgeGreen },
    user_deleted: { color: colors.accentRed, bg: adminColors.badgeRed },
    user_hard_deleted: { color: colors.accentRed, bg: adminColors.badgeRed },
    user_role_changed: { color: colors.accentPurple, bg: adminColors.badgePurple },
    user_plan_changed: { color: colors.accent, bg: adminColors.badgeBlue },
    subscription_status_changed: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
    trial_set: { color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
    user_unlocked: { color: colors.accentGreen, bg: adminColors.badgeGreen },
    admin_note_added: { color: colors.textMuted, bg: 'rgba(139,148,158,0.12)' },
    admin_note_deleted: { color: colors.textMuted, bg: 'rgba(139,148,158,0.12)' },
    login_success: { color: colors.accentGreen, bg: adminColors.badgeGreen },
    login_failed: { color: colors.accentRed, bg: adminColors.badgeRed },
  };
  const s = map[action] || { color: colors.textMuted, bg: 'rgba(139,148,158,0.12)' };
  return <Badge label={action.replace(/_/g, ' ')} color={s.color} bg={s.bg} />;
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getUsers({
        search, status: statusFilter, plan: planFilter, role: roleFilter,
        sort: sortCol, order: sortDir, page,
      });
      setUsers(d.users);
      setTotal(d.total);
      setPages(d.pages);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, statusFilter, planFilter, roleFilter, sortCol, sortDir, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const sortIndicator = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const selectStyles = {
    padding: '7px 10px', borderRadius: 6, border: `1px solid ${colors.border}`,
    background: colors.bg, color: colors.text, fontSize: 12, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input data-testid="input-admin-search" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name or email..."
            style={{
              flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 8,
              border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text,
              fontSize: 13, outline: 'none',
            }} />
          <select data-testid="filter-status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={selectStyles}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
          <select data-testid="filter-plan" value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1); }} style={selectStyles}>
            <option value="">All plans</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </select>
          <select data-testid="filter-role" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} style={selectStyles}>
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 2fr 90px 90px 70px 100px',
            padding: '10px 16px', background: adminColors.headerBg,
            borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textDim,
            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <div style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Name{sortIndicator('name')}</div>
            <div style={{ cursor: 'pointer' }} onClick={() => handleSort('email')}>Email{sortIndicator('email')}</div>
            <div>Plan</div>
            <div>Status</div>
            <div>Role</div>
            <div style={{ cursor: 'pointer' }} onClick={() => handleSort('createdAt')}>Joined{sortIndicator('createdAt')}</div>
          </div>

          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted }}>No users found</div>
          ) : (
            users.map(u => (
              <div key={u.id} data-testid={`admin-user-row-${u.id}`}
                style={{
                  display: 'grid', gridTemplateColumns: '2fr 2fr 90px 90px 70px 100px',
                  padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
                  alignItems: 'center', cursor: 'pointer',
                  background: selectedUser === u.id ? adminColors.rowHover : 'transparent',
                }}
                onClick={() => setSelectedUser(u.id)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{u.name}</div>
                  {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                    <span style={{ fontSize: 10, color: colors.accentRed }}>🔒 Locked</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
                <div><PlanBadge plan={u.planName} /></div>
                <div><StatusBadge status={u.status} /></div>
                <div style={{ fontSize: 11, color: u.role === 'admin' ? colors.accentPurple : colors.textMuted }}>
                  {u.role}
                </div>
                <div style={{ fontSize: 11, color: colors.textDim }}>
                  {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 12, color: colors.textDim }}>{total} total users</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: page <= 1 ? colors.textDim : colors.text, cursor: page <= 1 ? 'default' : 'pointer', fontSize: 12 }}>
                Prev
              </button>
              <span style={{ padding: '6px 12px', fontSize: 12, color: colors.textMuted }}>
                Page {page} of {pages}
              </span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: page >= pages ? colors.textDim : colors.text, cursor: page >= pages ? 'default' : 'pointer', fontSize: 12 }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedUser && (
        <UserDetailPanel userId={selectedUser} onClose={() => setSelectedUser(null)} onRefresh={loadUsers} />
      )}
    </div>
  );
}

function UserDetailPanel({ userId, onClose, onRefresh }: { userId: string; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'info' | 'activity' | 'audit' | 'billing' | 'notes'>('info');
  const [confirmAction, setConfirmAction] = useState<{ type: string; title: string; message: string; color: string; data?: any } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [reason, setReason] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getUser(userId);
      setDetail(d);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const executeAction = async () => {
    if (!confirmAction || !detail) return;
    try {
      switch (confirmAction.type) {
        case 'suspend':
          await adminApi.updateUserStatus(detail.user.id, 'suspended', reason);
          break;
        case 'restore':
          await adminApi.updateUserStatus(detail.user.id, 'active', reason);
          break;
        case 'softDelete':
          await adminApi.updateUserStatus(detail.user.id, 'deleted', reason);
          break;
        case 'hardDelete':
          await adminApi.hardDeleteUser(detail.user.id);
          break;
        case 'unlock':
          await adminApi.unlockUser(detail.user.id);
          break;
        case 'changePlan':
          await adminApi.updateUserPlan(detail.user.id, confirmAction.data.planSlug);
          break;
        case 'changeRole':
          await adminApi.updateUserRole(detail.user.id, confirmAction.data.role);
          break;
        case 'changeSubStatus':
          await adminApi.updateSubscriptionStatus(detail.user.id, confirmAction.data.status, reason);
          break;
        case 'setTrial':
          await adminApi.setTrial(detail.user.id, confirmAction.data.trialEndDate);
          break;
      }
      setConfirmAction(null);
      setReason('');
      await loadDetail();
      onRefresh();
    } catch (err: any) {
      const msg = err?.error || err?.message || 'Action failed';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await adminApi.addNote(userId, noteText.trim());
    setNoteText('');
    await loadDetail();
  };

  const deleteNote = async (noteId: string) => {
    await adminApi.deleteNote(noteId);
    await loadDetail();
  };

  if (loading) return (
    <div style={{ width: 420, background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, alignSelf: 'flex-start' }}>
      <div style={{ color: colors.textMuted, padding: 20 }}>Loading...</div>
    </div>
  );

  if (!detail) return null;

  const { user, plan, subscription, stats, recentActivity, auditHistory, billingEvents: userBillingEvents, adminNotes: userNotes } = detail;
  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  const sectionTabs: { id: typeof activeSection; label: string }[] = [
    { id: 'info', label: 'Profile' },
    { id: 'activity', label: 'Activity' },
    { id: 'audit', label: 'History' },
    { id: 'billing', label: 'Billing' },
    { id: 'notes', label: `Notes${userNotes?.length ? ` (${userNotes.length})` : ''}` },
  ];

  return (
    <div data-testid="user-detail-panel" style={{
      width: 420, background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12,
      padding: 0, alignSelf: 'flex-start', overflow: 'hidden', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto',
    }}>
      <div style={{
        padding: '20px 24px', borderBottom: `1px solid ${colors.border}`, background: adminColors.headerBg,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            {user.name}
            {user.role === 'admin' && <Badge label="Admin" color={colors.accentPurple} bg={adminColors.badgePurple} />}
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 2 }}>{user.email}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <StatusBadge status={user.status} />
            <PlanBadge plan={plan?.name || 'None'} />
            {isLocked && <Badge label="Locked" color={colors.accentRed} bg={adminColors.badgeRed} />}
            {subscription?.status === 'trialing' && <Badge label="Trial" color="#06b6d4" bg="rgba(6,182,212,0.15)" />}
          </div>
        </div>
        <button data-testid="button-close-detail" onClick={onClose}
          style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 18, padding: 4 }}>✕</button>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 82, background: adminColors.cardBg, zIndex: 1 }}>
        {sectionTabs.map(t => (
          <button key={t.id} onClick={() => setActiveSection(t.id)}
            style={{
              flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
              color: activeSection === t.id ? colors.accent : colors.textDim,
              fontSize: 11, fontWeight: activeSection === t.id ? 600 : 400, cursor: 'pointer',
              borderBottom: activeSection === t.id ? `2px solid ${colors.accent}` : '2px solid transparent',
            }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 24 }}>
        {activeSection === 'info' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Workspaces', value: stats.workspaces, color: colors.accent },
                { label: 'Projects', value: stats.projects, color: '#f59e0b' },
                { label: 'Tasks', value: stats.tasks, color: '#06b6d4' },
                { label: 'Notes', value: stats.notes, color: colors.accentPurple },
              ].map(s => (
                <div key={s.label} style={{ background: colors.bg, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>Account Details</div>
              <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 2 }}>
                <div>Joined: {new Date(user.createdAt).toLocaleDateString()} {new Date(user.createdAt).toLocaleTimeString()}</div>
                {user.lastLoginAt && <div>Last login: {new Date(user.lastLoginAt).toLocaleDateString()} {new Date(user.lastLoginAt).toLocaleTimeString()}</div>}
                {subscription && <div>Period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</div>}
                <div>Failed logins: {user.failedLoginCount || 0}</div>
                {user.deletedAt && <div style={{ color: colors.accentRed }}>Deleted: {new Date(user.deletedAt).toLocaleDateString()}</div>}
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Admin Actions</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <select data-testid="select-plan" defaultValue={plan?.slug || 'starter'}
                onChange={e => setConfirmAction({
                  type: 'changePlan', title: 'Change Plan',
                  message: `Change ${user.name}'s plan to ${e.target.value.toUpperCase()}?`,
                  color: colors.accent, data: { planSlug: e.target.value },
                })}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="elite">Elite</option>
              </select>

              <select data-testid="select-role" defaultValue={user.role}
                onChange={e => setConfirmAction({
                  type: 'changeRole', title: 'Change Role',
                  message: `Change ${user.name}'s role to ${e.target.value.toUpperCase()}?`,
                  color: colors.accentPurple, data: { role: e.target.value },
                })}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {user.status === 'active' && (
                <button data-testid="button-suspend" onClick={() => setConfirmAction({
                  type: 'suspend', title: 'Suspend Account',
                  message: `Suspend ${user.name}'s account? They will not be able to log in until restored.`,
                  color: colors.accentYellow,
                })} style={actionBtn(colors.accentYellow)}>⏸ Suspend</button>
              )}
              {user.status === 'suspended' && (
                <button data-testid="button-restore" onClick={() => setConfirmAction({
                  type: 'restore', title: 'Restore Account',
                  message: `Restore ${user.name}'s account to active status?`,
                  color: colors.accentGreen,
                })} style={actionBtn(colors.accentGreen)}>✓ Restore</button>
              )}
              {isLocked && (
                <button data-testid="button-unlock" onClick={() => setConfirmAction({
                  type: 'unlock', title: 'Unlock Account',
                  message: `Unlock ${user.name}'s account? This resets failed login attempts.`,
                  color: colors.accent,
                })} style={actionBtn(colors.accent)}>🔓 Unlock</button>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: colors.accentRed, fontWeight: 600, marginBottom: 8 }}>Danger Zone</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {user.status !== 'deleted' && (
                  <button data-testid="button-soft-delete" onClick={() => setConfirmAction({
                    type: 'softDelete', title: 'Soft Delete Account',
                    message: `Soft-delete ${user.name}'s account? Their data will be preserved but they will not be able to log in.`,
                    color: colors.accentRed,
                  })} style={dangerBtn}>Soft Delete</button>
                )}
                {user.status === 'deleted' && (
                  <button data-testid="button-hard-delete" onClick={() => setConfirmAction({
                    type: 'hardDelete', title: 'Permanently Delete',
                    message: `PERMANENTLY delete ${user.name}? This cannot be undone. The user must have no workspaces or projects.`,
                    color: colors.accentRed,
                  })} style={{ ...dangerBtn, background: 'rgba(248,81,73,0.15)' }}>Hard Delete</button>
                )}
              </div>
            </div>
          </>
        )}

        {activeSection === 'activity' && (
          <div>
            {(recentActivity || []).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>No recent activity</div>
            ) : (
              recentActivity.map((a: any) => (
                <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: colors.text }}>{a.action.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 10, color: colors.textDim }}>{timeAgo(a.createdAt)}</span>
                  </div>
                  {a.details && <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2 }}>{a.targetType}: {a.targetName || a.targetId}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === 'audit' && (
          <div>
            {(auditHistory || []).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>No audit history</div>
            ) : (
              auditHistory.map((a: any) => (
                <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <ActionBadge action={a.action} />
                    <span style={{ fontSize: 10, color: colors.textDim }}>{timeAgo(a.createdAt)}</span>
                  </div>
                  {a.details && (
                    <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4, background: colors.bg, padding: '6px 10px', borderRadius: 6, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {JSON.stringify(a.details)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === 'billing' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Subscription Management</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <select data-testid="select-sub-status" defaultValue={subscription?.status || 'active'}
                  onChange={e => setConfirmAction({
                    type: 'changeSubStatus', title: 'Override Subscription Status',
                    message: `Change subscription status to "${e.target.value}"?`,
                    color: colors.accent, data: { status: e.target.value },
                  })}
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="trialing">Trialing</option>
                  <option value="expired">Expired</option>
                </select>
                <button data-testid="button-set-trial" onClick={() => {
                  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  const input = prompt('Trial end date (YYYY-MM-DD):', d);
                  if (input) setConfirmAction({
                    type: 'setTrial', title: 'Set Trial Period',
                    message: `Set a trial period ending on ${input}?`,
                    color: '#06b6d4', data: { trialEndDate: input },
                  });
                }} style={actionBtn('#06b6d4')}>⏳ Set Trial</button>
              </div>
              {subscription && (
                <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 2 }}>
                  <div>Status: <span style={{ color: colors.text }}>{subscription.status}</span></div>
                  <div>Period: {new Date(subscription.currentPeriodStart).toLocaleDateString()} — {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</div>
                  {subscription.cancelAtPeriodEnd && <div style={{ color: colors.accentYellow }}>Cancels at period end</div>}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 10 }}>Billing Events</div>
            {(userBillingEvents || []).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>No billing events</div>
            ) : (
              userBillingEvents.map((e: any) => (
                <div key={e.id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge label={e.eventType.replace(/_/g, ' ')} color={colors.accent} bg={adminColors.badgeBlue} />
                    <span style={{ fontSize: 10, color: colors.textDim }}>{timeAgo(e.createdAt)}</span>
                  </div>
                  {e.amount != null && <div style={{ fontSize: 12, color: colors.accentGreen, marginTop: 4 }}>${(e.amount / 100).toFixed(2)}</div>}
                  {e.metadata && (
                    <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, fontFamily: 'monospace' }}>
                      {JSON.stringify(e.metadata)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeSection === 'notes' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <textarea data-testid="input-admin-note" value={noteText} onChange={e => setNoteText(e.target.value)}
                placeholder="Add an internal note about this user..."
                rows={3} style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`,
                  background: colors.bg, color: colors.text, fontSize: 13, outline: 'none', resize: 'vertical',
                  boxSizing: 'border-box', fontFamily: 'inherit',
                }} />
              <button data-testid="button-add-note" onClick={addNote} disabled={!noteText.trim()}
                style={{
                  marginTop: 8, padding: '6px 16px', borderRadius: 6, border: 'none',
                  background: noteText.trim() ? colors.accent : colors.bgHover,
                  color: noteText.trim() ? '#fff' : colors.textDim, fontSize: 12, fontWeight: 600, cursor: noteText.trim() ? 'pointer' : 'default',
                }}>Add Note</button>
            </div>

            {(userNotes || []).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textDim, fontSize: 13 }}>No admin notes yet</div>
            ) : (
              userNotes.map((n: any) => (
                <div key={n.id} data-testid={`admin-note-${n.id}`} style={{
                  padding: 14, background: colors.bg, borderRadius: 8, marginBottom: 10,
                  border: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: colors.accent, fontWeight: 500 }}>{n.adminName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: colors.textDim }}>{timeAgo(n.createdAt)}</span>
                      <button onClick={() => deleteNote(n.id)}
                        style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 12 }}
                        onMouseEnter={e => (e.currentTarget.style.color = colors.accentRed)}
                        onMouseLeave={e => (e.currentTarget.style.color = colors.textDim)}>✕</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: colors.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.content}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={confirmAction?.title || 'Confirm'}
        confirmColor={confirmAction?.color || colors.accent}
        onConfirm={executeAction}
        onCancel={() => { setConfirmAction(null); setReason(''); }}
      >
        {(confirmAction?.type === 'suspend' || confirmAction?.type === 'softDelete' || confirmAction?.type === 'changeSubStatus') && (
          <input data-testid="input-reason" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`,
              background: colors.bg, color: colors.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }} />
        )}
      </ConfirmModal>
    </div>
  );
}

const actionBtn = (color: string): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 6, border: `1px solid ${color}33`,
  background: `${color}15`, color, fontSize: 12, fontWeight: 500, cursor: 'pointer',
});

const dangerBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: `1px solid ${colors.accentRed}33`,
  background: 'transparent', color: colors.accentRed, fontSize: 12, fontWeight: 500, cursor: 'pointer',
};

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getAuditLog({ page, action: actionFilter, search });
      setLogs(d.logs);
      setTotal(d.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, actionFilter, search]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const actionTypes = [
    'user_suspended', 'user_reactivated', 'user_deleted', 'user_hard_deleted',
    'user_role_changed', 'user_plan_changed', 'subscription_status_changed',
    'trial_set', 'user_unlocked', 'admin_note_added', 'login_success', 'login_failed',
  ];

  return (
    <div data-testid="admin-audit">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input data-testid="input-audit-search" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search audit logs..."
          style={{
            flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text,
            fontSize: 13, outline: 'none',
          }} />
        <select data-testid="filter-action" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}>
          <option value="">All actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted }}>Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>No audit logs found</div>
        ) : (
          logs.map((log, i) => (
            <div key={log.id} data-testid={`audit-log-${log.id}`} style={{
              padding: '14px 20px', borderBottom: i < logs.length - 1 ? `1px solid ${colors.border}` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ActionBadge action={log.action} />
                  <span style={{ fontSize: 12, color: colors.textMuted }}>by <span style={{ color: colors.text }}>{log.adminName}</span></span>
                </div>
                <span style={{ fontSize: 11, color: colors.textDim }}>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              {log.targetUserName && (
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
                  Target: <span style={{ color: colors.text }}>{log.targetUserName}</span>
                  <span style={{ color: colors.textDim, fontSize: 10 }}> ({log.targetUserId?.slice(0, 8)}...)</span>
                </div>
              )}
              {log.details && Object.keys(log.details).length > 0 && (
                <div style={{
                  fontSize: 11, color: colors.textDim, background: colors.bg, padding: '6px 10px',
                  borderRadius: 6, fontFamily: 'monospace', marginTop: 6, wordBreak: 'break-all',
                }}>
                  {Object.entries(log.details).map(([k, v]) => (
                    <span key={k} style={{ marginRight: 12 }}>{k}: <span style={{ color: colors.textMuted }}>{String(v)}</span></span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {total > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: page <= 1 ? colors.textDim : colors.text, cursor: page <= 1 ? 'default' : 'pointer', fontSize: 12 }}>
            Prev
          </button>
          <span style={{ padding: '6px 12px', fontSize: 12, color: colors.textMuted }}>Page {page}</span>
          <button onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 12 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function BillingTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getBillingEvents({ page, eventType: eventTypeFilter });
      setEvents(d.events);
      setTotal(d.total);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, eventTypeFilter]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await adminApi.retryBillingEvent(id);
      toast('Event retried', 'success');
      await loadEvents();
    } catch (err: any) {
      toast(`Retry failed: ${err.error || err.message}`, 'error');
    } finally {
      setRetrying(null);
    }
  };

  const eventTypes = [
    'plan_changed_by_admin', 'subscription_status_override', 'trial_set_by_admin',
    'plan_upgraded', 'plan_downgraded', 'subscription_created', 'subscription_canceled',
    'addon_subscribed', 'addon_cancel_scheduled',
  ];

  return (
    <div data-testid="admin-billing">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select data-testid="filter-event-type" value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); setPage(1); }}
          style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}>
          <option value="">All event types</option>
          {eventTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.9fr 0.9fr 0.8fr',
          padding: '10px 16px', background: adminColors.headerBg,
          borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textDim,
          fontWeight: 600, textTransform: 'uppercase',
        }}>
          <div>Event</div>
          <div>User</div>
          <div>Amount</div>
          <div>Date / status</div>
          <div></div>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: colors.textMuted }}>Loading billing events...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>No billing events</div>
        ) : (
          events.map(e => {
            const isFailed = !!e.errorMessage || (e.eventType || '').endsWith('_failed');
            const unprocessed = !e.processedAt;
            return (
              <div key={e.id} data-testid={`billing-event-${e.id}`} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.9fr 0.9fr 0.8fr',
                padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, alignItems: 'center', gap: 8,
              }}>
                <div>
                  <Badge
                    label={e.eventType.replace(/_/g, ' ')}
                    color={isFailed ? colors.accentRed : colors.accent}
                    bg={isFailed ? adminColors.badgeRed : adminColors.badgeBlue}
                  />
                  {e.errorMessage && (
                    <div data-testid={`billing-error-${e.id}`} style={{ fontSize: 10, color: colors.accentRed, marginTop: 4 }}>
                      {e.errorMessage}
                    </div>
                  )}
                  {e.metadata && (
                    <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, fontFamily: 'monospace' }}>
                      {Object.entries(e.metadata).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: colors.text }}>{e.userName}</div>
                <div style={{ fontSize: 13, color: e.amount ? colors.accentGreen : colors.textDim }}>
                  {e.amount ? `$${(e.amount / 100).toFixed(2)}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: colors.textDim }}>
                  <div>{new Date(e.createdAt).toLocaleDateString()}</div>
                  <div style={{ color: unprocessed ? colors.accentYellow : colors.accentGreen }}>
                    {unprocessed ? `unprocessed${e.retryCount ? ` · ${e.retryCount} retries` : ''}` : 'processed'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {unprocessed && (
                    <button
                      data-testid={`button-retry-${e.id}`}
                      onClick={() => retry(e.id)}
                      disabled={retrying === e.id}
                      style={{
                        padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.accent}`,
                        background: 'transparent', color: colors.accent, fontSize: 11, fontWeight: 600,
                        cursor: retrying === e.id ? 'wait' : 'pointer',
                      }}
                    >{retrying === e.id ? '…' : 'Retry'}</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {total > 50 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: page <= 1 ? colors.textDim : colors.text, cursor: page <= 1 ? 'default' : 'pointer', fontSize: 12 }}>
            Prev
          </button>
          <span style={{ padding: '6px 12px', fontSize: 12, color: colors.textMuted }}>Page {page}</span>
          <button onClick={() => setPage(p => p + 1)}
            style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 12 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'modules', label: 'Modules', icon: '▦' },
    { id: 'audit', label: 'Audit Log', icon: '📋' },
    { id: 'billing', label: 'Billing', icon: '💳' },
  ];

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 36px)', maxWidth: 1500 }} data-testid="admin-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: `${colors.accentPurple}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>⛊</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Admin Control Center</h1>
          </div>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '6px 0 0 42px' }}>
            Manage users, monitor platform health, review audit trails
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, background: adminColors.headerBg,
        borderRadius: 10, padding: 4, width: 'fit-content',
      }}>
        {tabs.map(t => (
          <button key={t.id} data-testid={`admin-tab-${t.id}`} onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: tab === t.id ? colors.bgHover : 'transparent',
              color: tab === t.id ? '#fff' : colors.textMuted,
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'modules' && <ModulesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'billing' && <BillingTab />}
    </div>
  );
}

interface AdminModule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  planMin: string;
  baseUrl: string;
  category: string | null;
  ord: number;
  includedInPlans: string[];
}

interface ModuleMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  accessSource: 'plan' | 'addon' | 'override' | 'admin_role';
  planSlug: string | null;
  grant: boolean;
  reason: string | null;
  expiresAt: string | null;
}

function ModulesTab() {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminModule | null>(null);
  const [membersFor, setMembersFor] = useState<AdminModule | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getModules();
      setModules(d.modules);
    } catch (err: any) {
      toast(`Failed to load modules: ${err.error || err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const togglePlan = async (mod: AdminModule, planSlug: string) => {
    const next = mod.includedInPlans.includes(planSlug)
      ? mod.includedInPlans.filter(p => p !== planSlug)
      : [...mod.includedInPlans, planSlug];
    try {
      await adminApi.setModulePlanMapping(mod.slug, next);
      toast(`Updated ${mod.name} plan mapping`, 'success');
      await load();
    } catch (err: any) {
      toast(`Failed: ${err.error || err.message}`, 'error');
    }
  };

  const setStatus = async (mod: AdminModule, status: string) => {
    try {
      await adminApi.upsertModule({ slug: mod.slug, name: mod.name, status });
      toast(`Set ${mod.name} → ${status}`, 'success');
      await load();
    } catch (err: any) {
      toast(`Failed: ${err.error || err.message}`, 'error');
    }
  };

  if (loading) {
    return <div data-testid="admin-modules-loading" style={{ padding: 30, color: colors.textMuted }}>Loading modules...</div>;
  }

  return (
    <div data-testid="admin-modules">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: colors.textMuted }}>
          {modules.length} modules · plan mappings + status are editable; per-user grants live on the user detail page.
        </div>
        <button
          data-testid="button-new-module"
          onClick={() => setEditing({ id: '', slug: '', name: '', description: '', status: 'coming_soon', planMin: 'elite', baseUrl: '', category: 'app', ord: 99, includedInPlans: [] })}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >+ New Module</button>
      </div>

      <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr',
          padding: '10px 16px', background: adminColors.headerBg,
          borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textDim,
          fontWeight: 600, textTransform: 'uppercase',
        }}>
          <div>Module</div>
          <div>Status</div>
          <div>Min plan</div>
          <div>Included in</div>
          <div></div>
        </div>

        {modules.map(m => (
          <div key={m.slug} data-testid={`admin-module-${m.slug}`} style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr',
            padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, alignItems: 'center', gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{m.name}</div>
              <div style={{ fontSize: 11, color: colors.textDim, fontFamily: 'monospace' }}>{m.slug}</div>
            </div>
            <div>
              <select
                data-testid={`select-status-${m.slug}`}
                value={m.status}
                onChange={e => setStatus(m, e.target.value)}
                style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}
              >
                <option value="live">live</option>
                <option value="beta">beta</option>
                <option value="coming_soon">coming_soon</option>
                <option value="disabled">disabled</option>
              </select>
            </div>
            <div style={{ fontSize: 12, color: colors.text }}>{m.planMin}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['starter', 'pro', 'elite'] as const).map(p => {
                const on = m.includedInPlans.includes(p);
                return (
                  <button
                    key={p}
                    data-testid={`toggle-plan-${m.slug}-${p}`}
                    onClick={() => togglePlan(m, p)}
                    style={{
                      padding: '4px 8px', borderRadius: 6, border: `1px solid ${on ? colors.accent : colors.border}`,
                      background: on ? `${colors.accent}25` : 'transparent',
                      color: on ? colors.accent : colors.textMuted,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >{p}</button>
                );
              })}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                data-testid={`button-members-module-${m.slug}`}
                onClick={() => setMembersFor(m)}
                style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontSize: 11, cursor: 'pointer' }}
              >Members</button>
              <button
                data-testid={`button-edit-module-${m.slug}`}
                onClick={() => setEditing(m)}
                style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontSize: 11, cursor: 'pointer' }}
              >Edit</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ModuleEditor
          mod={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {membersFor && (
        <ModuleMembersDrawer
          mod={membersFor}
          onClose={() => setMembersFor(null)}
        />
      )}
    </div>
  );
}

function accessSourceBadge(source: 'plan' | 'addon' | 'override' | 'admin_role' | string, grant?: boolean) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    plan: { color: colors.accent, bg: adminColors.badgeBlue, label: 'plan' },
    addon: { color: colors.accentGreen, bg: adminColors.badgeGreen, label: 'addon' },
    override: grant === false
      ? { color: colors.accentRed, bg: adminColors.badgeRed, label: 'revoked' }
      : { color: colors.accentPurple, bg: adminColors.badgePurple, label: 'override' },
    admin_role: { color: colors.accentYellow, bg: adminColors.badgeYellow, label: 'admin' },
  };
  const meta = map[source] ?? { color: colors.textMuted, bg: 'rgba(139,148,158,0.15)', label: source };
  return (
    <span data-testid={`badge-source-${source}${grant === false ? '-revoke' : ''}`} style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{meta.label}</span>
  );
}

function ModuleMembersDrawer({ mod, onClose }: { mod: AdminModule; onClose: () => void }) {
  const [data, setData] = useState<{ members: ModuleMember[]; counts: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi.getModuleMembers(mod.slug);
      setData({ members: d.members, counts: d.counts });
    } catch (err: any) {
      toast(`Failed to load members: ${err.error || err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [mod.slug, toast]);

  useEffect(() => { load(); }, [load]);

  const grantOverride = async (userId: string, grant: boolean, reason?: string) => {
    setBusyUser(userId);
    try {
      await adminApi.setUserModuleOverride(userId, { moduleSlug: mod.slug, grant, reason: reason || (grant ? 'admin_grant' : 'admin_revoke') });
      toast(`${grant ? 'Granted' : 'Revoked'} ${mod.name} for user`, 'success');
      await load();
    } catch (err: any) {
      toast(`Failed: ${err.error || err.message}`, 'error');
    } finally {
      setBusyUser(null);
    }
  };

  const grantByEmail = async () => {
    if (!grantEmail.trim()) { toast('Enter an email first', 'error'); return; }
    try {
      const found = await adminApi.getUsers({ search: grantEmail.trim() });
      const u = (found.users || []).find((x: any) => x.email.toLowerCase() === grantEmail.trim().toLowerCase());
      if (!u) { toast(`No user found for ${grantEmail}`, 'error'); return; }
      await grantOverride(u.id, true, grantReason || 'admin_grant');
      setGrantEmail(''); setGrantReason('');
    } catch (err: any) {
      toast(`Failed: ${err.error || err.message}`, 'error');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div data-testid="module-members-drawer" style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: 28, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{mod.name} · members</div>
          <button onClick={onClose} data-testid="button-close-members" style={{ background: 'transparent', border: 'none', color: colors.textMuted, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: colors.textDim, fontFamily: 'monospace', marginBottom: 16 }}>{mod.slug}</div>

        {loading && <div data-testid="members-loading" style={{ color: colors.textMuted }}>Loading…</div>}

        {data && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12, color: colors.textMuted }}>
              <span data-testid="count-total"><strong style={{ color: '#fff' }}>{data.counts.total}</strong> total</span>
              <span data-testid="count-plan">plan: <strong style={{ color: colors.accent }}>{data.counts.plan}</strong></span>
              <span data-testid="count-addon">addon: <strong style={{ color: colors.accentGreen }}>{data.counts.addon}</strong></span>
              <span data-testid="count-grants">grants: <strong style={{ color: colors.accentPurple }}>{data.counts.override_grant}</strong></span>
              <span data-testid="count-revokes">revokes: <strong style={{ color: colors.accentRed }}>{data.counts.override_revoke}</strong></span>
            </div>

            <div style={{
              background: adminColors.cardBg, border: `1px solid ${colors.border}`,
              borderRadius: 10, padding: 12, marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                Grant access by email
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  data-testid="input-grant-email"
                  placeholder="user@example.com"
                  value={grantEmail}
                  onChange={e => setGrantEmail(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}
                />
                <input
                  data-testid="input-grant-reason"
                  placeholder="reason (optional)"
                  value={grantReason}
                  onChange={e => setGrantReason(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 12, outline: 'none' }}
                />
                <button
                  data-testid="button-grant-by-email"
                  onClick={grantByEmail}
                  style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: colors.accent, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >Grant</button>
              </div>
            </div>

            <div style={{ background: adminColors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 1fr 1.4fr',
                padding: '10px 14px', background: adminColors.headerBg,
                borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textDim,
                fontWeight: 600, textTransform: 'uppercase',
              }}>
                <div>User</div>
                <div>Role</div>
                <div>Source</div>
                <div>Plan</div>
                <div style={{ textAlign: 'right' }}>Action</div>
              </div>

              {data.members.length === 0 && (
                <div data-testid="members-empty" style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
                  No members yet. Use the form above to grant access.
                </div>
              )}

              {data.members.map(m => (
                <div key={m.userId} data-testid={`member-row-${m.userId}`} style={{
                  display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 1fr 1.4fr',
                  padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, alignItems: 'center', gap: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#fff' }}>{m.name || m.email}</div>
                    <div style={{ fontSize: 11, color: colors.textDim }}>{m.email}</div>
                  </div>
                  <div data-testid={`text-role-${m.userId}`}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                      background: m.role === 'admin' ? adminColors.badgeYellow : 'rgba(139,148,158,0.15)',
                      color: m.role === 'admin' ? colors.accentYellow : colors.textMuted,
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>{m.role}</span>
                  </div>
                  <div>{accessSourceBadge(m.accessSource, m.grant)}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{m.planSlug || '—'}</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {m.accessSource === 'admin_role' && (
                      // Admin-role users cannot be per-module revoked: the
                      // role grants global access and entitlement evaluation
                      // short-circuits on `admin_role` before considering
                      // overrides. Surface the constraint instead of showing
                      // a button that silently no-ops.
                      <span
                        data-testid={`text-revoke-disabled-${m.userId}`}
                        title="Admin role grants access globally. Demote the user from admin to control per-module access."
                        style={{ padding: '5px 10px', borderRadius: 6, border: `1px dashed ${colors.border}`, color: colors.textDim, fontSize: 11, fontWeight: 600, cursor: 'not-allowed' }}
                      >Admin (global)</span>
                    )}
                    {m.accessSource !== 'override' && m.accessSource !== 'admin_role' && (
                      <button
                        data-testid={`button-revoke-${m.userId}`}
                        disabled={busyUser === m.userId}
                        onClick={() => grantOverride(m.userId, false, 'admin_revoke')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.accentRed}`, background: 'transparent', color: colors.accentRed, fontSize: 11, fontWeight: 600, cursor: busyUser === m.userId ? 'wait' : 'pointer' }}
                      >Revoke</button>
                    )}
                    {m.accessSource === 'override' && !m.grant && (
                      <button
                        data-testid={`button-restore-${m.userId}`}
                        disabled={busyUser === m.userId}
                        onClick={() => grantOverride(m.userId, true, 'admin_restore')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.accentGreen}`, background: 'transparent', color: colors.accentGreen, fontSize: 11, fontWeight: 600, cursor: busyUser === m.userId ? 'wait' : 'pointer' }}
                      >Restore</button>
                    )}
                    {m.accessSource === 'override' && m.grant && (
                      <button
                        data-testid={`button-revoke-${m.userId}`}
                        disabled={busyUser === m.userId}
                        onClick={() => grantOverride(m.userId, false, 'admin_revoke')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${colors.accentRed}`, background: 'transparent', color: colors.accentRed, fontSize: 11, fontWeight: 600, cursor: busyUser === m.userId ? 'wait' : 'pointer' }}
                      >Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModuleEditor({ mod, onClose, onSaved }: { mod: AdminModule; onClose: () => void; onSaved: () => void }) {
  const isNew = !mod.id;
  const [form, setForm] = useState({
    slug: mod.slug,
    name: mod.name,
    description: mod.description || '',
    baseUrl: mod.baseUrl || '',
    status: mod.status,
    planMin: mod.planMin,
    category: mod.category || 'app',
    ord: mod.ord,
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.upsertModule(form);
      toast(isNew ? 'Module created' : 'Module updated', 'success');
      onSaved();
    } catch (err: any) {
      toast(`Failed: ${err.error || err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div data-testid="module-editor" style={{
        background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: 28, width: 520, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
          {isNew ? 'New module' : `Edit ${mod.name}`}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Slug" testId="input-slug">
            <input
              data-testid="input-slug"
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              disabled={!isNew}
              style={inputStyle()}
            />
          </Field>
          <Field label="Name" testId="input-name">
            <input data-testid="input-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputStyle()} />
          </Field>
          <Field label="Description" testId="input-description">
            <textarea data-testid="input-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} style={inputStyle()} />
          </Field>
          <Field label="Base URL" testId="input-baseurl">
            <input data-testid="input-baseurl" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://module.example.com" style={inputStyle()} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Status" testId="input-status">
              <select data-testid="input-status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle()}>
                <option value="live">live</option>
                <option value="beta">beta</option>
                <option value="coming_soon">coming_soon</option>
                <option value="disabled">disabled</option>
              </select>
            </Field>
            <Field label="Min plan" testId="input-planmin">
              <select data-testid="input-planmin" value={form.planMin} onChange={e => setForm({ ...form, planMin: e.target.value })} style={inputStyle()}>
                <option value="starter">starter</option>
                <option value="pro">pro</option>
                <option value="elite">elite</option>
              </select>
            </Field>
            <Field label="Order" testId="input-ord">
              <input data-testid="input-ord" type="number" value={form.ord} onChange={e => setForm({ ...form, ord: parseInt(e.target.value) || 0 })} style={inputStyle()} />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} data-testid="button-cancel-module"
            style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} data-testid="button-save-module"
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; testId: string; children: any }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    padding: '8px 10px', borderRadius: 6, border: `1px solid ${colors.border}`,
    background: colors.bg, color: colors.text, fontSize: 13, outline: 'none', width: '100%',
  };
}
