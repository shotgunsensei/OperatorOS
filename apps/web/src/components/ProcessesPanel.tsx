'use client';

import { useEffect, useState } from 'react';
import { processApi, type WorkspaceProcess } from '@/lib/api';

export default function ProcessesPanel({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WorkspaceProcess[]>([]);
  const [command, setCommand] = useState('npm run dev');
  const [name, setName] = useState('dev-server');
  const [logs, setLogs] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await processApi.list(workspaceId);
      setItems(data.processes);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [workspaceId]);

  return (
    <div data-testid="processes-panel" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100%' }}>
      <div style={{ borderRight: '1px solid #21262d', padding: 12, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Processes</div>
        <input data-testid="input-process-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Process name" style={{ width: '100%', marginBottom: 8, background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', boxSizing: 'border-box' }} />
        <textarea data-testid="input-process-command" value={command} onChange={(e) => setCommand(e.target.value)} rows={3} style={{ width: '100%', marginBottom: 8, background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button data-testid="button-start-bg" onClick={async () => { await processApi.start(workspaceId, { name, command, background: true }); setCommand(command); await load(); }} style={{ background: '#238636', border: 'none', color: '#fff', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Start BG</button>
          <button data-testid="button-run-fg" onClick={async () => { await processApi.start(workspaceId, { name, command, background: false }); await load(); }} style={{ background: '#1f6feb', border: 'none', color: '#fff', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Run FG</button>
        </div>
        {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <div key={item.id} data-testid={`card-process-${item.id}`} onClick={async () => { setSelectedId(item.id); const data = await processApi.logs(workspaceId, item.id); setLogs(data.logs || '(no logs)'); }} style={{ padding: 10, border: selectedId === item.id ? '1px solid #58a6ff' : '1px solid #30363d', borderRadius: 8, cursor: 'pointer', background: '#0d1117' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 12 }}>{item.name}</strong>
                <span style={{ fontSize: 10, color: item.status === 'running' ? '#3fb950' : item.status === 'failed' ? '#f85149' : '#8b949e' }}>{item.status}</span>
              </div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{item.command}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#6e7681' }}>{new Date(item.startedAt).toLocaleTimeString()}</span>
                {item.status === 'running' && (
                  <button data-testid={`button-stop-process-${item.id}`} onClick={async (e) => { e.stopPropagation(); await processApi.stop(workspaceId, item.id); await load(); }} style={{ fontSize: 10, background: '#da3633', border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Stop</button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <div style={{ fontSize: 12, color: '#8b949e', padding: 8 }}>No processes yet. Start one above.</div>}
        </div>
      </div>
      <div style={{ padding: 12, overflow: 'auto', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', color: '#8b949e', background: '#010409' }}>
        {selectedId ? logs : 'Select a process to view its logs.'}
      </div>
    </div>
  );
}
