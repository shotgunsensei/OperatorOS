'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { useToast } from '../Toast';

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

function UsageGauge({ label, used, limit, percentage }: { label: string; used: number; limit: number; percentage: number }) {
  const isUnlimited = limit >= 999;
  const displayLimit = isUnlimited ? '\u221e' : limit;
  const barColor = percentage > 90 ? colors.accentRed : percentage > 70 ? colors.accentYellow : colors.accent;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: colors.textMuted }}>{label}</span>
        <span style={{ color: percentage > 80 ? colors.accentYellow : colors.text }}>{used} / {displayLimit}</span>
      </div>
      <div style={{ height: 4, background: colors.bg, borderRadius: 2 }}>
        <div style={{
          height: '100%', borderRadius: 2, width: isUnlimited ? '3%' : `${percentage}%`,
          background: barColor, transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    saasApi.dashboard().then(setData).catch(() => toast('Failed to load dashboard', 'error')).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ width: 200, height: 24, background: colors.bgSecondary, borderRadius: 6, marginBottom: 12 }} />
        <div style={{ width: 300, height: 14, background: colors.bgSecondary, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: '1 1 200px', minWidth: 180, height: 88, background: colors.bgSecondary, borderRadius: 12, border: `1px solid ${colors.border}` }} />
        ))}
      </div>
    </div>
  );
  if (!data) return <div style={{ padding: 40, color: colors.accentRed }}>Failed to load dashboard</div>;

  const { stats, limits, usage, features, recentActivity } = data;

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 1200 }} data-testid="dashboard-page">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>
          Your operations at a glance
          <span style={{
            display: 'inline-block', marginLeft: 10, padding: '2px 10px',
            borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: limits.planSlug === 'elite' ? 'rgba(188,140,255,0.15)' : limits.planSlug === 'pro' ? 'rgba(88,166,255,0.15)' : 'rgba(139,148,158,0.15)',
            color: limits.planSlug === 'elite' ? colors.accentPurple : limits.planSlug === 'pro' ? colors.accent : colors.textMuted,
          }} data-testid="plan-badge">{limits.planName}</span>
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Workspaces" value={stats.workspaces} icon="\u2b21" color={colors.accent} />
        <StatCard label="Projects" value={stats.projects} icon="\u25e7" color={colors.accentGreen} />
        <StatCard label="Tasks" value={stats.tasks} icon="\u2611" color={colors.accentYellow} />
        <StatCard label="Notes" value={stats.notes} icon="\u25ea" color={colors.accentPurple} />
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
          {usage ? (
            <>
              <UsageGauge label="Workspaces" {...usage.workspaces} />
              <UsageGauge label="Projects" {...usage.projects} />
              <UsageGauge label="Tasks" {...usage.tasks} />
              <UsageGauge label="AI Actions" {...usage.aiActions} />
            </>
          ) : (
            <>
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
                      <span style={{ color: pct > 80 ? colors.accentYellow : colors.text }}>{u.used} / {u.max >= 999 ? '\u221e' : u.max}</span>
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
            </>
          )}
        </div>
      </div>

      {features && (
        <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(features).map(([key, enabled]: [string, any]) => (
            <span key={key} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11,
              background: enabled ? 'rgba(63,185,80,0.08)' : 'rgba(139,148,158,0.06)',
              border: `1px solid ${enabled ? colors.accentGreen + '33' : colors.border}`,
              color: enabled ? colors.accentGreen : colors.textDim,
            }}>
              {enabled ? '\u2713' : '\ud83d\udd12'} {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
            </span>
          ))}
        </div>
      )}

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
                  <span style={{ fontSize: 13, color: colors.textMuted }}> \u00b7 {a.entityType}</span>
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
