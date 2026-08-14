'use client';

import { useEffect, useState } from 'react';
import { saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import {
  Plus,
  UserPlus,
  CreditCard,
  Pencil,
  Trash2,
  Circle,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../ExperiencePrimitives';
import { cardStyle } from '@/lib/design-tokens';

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
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    saasApi.getActivity({ limit: 50 }).then(d => setActivities(d.activities)).catch(() => setLoadError(true)).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 900 }} data-testid="activity-page">
      <PageHeader title="Activity feed" description="Your recent actions across all workspaces." />

      {loading ? (
        <LoadingState label="Loading activity…" />
      ) : loadError ? (
        <ErrorState title="Activity is unavailable" description="We couldn’t load your recent activity. Try again in a moment." />
      ) : activities.length === 0 ? (
        <EmptyState title="No activity yet" description="Your actions will appear here as you use OperatorOS." />
      ) : (
        <div style={cardStyle}>
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
