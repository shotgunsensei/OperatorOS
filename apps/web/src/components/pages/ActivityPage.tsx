'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import {
  Activity,
  Plus,
  UserPlus,
  CreditCard,
  Pencil,
  Trash2,
  Circle,
  type LucideIcon,
} from 'lucide-react';

const actionIcons: Record<string, LucideIcon> = {
  created: Plus,
  registered: UserPlus,
  subscribed: CreditCard,
  updated: Pencil,
  deleted: Trash2,
};

export default function ActivityPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saasApi.getActivity({ limit: 50 }).then(d => setActivities(d.activities)).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 900 }} data-testid="activity-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Activity Feed</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 24px' }}>Your recent actions across all workspaces</p>

      {loading ? (
        <div style={{ padding: 40, color: colors.textMuted }}>Loading activity...</div>
      ) : activities.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <Activity size={40} color={colors.textMuted} aria-hidden />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No activity yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Your actions will appear here as you use the platform</div>
        </div>
      ) : (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {activities.map((a, i) => {
            const Icon = actionIcons[a.action] ?? Circle;
            return (
              <div key={a.id} style={{
                padding: '14px 20px', display: 'flex', gap: 14, alignItems: 'center',
                borderBottom: i < activities.length - 1 ? `1px solid ${colors.border}` : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: colors.bgHover,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={14} color={colors.text} aria-hidden />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: colors.text }}>
                    <span style={{ fontWeight: 500 }}>{a.action}</span>
                    <span style={{ color: colors.textMuted }}> {a.entityType}</span>
                    {a.metadata?.name && <span style={{ color: colors.accent }}> "{a.metadata.name}"</span>}
                    {a.metadata?.title && <span style={{ color: colors.accent }}> "{a.metadata.title}"</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: colors.textDim, whiteSpace: 'nowrap' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
