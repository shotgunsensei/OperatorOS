'use client';

import { useState } from 'react';

interface Props {
  workspaceId: string;
}

export default function PreviewPanel({ workspaceId }: Props) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [port, setPort] = useState('3000');

  const openPreview = () => {
    const url = inputUrl.trim() || `http://localhost:${port}`;
    setPreviewUrl(url);
  };

  return (
    <div data-testid="preview-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' }}>
        <span>Preview</span>
        <input
          data-testid="input-preview-url"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder={`URL or port (default: ${port})`}
          style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '3px 8px', fontSize: 11, marginLeft: 8 }}
        />
        <select
          data-testid="select-preview-port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 4, padding: '3px 8px', fontSize: 11 }}
        >
          <option value="3000">:3000</option>
          <option value="8080">:8080</option>
          <option value="8000">:8000</option>
          <option value="4000">:4000</option>
          <option value="5173">:5173</option>
        </select>
        <button
          data-testid="button-open-preview"
          onClick={openPreview}
          style={{ background: '#238636', border: 'none', color: '#fff', padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
        >
          Open
        </button>
        {previewUrl && (
          <button
            data-testid="button-close-preview"
            onClick={() => setPreviewUrl('')}
            style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}
          >
            ✕
          </button>
        )}
      </div>

      {previewUrl ? (
        <iframe
          data-testid="preview-iframe"
          src={previewUrl}
          style={{ flex: 1, border: 'none', background: '#fff' }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Preview"
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#484f58' }}>
          <span style={{ fontSize: 20, color: '#484f58' }}>[preview]</span>
          <span style={{ fontSize: 13 }}>Start a server in the terminal, then click Open</span>
          <span style={{ fontSize: 11 }}>Use the terminal to run your app, then preview it here</span>
        </div>
      )}
    </div>
  );
}
