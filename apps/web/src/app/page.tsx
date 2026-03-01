'use client';

import { useState } from 'react';
import WorkspacePanel from '@/components/WorkspacePanel';
import FileExplorer from '@/components/FileExplorer';
import Editor from '@/components/Editor';
import TerminalStream from '@/components/TerminalStream';
import PreviewPanel from '@/components/PreviewPanel';

export default function Home() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'preview'>('terminal');

  return (
    <div data-testid="app-root" style={{ display: 'flex', height: 'calc(100vh - 48px)', background: '#010409', color: '#c9d1d9' }}>
      {/* Left sidebar: Workspace list */}
      <div style={{ width: 260, minWidth: 200, borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
        <WorkspacePanel workspaceId={workspaceId} onSelect={setWorkspaceId} />
      </div>

      {/* Main content area */}
      {workspaceId ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Top: File Explorer + Editor */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* File tree */}
            <div style={{ width: 220, minWidth: 160, borderRight: '1px solid #21262d' }}>
              <FileExplorer workspaceId={workspaceId} onSelectFile={setSelectedFile} />
            </div>
            {/* Editor */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Editor workspaceId={workspaceId} selectedFile={selectedFile} />
            </div>
          </div>

          {/* Bottom: Terminal / Preview tabs */}
          <div style={{ height: '40%', minHeight: 180, borderTop: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #21262d' }}>
              <button
                data-testid="tab-terminal"
                onClick={() => setBottomTab('terminal')}
                style={{
                  padding: '6px 16px',
                  background: bottomTab === 'terminal' ? '#0d1117' : 'transparent',
                  border: 'none',
                  borderBottom: bottomTab === 'terminal' ? '2px solid #58a6ff' : '2px solid transparent',
                  color: bottomTab === 'terminal' ? '#c9d1d9' : '#8b949e',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Terminal
              </button>
              <button
                data-testid="tab-preview"
                onClick={() => setBottomTab('preview')}
                style={{
                  padding: '6px 16px',
                  background: bottomTab === 'preview' ? '#0d1117' : 'transparent',
                  border: 'none',
                  borderBottom: bottomTab === 'preview' ? '2px solid #58a6ff' : '2px solid transparent',
                  color: bottomTab === 'preview' ? '#c9d1d9' : '#8b949e',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Preview
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {bottomTab === 'terminal' ? (
                <TerminalStream workspaceId={workspaceId} />
              ) : (
                <PreviewPanel workspaceId={workspaceId} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#484f58' }}>
          <span style={{ fontSize: 24, color: '#484f58', fontWeight: 700, letterSpacing: '-0.03em' }}>OS</span>
          <h2 style={{ margin: 0, fontSize: 20, color: '#8b949e', fontWeight: 500 }}>Welcome to OperatorOS</h2>
          <p style={{ margin: 0, fontSize: 13 }}>Create or select a workspace to get started</p>
        </div>
      )}
    </div>
  );
}
