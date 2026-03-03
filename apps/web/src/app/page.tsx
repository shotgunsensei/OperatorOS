'use client';

import { useState } from 'react';
import WorkspacePanel from '@/components/WorkspacePanel';
import FileExplorer from '@/components/FileExplorer';
import Editor from '@/components/Editor';
import TerminalStream from '@/components/TerminalStream';
import PreviewPanel from '@/components/PreviewPanel';
import AgentPanel from '@/components/AgentPanel';

export default function Home() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'preview' | 'agent'>('terminal');

  return (
    <div data-testid="app-root" style={{ display: 'flex', height: 'calc(100vh - 48px)', background: '#010409', color: '#c9d1d9' }}>
      <div style={{ width: 260, minWidth: 200, borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
        <WorkspacePanel workspaceId={workspaceId} onSelect={setWorkspaceId} />
      </div>

      {workspaceId ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ width: 220, minWidth: 160, borderRight: '1px solid #21262d' }}>
              <FileExplorer workspaceId={workspaceId} onSelectFile={setSelectedFile} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Editor workspaceId={workspaceId} selectedFile={selectedFile} />
            </div>
          </div>

          <div style={{ height: '40%', minHeight: 180, borderTop: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #21262d' }}>
              {(['terminal', 'agent', 'preview'] as const).map((tab) => (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setBottomTab(tab)}
                  style={{
                    padding: '6px 16px',
                    background: bottomTab === tab ? '#0d1117' : 'transparent',
                    border: 'none',
                    borderBottom: bottomTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                    color: bottomTab === tab ? '#c9d1d9' : '#8b949e',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {tab === 'agent' ? '🤖 Agent' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {bottomTab === 'terminal' && <TerminalStream workspaceId={workspaceId} />}
              {bottomTab === 'agent' && <AgentPanel workspaceId={workspaceId} />}
              {bottomTab === 'preview' && <PreviewPanel workspaceId={workspaceId} />}
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
