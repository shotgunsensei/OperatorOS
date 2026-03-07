'use client';

import { useEffect, useMemo, useState } from 'react';
import { serviceApi, type WorkspaceService } from '@/lib/api';

export default function PreviewPanel({ workspaceId }: { workspaceId: string }) {
  const [services, setServices] = useState<WorkspaceService[]>([]);
  const [manualPort, setManualPort] = useState('3000');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await serviceApi.list(workspaceId);
        if (!active) return;
        setServices(data.services);
        const firstRunning = data.services.find((service) => service.status === 'running' && service.port);
        if (firstRunning?.port) {
          const url = `${window.location.protocol}//${window.location.hostname}:${firstRunning.port}${firstRunning.healthPath || '/'}`;
          setPreviewUrl(url);
          setManualPort(String(firstRunning.port));
        }
      } catch {}
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [workspaceId]);

  const runningServices = useMemo(() => services.filter((service) => service.status === 'running'), [services]);

  return (
    <div data-testid="preview-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d1117' }}>
      <div style={{ padding: 10, borderBottom: '1px solid #21262d', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input data-testid="input-preview-port" value={manualPort} onChange={(e) => setManualPort(e.target.value)} placeholder="Port" style={{ width: 100, background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '7px 10px' }} />
        <button data-testid="button-open-preview" onClick={() => setPreviewUrl(`${window.location.protocol}//${window.location.hostname}:${manualPort}/`)} style={{ background: '#1f6feb', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>Open manual</button>
        {runningServices.map((service) => service.port ? (
          <button key={service.id} data-testid={`button-preview-service-${service.id}`} onClick={() => setPreviewUrl(`${window.location.protocol}//${window.location.hostname}:${service.port}${service.healthPath || '/'}`)} style={{ background: '#238636', border: 'none', color: '#fff', borderRadius: 999, padding: '6px 10px', cursor: 'pointer', fontSize: 11 }}>
            {service.name} : {service.port}
          </button>
        ) : null)}
        {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: '#58a6ff', fontSize: 12 }}>Open in new tab</a>}
      </div>

      {previewUrl ? (
        <iframe src={previewUrl} style={{ flex: 1, border: 'none', background: '#fff' }} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="Preview" />
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#8b949e', padding: 20, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>No active preview detected</div>
            <div style={{ fontSize: 12 }}>Start a service from the Services tab, or open a manual port.</div>
          </div>
        </div>
      )}
    </div>
  );
}
