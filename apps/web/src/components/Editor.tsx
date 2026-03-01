'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';

interface Props {
  workspaceId: string;
  selectedFile: string | null;
}

export default function Editor({ workspaceId, selectedFile }: Props) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentFile, setCurrentFile] = useState('');
  const [patchMode, setPatchMode] = useState(false);
  const [patchDiff, setPatchDiff] = useState('');
  const [patchResult, setPatchResult] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    setPatchMode(false);
    try {
      const data = await api.readFile(workspaceId, path);
      setContent(data.content);
      setOriginalContent(data.content);
      setCurrentFile(data.path);
    } catch (err: any) {
      setError(err.message);
      setContent('');
    }
    setLoading(false);
  }, [workspaceId]);

  const prevFile = useRef<string | null>(null);
  useEffect(() => {
    if (selectedFile && selectedFile !== prevFile.current) {
      prevFile.current = selectedFile;
      loadFile(selectedFile);
    }
  }, [selectedFile, loadFile]);

  const applyPatch = useCallback(async () => {
    if (!patchDiff.trim()) return;
    setPatchLoading(true);
    setPatchResult(null);
    try {
      const result = await api.applyPatch(workspaceId, patchDiff);
      if (result.success) {
        setPatchResult(`Patch applied. Changed files: ${result.changedFiles.join(', ')}`);
        setPatchDiff('');
        if (currentFile) loadFile(currentFile);
      } else {
        setPatchResult(`Patch failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setPatchResult(`Error: ${err.message}`);
    }
    setPatchLoading(false);
  }, [patchDiff, workspaceId, currentFile, loadFile]);

  if (patchMode) {
    return (
      <div data-testid="patch-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e' }}>
          <span>Apply Patch (Unified Diff)</span>
          <button
            data-testid="button-back-to-editor"
            onClick={() => setPatchMode(false)}
            style={{ marginLeft: 'auto', background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
          >
            ← Back
          </button>
        </div>

        <textarea
          data-testid="input-patch-diff"
          value={patchDiff}
          onChange={(e) => setPatchDiff(e.target.value)}
          placeholder={`Paste your unified diff here...

--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`}
          style={{
            flex: 1,
            background: '#161b22',
            color: '#c9d1d9',
            border: 'none',
            padding: 12,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            resize: 'none',
            outline: 'none',
          }}
        />

        {patchResult && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: patchResult.startsWith('Patch applied') ? '#3fb950' : '#f85149', borderTop: '1px solid #21262d' }}>
            {patchResult}
          </div>
        )}

        <div style={{ padding: 8, borderTop: '1px solid #21262d', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            data-testid="button-apply-patch"
            onClick={applyPatch}
            disabled={patchLoading || !patchDiff.trim()}
            style={{
              background: patchLoading ? '#21262d' : '#238636',
              border: 'none',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 4,
              cursor: patchLoading ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {patchLoading ? 'Applying...' : 'Apply Patch'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="editor-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e' }}>
        <span>{currentFile || 'No file selected'}</span>
        <button
          data-testid="button-patch-mode"
          onClick={() => setPatchMode(true)}
          style={{ marginLeft: 'auto', background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          Apply Patch
        </button>
        {currentFile && (
          <button
            data-testid="button-reload-file"
            onClick={() => loadFile(currentFile)}
            style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
          >
            ↻
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f85149' }}>{error}</div>
      ) : !currentFile ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 24, color: '#484f58' }}>[editor]</span>
          <span style={{ fontSize: 13 }}>Select a file from the explorer</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          <pre style={{
            margin: 0,
            padding: 12,
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            color: '#c9d1d9',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {content.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex' }}>
                <span style={{ color: '#484f58', minWidth: 40, textAlign: 'right', paddingRight: 12, userSelect: 'none' }}>{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}
