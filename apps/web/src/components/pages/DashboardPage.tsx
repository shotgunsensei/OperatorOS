'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <div style={{
      background: colors.bgSecondary, border: `1px solid ${colors.border}`,
      borderRadius: 12, padding: '20px 24px', flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{value}</div>
        </div>
        <div style={{ fontSize: 24, color, opacity: 0.7 }}>{icon}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saasApi.dashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40, color: colors.textMuted }}>Loading dashboard...</div>;
  if (!data) return <div style={{ padding: 40, color: colors.accentRed }}>Failed to load dashboard</div>;

  const { stats, limits, recentActivity } = data;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="dashboard-page">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>
          Your operations at a glance · {limits.planName} plan
          <span style={{
            display: 'inline-block', marginLeft: 10, padding: '2px 10px',
            borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: limits.planSlug === 'elite' ? 'rgba(188,140,255,0.15)' : limits.planSlug === 'pro' ? 'rgba(88,166,255,0.15)' : 'rgba(139,148,158,0.15)',
            color: limits.planSlug === 'elite' ? colors.accentPurple : limits.planSlug === 'pro' ? colors.accent : colors.textMuted,
          }} data-testid="plan-badge">{limits.planName}</span>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Workspaces" value={stats.workspaces} icon="⬡" color={colors.accent} />
        <StatCard label="Projects" value={stats.projects} icon="◧" color={colors.accentGreen} />
        <StatCard label="Tasks" value={stats.tasks} icon="☑" color={colors.accentYellow} />
        <StatCard label="Notes" value={stats.notes} icon="◪" color={colors.accentPurple} />
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{
          flex: '1 1 300px', background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: 24,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Task Overview</h3>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'To Do', value: stats.tasksByStatus.todo, color: colors.textMuted },
              { label: 'In Progress', value: stats.tasksByStatus.inProgress, color: colors.accentYellow },
              { label: 'Done', value: stats.tasksByStatus.done, color: colors.accentGreen },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '12px 0', background: colors.bg, borderRadius: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          flex: '1 1 300px', background: colors.bgSecondary, border: `1px solid ${colors.border}`,
          borderRadius: 12, padding: 24,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Plan Usage</h3>
          {[
            { label: 'Workspaces', used: stats.workspaces, max: limits.maxWorkspaces },
            { label: 'Projects', used: stats.projects, max: limits.maxProjects },
            { label: 'Tasks', used: stats.tasks, max: limits.maxTasks },
          ].map(u => {
            const pct = Math.min((u.used / u.max) * 100, 100);
            return (
              <div key={u.label} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: colors.textMuted }}>{u.label}</span>
                  <span style={{ color: pct > 80 ? colors.accentYellow : colors.text }}>{u.used} / {u.max >= 999 ? '∞' : u.max}</span>
                </div>
                <div style={{ height: 4, background: colors.bg, borderRadius: 2 }}>
                  <div style={{
                    height: '100%', borderRadius: 2, width: `${pct}%`,
                    background: pct > 90 ? colors.accentRed : pct > 70 ? colors.accentYellow : colors.accent,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        marginTop: 24, background: colors.bgSecondary, border: `1px solid ${colors.border}`,
        borderRadius: 12, padding: 24,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: colors.textMuted, fontSize: 13 }}>
            No recent activity. Start by creating a workspace!
          </div>
        ) : (
          <div>
            {recentActivity.map((a: any) => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: `1px solid ${colors.border}`,
              }}>
                <div>
                  <span style={{ fontSize: 13, color: colors.text }}>{a.action}</span>
                  <span style={{ fontSize: 13, color: colors.textMuted }}> · {a.entityType}</span>
                </div>
                <span style={{ fontSize: 11, color: colors.textDim }}>{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
