'use client';

import { useEffect, useState } from 'react';
import { systemApi, type Workspace } from '@/lib/api';

export default function SystemStatusBar({ workspace }: { workspace: Workspace | null }) {
  const [status, setStatus] = useState<{ counts: { workspaces: number; activeProcesses: number; activeServices: number; unreadNotifications: number } } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await systemApi.status();
        if (active) setStatus(data);
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const chip = (label: string, value?: string | number, color = '#8b949e') => (
    <div data-testid={`status-chip-${label.toLowerCase()}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, fontSize: 11 }}>
      <span style={{ color }}>{label}</span>
      <strong style={{ color: '#c9d1d9' }}>{value ?? '—'}</strong>
    </div>
  );

  return (
    <div data-testid="system-status-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 12px', borderBottom: '1px solid #21262d', background: '#11161d' }}>
      {chip('Workspace', workspace?.id ? workspace.id.slice(0, 8) : 'none', '#58a6ff')}
      {chip('State', workspace?.status ?? 'idle', workspace?.status === 'running' ? '#3fb950' : '#d29922')}
      {chip('Runner', workspace?.runner?.mode ?? 'local')}
      {chip('Proc', status?.counts.activeProcesses ?? 0)}
      {chip('Svc', status?.counts.activeServices ?? 0)}
      {chip('Notify', status?.counts.unreadNotifications ?? 0, '#f85149')}
    </div>
  );
}
