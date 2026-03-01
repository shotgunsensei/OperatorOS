'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { TreeEntry } from '@/lib/api';

interface Props {
  workspaceId: string;
  onSelectFile: (path: string) => void;
}

export default function FileExplorer({ workspaceId, onSelectFile }: Props) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPath, setCurrentPath] = useState('.');

  const loadTree = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getTree(workspaceId, path, 3);
      setEntries(data.entries);
      setCurrentPath(path);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadTree('.');
  }, [loadTree]);

  const handleClick = (entry: TreeEntry) => {
    if (entry.type === 'dir') {
      loadTree(entry.path);
    } else {
      onSelectFile(entry.path);
    }
  };

  const goUp = () => {
    if (currentPath === '.') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '.';
    loadTree(parent);
  };

  return (
    <div data-testid="file-explorer" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e' }}>
        <span>Files</span>
        <button
          data-testid="button-refresh-tree"
          onClick={() => loadTree(currentPath)}
          style={{ marginLeft: 'auto', background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          Refresh
        </button>
      </div>

      {currentPath !== '.' && (
        <div
          data-testid="button-go-up"
          onClick={goUp}
          style={{ padding: '4px 12px', cursor: 'pointer', color: '#58a6ff', fontSize: 13, borderBottom: '1px solid #161b22' }}
        >
          .. (up)
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', fontSize: 13 }}>
        {loading && <div style={{ padding: 12, color: '#8b949e' }}>Loading...</div>}
        {error && <div style={{ padding: 12, color: '#f85149' }}>{error}</div>}
        {!loading &&
          entries
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
              return a.path.localeCompare(b.path);
            })
            .map((entry) => {
              const name = entry.path.split('/').pop() || entry.path;
              return (
                <div
                  key={entry.path}
                  data-testid={`file-entry-${name}`}
                  onClick={() => handleClick(entry)}
                  style={{
                    padding: '4px 12px',
                    cursor: 'pointer',
                    color: entry.type === 'dir' ? '#58a6ff' : '#c9d1d9',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderBottom: '1px solid #161b22',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#161b22'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 12, color: entry.type === 'dir' ? '#58a6ff' : '#8b949e', fontFamily: 'monospace', width: 16, textAlign: 'center' }}>
                    {entry.type === 'dir' ? 'D' : 'F'}
                  </span>
                  <span>{name}</span>
                </div>
              );
            })}
      </div>

      <div style={{ padding: '4px 12px', borderTop: '1px solid #21262d', color: '#484f58', fontSize: 11 }}>
        {currentPath === '.' ? '/' : currentPath} — {entries.length} items
      </div>
    </div>
  );
}
