'use client';

import { useEffect, useState } from 'react';
import { systemApi, type SystemNotification } from '@/lib/api';

export default function SystemNotifications({ workspaceId }: { workspaceId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SystemNotification[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await systemApi.notifications(workspaceId ?? undefined, 12);
        if (active) setItems(data.notifications);
      } catch {}
    };
    load();
    const timer = setInterval(load, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [workspaceId]);

  const unread = items.filter((item) => !item.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button data-testid="button-notifications-toggle" onClick={() => setOpen((v) => !v)} style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>
        Notifications {unread > 0 ? `(${unread})` : ''}
      </button>
      {open && (
        <div data-testid="notifications-drawer" style={{ position: 'absolute', right: 0, top: 36, width: 360, maxHeight: 360, overflow: 'auto', background: '#0d1117', border: '1px solid #30363d', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', zIndex: 20 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #21262d', fontWeight: 700, fontSize: 13 }}>System notifications</div>
          {items.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: '#8b949e' }}>No notifications yet.</div>
          ) : items.map((item) => (
            <div key={item.id} data-testid={`notification-${item.id}`} style={{ padding: 12, borderBottom: '1px solid #161b22' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 12, color: '#c9d1d9' }}>{item.title}</strong>
                {!item.read && (
                  <button data-testid={`button-mark-read-${item.id}`} onClick={async () => { await systemApi.markNotificationRead(item.id); const data = await systemApi.notifications(workspaceId ?? undefined, 12); setItems(data.notifications); }} style={{ background: 'transparent', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 11 }}>
                    mark read
                  </button>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>{item.message}</div>
              <div style={{ fontSize: 10, color: '#6e7681', marginTop: 6 }}>{new Date(item.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
