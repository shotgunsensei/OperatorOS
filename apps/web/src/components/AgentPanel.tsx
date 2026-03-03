'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { agentApi } from '@/lib/api';
import type { AgentEventData, AgentTask } from '@/lib/api';

interface AgentPanelProps {
  workspaceId: string;
}

const EVENT_ICONS: Record<string, string> = {
  PLAN: '📋',
  LLM_THOUGHT_SUMMARY: '🧠',
  TOOL_CALL: '🔧',
  TOOL_RESULT: '📤',
  VERIFY_RESULT: '✅',
  PATCH_APPLIED: '📝',
  DONE: '🏁',
  ERROR: '❌',
  STREAM_END: '🔚',
};

const EVENT_COLORS: Record<string, string> = {
  PLAN: '#58a6ff',
  LLM_THOUGHT_SUMMARY: '#d2a8ff',
  TOOL_CALL: '#79c0ff',
  TOOL_RESULT: '#7ee787',
  VERIFY_RESULT: '#3fb950',
  PATCH_APPLIED: '#f0883e',
  DONE: '#3fb950',
  ERROR: '#f85149',
  STREAM_END: '#8b949e',
};

export default function AgentPanel({ workspaceId }: AgentPanelProps) {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEventData[]>([]);
  const [task, setTask] = useState<AgentTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pastTasks, setPastTasks] = useState<AgentTask[]>([]);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    agentApi.listTasks(workspaceId).then((data) => {
      setPastTasks(data.tasks.filter((t) => t.goal));
    }).catch(() => {});
  }, [workspaceId, taskId]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  const subscribeToEvents = useCallback((tid: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = agentApi.streamEvents(tid);
    eventSourceRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as AgentEventData;
        setEvents((prev) => [...prev, data]);

        if (data.type === 'STREAM_END' || data.type === 'DONE' || data.type === 'ERROR') {
          setRunning(false);
          agentApi.getTask(tid).then(setTask).catch(() => {});
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }, []);

  const handleRun = async () => {
    if (!goal.trim()) return;
    setError(null);
    setEvents([]);
    setTask(null);
    setRunning(true);

    try {
      const created = await agentApi.createTask(workspaceId, goal.trim());
      const tid = created.taskId || created.id;
      setTaskId(tid);

      await agentApi.runTask(tid);
      subscribeToEvents(tid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent');
      setRunning(false);
    }
  };

  const viewPastTask = async (tid: string) => {
    setTaskId(tid);
    setEvents([]);
    setError(null);
    try {
      const t = await agentApi.getTask(tid);
      setTask(t);
      const evts = await agentApi.getTaskEvents(tid);
      setEvents(evts.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    }
  };

  const renderPayload = (type: string, payload: Record<string, unknown>) => {
    if (type === 'LLM_THOUGHT_SUMMARY') {
      return <span>{String(payload.summary ?? '').slice(0, 300)}</span>;
    }
    if (type === 'TOOL_CALL') {
      const args = payload.args as Record<string, unknown> | undefined;
      let argSummary = '';
      if (args?.path) argSummary = String(args.path);
      else if (args?.cmd) argSummary = String(args.cmd).slice(0, 100);
      else if (args?.diff) argSummary = `${String(args.diff).length} chars`;
      return <span><strong>{String(payload.tool)}</strong>{argSummary ? ` → ${argSummary}` : ''}</span>;
    }
    if (type === 'TOOL_RESULT') {
      const output = String(payload.output ?? '').slice(0, 200);
      return (
        <span>
          <strong>{String(payload.tool)}</strong>: {payload.success ? '✓' : '✗'}{' '}
          <span style={{ color: '#8b949e', fontSize: 11 }}>{output}</span>
        </span>
      );
    }
    if (type === 'VERIFY_RESULT') {
      return <span>{payload.passed ? '✅ All checks passed' : '❌ Some checks failed'}</span>;
    }
    if (type === 'PATCH_APPLIED') {
      const files = (payload.changedFiles as string[]) ?? [];
      return <span>Changed: {files.join(', ') || 'unknown'}</span>;
    }
    if (type === 'DONE') {
      return <span>{String(payload.reason ?? 'Completed')}</span>;
    }
    if (type === 'ERROR') {
      return <span style={{ color: '#f85149' }}>{String(payload.error ?? 'Unknown error')}</span>;
    }
    if (type === 'PLAN') {
      return <span>{String(payload.message ?? '')}</span>;
    }
    if (type === 'STREAM_END') {
      return <span>Status: {String(payload.status)} — {String(payload.summary ?? '')}</span>;
    }
    return <span>{JSON.stringify(payload).slice(0, 200)}</span>;
  };

  return (
    <div data-testid="agent-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d1117' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            data-testid="input-agent-goal"
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !running && handleRun()}
            placeholder="Describe what the agent should fix..."
            disabled={running}
            style={{
              flex: 1,
              padding: '6px 10px',
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#c9d1d9',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            data-testid="button-run-agent"
            onClick={handleRun}
            disabled={running || !goal.trim()}
            style={{
              padding: '6px 16px',
              background: running ? '#21262d' : '#238636',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running || !goal.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {running ? '⏳ Running...' : '▶ Run Agent'}
          </button>
        </div>
        {error && <div data-testid="text-agent-error" style={{ color: '#f85149', fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {events.length === 0 && !running && (
          <div style={{ color: '#484f58', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
            {pastTasks.length > 0 ? (
              <div>
                <div style={{ marginBottom: 12 }}>Enter a goal and click Run Agent to start</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>Previous runs:</div>
                {pastTasks.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    data-testid={`button-past-task-${t.id}`}
                    onClick={() => viewPastTask(t.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 10px',
                      marginBottom: 4,
                      background: '#161b22',
                      border: '1px solid #21262d',
                      borderRadius: 4,
                      color: '#c9d1d9',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ color: t.status === 'succeeded' ? '#3fb950' : t.status === 'failed' ? '#f85149' : '#8b949e' }}>●</span>{' '}
                    {t.goal?.slice(0, 60) ?? t.title} <span style={{ color: '#484f58', fontSize: 11 }}>({t.status})</span>
                  </button>
                ))}
              </div>
            ) : (
              'Enter a goal and click Run Agent to start'
            )}
          </div>
        )}

        {events.map((evt, i) => (
          <div
            key={i}
            data-testid={`event-${evt.type}-${i}`}
            style={{
              padding: '6px 0',
              borderBottom: '1px solid #161b22',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <span style={{ marginRight: 6 }}>{EVENT_ICONS[evt.type] ?? '▪'}</span>
            <span style={{ color: EVENT_COLORS[evt.type] ?? '#8b949e', fontWeight: 600, marginRight: 6, fontSize: 10, textTransform: 'uppercase' as const }}>
              {evt.type.replace(/_/g, ' ')}
            </span>
            <span style={{ color: '#c9d1d9' }}>
              {renderPayload(evt.type, evt.payload)}
            </span>
            {evt.ts && (
              <span style={{ color: '#484f58', fontSize: 10, marginLeft: 8 }}>
                {new Date(evt.ts).toLocaleTimeString()}
              </span>
            )}
          </div>
        ))}

        {running && (
          <div style={{ padding: '8px 0', color: '#58a6ff', fontSize: 12 }}>
            ⏳ Agent is working...
          </div>
        )}

        <div ref={eventsEndRef} />
      </div>

      {task && !running && (
        <div
          data-testid="agent-summary"
          style={{
            padding: '8px 12px',
            borderTop: '1px solid #21262d',
            background: task.status === 'succeeded' ? '#0d1a12' : '#1a0d0d',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, color: task.status === 'succeeded' ? '#3fb950' : '#f85149', marginBottom: 2 }}>
            {task.status === 'succeeded' ? '✅ Agent succeeded' : '❌ Agent failed'}
          </div>
          <div style={{ color: '#8b949e' }}>{task.resultSummary}</div>
        </div>
      )}
    </div>
  );
}
