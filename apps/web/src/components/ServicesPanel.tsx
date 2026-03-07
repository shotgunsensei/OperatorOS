'use client';

import { useEffect, useState } from 'react';
import { serviceApi, type WorkspaceService } from '@/lib/api';

export default function ServicesPanel({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WorkspaceService[]>([]);
  const [name, setName] = useState('preview-web');
  const [command, setCommand] = useState('npm run dev');
  const [port, setPort] = useState('3000');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await serviceApi.list(workspaceId);
      setItems(data.services);
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
    <div data-testid="services-panel" style={{ height: '100%', overflow: 'auto', padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Services</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 8, marginBottom: 12 }}>
        <input data-testid="input-service-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <input data-testid="input-service-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Command" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <input data-testid="input-service-port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <button data-testid="button-start-service" onClick={async () => { await serviceApi.start(workspaceId, { name, command, port: Number(port) || undefined }); await load(); }} style={{ background: '#238636', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>Start</button>
      </div>
      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <div key={item.id} data-testid={`card-service-${item.id}`} style={{ padding: 12, background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{item.command}</div>
              <div style={{ fontSize: 10, color: '#6e7681', marginTop: 6 }}>{item.port ? `Port ${item.port}${item.healthPath || ''}` : 'No exposed port'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: item.status === 'running' ? '#3fb950' : '#8b949e' }}>{item.status}</span>
              {item.status === 'running' && (
                <button data-testid={`button-stop-service-${item.id}`} onClick={async () => { await serviceApi.stop(workspaceId, item.id); await load(); }} style={{ fontSize: 11, background: '#da3633', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Stop</button>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <div style={{ fontSize: 12, color: '#8b949e', padding: 8 }}>No services registered. Start one above.</div>}
      </div>
    </div>
  );
}
