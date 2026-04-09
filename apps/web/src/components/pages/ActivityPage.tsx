'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

const actionIcons: Record<string, string> = {
  created: '＋', registered: '👤', subscribed: '💳', updated: '✏', deleted: '🗑',
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
          <div style={{ fontSize: 40, marginBottom: 16 }}>◉</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>No activity yet</div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>Your actions will appear here as you use the platform</div>
        </div>
      ) : (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {activities.map((a, i) => (
            <div key={a.id} style={{
              padding: '14px 20px', display: 'flex', gap: 14, alignItems: 'center',
              borderBottom: i < activities.length - 1 ? `1px solid ${colors.border}` : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: colors.bgHover,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>{actionIcons[a.action] || '•'}</div>
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
          ))}
        </div>
      )}
    </div>
  );
}
