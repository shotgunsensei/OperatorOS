'use client';

import { useEffect, useState } from 'react';
import WorkspacePanel from '@/components/WorkspacePanel';
import FileExplorer from '@/components/FileExplorer';
import Editor from '@/components/Editor';
import TerminalStream from '@/components/TerminalStream';
import PreviewPanel from '@/components/PreviewPanel';
import AgentPanel from '@/components/AgentPanel';
import PublishPanel from '@/components/PublishPanel';
import ProcessesPanel from '@/components/ProcessesPanel';
import ServicesPanel from '@/components/ServicesPanel';
import AutomationPanel from '@/components/AutomationPanel';
import SystemStatusBar from '@/components/SystemStatusBar';
import SystemNotifications from '@/components/SystemNotifications';
import { api, type Workspace } from '@/lib/api';

export default function Home() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'processes' | 'services' | 'agent' | 'publish' | 'preview' | 'automation'>('terminal');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setWorkspace(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const data = await api.getWorkspace(workspaceId);
        if (active) setWorkspace(data);
      } catch {}
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [workspaceId]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', background: '#010409', color: '#c9d1d9' }}>
      <div style={{ width: 300, minWidth: 240, borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
        <WorkspacePanel workspaceId={workspaceId} onSelect={setWorkspaceId} />
      </div>

      {workspaceId ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SystemStatusBar workspace={workspace} />
            <div style={{ padding: 8, borderBottom: '1px solid #21262d' }}><SystemNotifications workspaceId={workspaceId} /></div>
          </div>

          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ width: 240, minWidth: 180, borderRight: '1px solid #21262d' }}>
              <FileExplorer workspaceId={workspaceId} onSelectFile={setSelectedFile} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor workspaceId={workspaceId} selectedFile={selectedFile} />
              </div>

              <div style={{ height: '45%', minHeight: 220, borderTop: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
                <div data-testid="bottom-tab-bar" style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#0d1117' }}>
                  {(['terminal', 'processes', 'services', 'agent', 'publish', 'preview', 'automation'] as const).map((tab) => (
                    <button
                      key={tab}
                      data-testid={`tab-${tab}`}
                      onClick={() => setBottomTab(tab)}
                      style={{
                        padding: '8px 14px',
                        border: 'none',
                        borderBottom: bottomTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                        background: 'transparent',
                        color: bottomTab === tab ? '#58a6ff' : '#8b949e',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: bottomTab === tab ? 700 : 400,
                        textTransform: 'capitalize',
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {bottomTab === 'terminal' && <TerminalStream workspaceId={workspaceId} />}
                  {bottomTab === 'processes' && <ProcessesPanel workspaceId={workspaceId} />}
                  {bottomTab === 'services' && <ServicesPanel workspaceId={workspaceId} />}
                  {bottomTab === 'agent' && <AgentPanel workspaceId={workspaceId} />}
                  {bottomTab === 'publish' && <PublishPanel workspaceId={workspaceId} />}
                  {bottomTab === 'preview' && <PreviewPanel workspaceId={workspaceId} />}
                  {bottomTab === 'automation' && <AutomationPanel workspaceId={workspaceId} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div data-testid="welcome-screen" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>OperatorOS</div>
            <div style={{ color: '#8b949e', fontSize: 14 }}>Create or select a workspace to get started.</div>
            <div style={{ color: '#484f58', fontSize: 11, marginTop: 12 }}>Powered by Shotgun Ninjas</div>
          </div>
        </div>
      )}
    </div>
  );
}
