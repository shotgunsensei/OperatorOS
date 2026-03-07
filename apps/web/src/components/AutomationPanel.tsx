'use client';

import { useEffect, useState } from 'react';
import { automationApi, type AutomationRule } from '@/lib/api';

export default function AutomationPanel({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<AutomationRule[]>([]);
  const [name, setName] = useState('Verify after patch');
  const [triggerType, setTriggerType] = useState('patch.applied');
  const [actionType, setActionType] = useState('verify.run');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await automationApi.list(workspaceId);
      setItems(data.automations);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  return (
    <div data-testid="automation-panel" style={{ height: '100%', overflow: 'auto', padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Automation rules</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px auto', gap: 8, marginBottom: 12 }}>
        <input data-testid="input-automation-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <input data-testid="input-trigger-type" value={triggerType} onChange={(e) => setTriggerType(e.target.value)} placeholder="Trigger" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <input data-testid="input-action-type" value={actionType} onChange={(e) => setActionType(e.target.value)} placeholder="Action" style={{ background: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px' }} />
        <button data-testid="button-create-automation" onClick={async () => { await automationApi.create(workspaceId, { name, triggerType, actionType }); await load(); }} style={{ background: '#1f6feb', border: 'none', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>Create</button>
      </div>
      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <div key={item.id} data-testid={`card-automation-${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 12, border: '1px solid #30363d', borderRadius: 8, background: '#0d1117' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>{item.triggerType} → {item.actionType}</div>
            </div>
            <button data-testid={`button-toggle-automation-${item.id}`} onClick={async () => { await automationApi.toggle(workspaceId, item.id, !item.enabled); await load(); }} style={{ background: item.enabled ? '#238636' : '#30363d', border: 'none', color: '#fff', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
              {item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        ))}
        {items.length === 0 && <div style={{ fontSize: 12, color: '#8b949e', padding: 8 }}>No automation rules. Create one above.</div>}
      </div>
    </div>
  );
}
