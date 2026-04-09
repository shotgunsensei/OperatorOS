'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

type Tab = 'users' | 'metrics' | 'audit';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userDetail, setUserDetail] = useState<any>(null);

  const loadUsers = async (s?: string) => {
    setLoading(true);
    try {
      const d = await adminApi.getUsers({ search: s || search });
      setUsers(d.users);
    } catch {} finally { setLoading(false); }
  };

  const loadMetrics = async () => {
    setLoading(true);
    try { const d = await adminApi.getMetrics(); setMetrics(d); } catch {} finally { setLoading(false); }
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    try { const d = await adminApi.getAuditLog(); setAuditLogs(d.logs); } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else if (tab === 'metrics') loadMetrics();
    else if (tab === 'audit') loadAuditLogs();
  }, [tab]);

  const handleStatusChange = async (userId: string, status: string) => {
    await adminApi.updateUserStatus(userId, status);
    await loadUsers();
    if (userDetail?.user?.id === userId) {
      const d = await adminApi.getUser(userId);
      setUserDetail(d);
    }
  };

  const handlePlanChange = async (userId: string, planSlug: string) => {
    await adminApi.updateUserPlan(userId, planSlug);
    await loadUsers();
    if (userDetail?.user?.id === userId) {
      const d = await adminApi.getUser(userId);
      setUserDetail(d);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await adminApi.updateUserRole(userId, role);
    await loadUsers();
  };

  const viewUser = async (userId: string) => {
    const d = await adminApi.getUser(userId);
    setUserDetail(d);
    setSelectedUser(userId);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This action is irreversible.')) return;
    await adminApi.deleteUser(userId);
    setSelectedUser(null);
    setUserDetail(null);
    await loadUsers();
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400 }} data-testid="admin-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Admin Panel</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 24px' }}>Manage users, monitor platform metrics, and review audit logs</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['users', 'metrics', 'audit'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedUser(null); }}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: tab === t ? colors.bgHover : 'transparent',
              color: tab === t ? colors.accent : colors.textMuted,
              fontSize: 13, fontWeight: tab === t ? 600 : 400, cursor: 'pointer',
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 16 }}>
              <input data-testid="input-admin-search" value={search}
                onChange={e => { setSearch(e.target.value); loadUsers(e.target.value); }}
                placeholder="Search users by name or email..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {loading ? (
              <div style={{ padding: 20, color: colors.textMuted }}>Loading users...</div>
            ) : (
              <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px', padding: '10px 16px', borderBottom: `1px solid ${colors.border}`, fontSize: 11, color: colors.textDim, fontWeight: 600, textTransform: 'uppercase' }}>
                  <div>Name</div><div>Email</div><div>Plan</div><div>Status</div><div>Actions</div>
                </div>
                {users.map(u => (
                  <div key={u.id} data-testid={`admin-user-row-${u.id}`}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 100px 100px 80px',
                      padding: '12px 16px', borderBottom: `1px solid ${colors.border}`,
                      alignItems: 'center', cursor: 'pointer',
                      background: selectedUser === u.id ? colors.bgHover : 'transparent',
                    }}
                    onClick={() => viewUser(u.id)}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{u.name}</div>
                      {u.role === 'admin' && <span style={{ fontSize: 10, color: colors.accentPurple }}>admin</span>}
                    </div>
                    <div style={{ fontSize: 13, color: colors.textMuted }}>{u.email}</div>
                    <div style={{ fontSize: 12, color: colors.accent }}>{u.planName}</div>
                    <div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: u.status === 'active' ? 'rgba(63,185,80,0.15)' : u.status === 'suspended' ? 'rgba(210,153,34,0.15)' : 'rgba(139,148,158,0.15)',
                        color: u.status === 'active' ? colors.accentGreen : u.status === 'suspended' ? colors.accentYellow : colors.textMuted,
                      }}>{u.status}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); handleStatusChange(u.id, u.status === 'suspended' ? 'active' : 'suspended'); }}
                        title={u.status === 'suspended' ? 'Restore' : 'Suspend'}
                        style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 14 }}>
                        {u.status === 'suspended' ? '✓' : '⏸'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {userDetail && (
            <div style={{ width: 380, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, alignSelf: 'flex-start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{userDetail.user.name}</div>
                  <div style={{ fontSize: 13, color: colors.textMuted }}>{userDetail.user.email}</div>
                </div>
                <button onClick={() => { setSelectedUser(null); setUserDetail(null); }}
                  style={{ background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: colors.bg, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{userDetail.stats.projects}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>Projects</div>
                </div>
                <div style={{ background: colors.bg, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{userDetail.stats.tasks}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted }}>Tasks</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Role</label>
                <select value={userDetail.user.role} onChange={e => handleRoleChange(userDetail.user.id, e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 13, outline: 'none' }}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Plan</label>
                <select value={userDetail.plan?.slug || 'starter'} onChange={e => handlePlanChange(userDetail.user.id, e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 13, outline: 'none' }}>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: colors.textMuted, display: 'block', marginBottom: 4 }}>Status</label>
                <select value={userDetail.user.status} onChange={e => handleStatusChange(userDetail.user.id, e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 13, outline: 'none' }}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div style={{ fontSize: 12, color: colors.textDim, marginBottom: 16 }}>
                <div>Joined: {new Date(userDetail.user.createdAt).toLocaleDateString()}</div>
                {userDetail.user.lastLoginAt && <div>Last login: {new Date(userDetail.user.lastLoginAt).toLocaleDateString()}</div>}
              </div>

              <button data-testid="button-delete-user" onClick={() => handleDeleteUser(userDetail.user.id)}
                style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${colors.accentRed}`, background: 'transparent', color: colors.accentRed, fontSize: 13, cursor: 'pointer' }}>
                Delete user
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'metrics' && metrics && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Users', value: metrics.users.total, color: colors.accent },
              { label: 'Active', value: metrics.users.active, color: colors.accentGreen },
              { label: 'Suspended', value: metrics.users.suspended, color: colors.accentYellow },
              { label: 'Workspaces', value: metrics.content.workspaces, color: colors.accentPurple },
              { label: 'Projects', value: metrics.content.projects, color: '#f59e0b' },
              { label: 'Tasks', value: metrics.content.tasks, color: '#06b6d4' },
            ].map(m => (
              <div key={m.label} style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Subscriptions by Plan</h3>
            {Object.entries(metrics.subscriptions).map(([plan, count]) => (
              <div key={plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 14 }}>
                <span style={{ color: colors.text, textTransform: 'capitalize' }}>{plan}</span>
                <span style={{ color: colors.accent, fontWeight: 600 }}>{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 20, color: colors.textMuted }}>Loading audit logs...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>No audit logs yet</div>
          ) : (
            auditLogs.map((log, i) => (
              <div key={log.id} style={{ padding: '12px 20px', borderBottom: i < auditLogs.length - 1 ? `1px solid ${colors.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{log.action.replace(/_/g, ' ')}</span>
                  {log.targetUserId && <span style={{ fontSize: 12, color: colors.textMuted }}> · target: {log.targetUserId.slice(0, 8)}...</span>}
                </div>
                <span style={{ fontSize: 11, color: colors.textDim }}>{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
