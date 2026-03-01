'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ExecResult } from '@/lib/api';

interface Props {
  workspaceId: string;
}

interface LogLine {
  type: 'stdout' | 'stderr' | 'info' | 'exit';
  text: string;
}

export default function TerminalStream({ workspaceId }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [cmd, setCmd] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const addLine = (type: LogLine['type'], text: string) => {
    setLines((prev) => [...prev.slice(-500), { type, text }]);
  };

  const runCommand = useCallback(async () => {
    if (!cmd.trim() || running) return;
    const command = cmd.trim();
    setRunning(true);
    setHistory((prev) => [...prev, command]);
    setHistIdx(-1);
    addLine('info', `$ ${command}`);
    setCmd('');

    try {
      const result: ExecResult = await api.exec(workspaceId, command);
      if (result.stdout) addLine('stdout', result.stdout);
      if (result.stderr) addLine('stderr', result.stderr);
      addLine('exit', `exit ${result.exitCode} (${result.durationMs}ms)${result.truncated ? ' [truncated]' : ''}`);
    } catch (err: any) {
      addLine('stderr', `Error: ${err.message}`);
    }
    setRunning(false);
  }, [cmd, running, workspaceId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
        setHistIdx(idx);
        setCmd(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx >= 0) {
        const idx = histIdx + 1;
        if (idx >= history.length) {
          setHistIdx(-1);
          setCmd('');
        } else {
          setHistIdx(idx);
          setCmd(history[idx]);
        }
      }
    }
  };

  const colorMap: Record<string, string> = {
    stdout: '#c8d3d5',
    stderr: '#ff6b6b',
    info: '#4ecdc4',
    exit: '#6e7681',
  };

  return (
    <div data-testid="terminal-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d1117', fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace' }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e' }}>
        <span>Terminal</span>
        <span style={{ marginLeft: 'auto' }} />
        <button
          data-testid="button-clear-terminal"
          onClick={() => setLines([])}
          style={{ background: '#21262d', border: '1px solid #30363d', color: '#8b949e', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
        >
          Clear
        </button>
      </div>

      <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px', fontSize: 13, lineHeight: '1.6' }}>
        {lines.length === 0 && (
          <div style={{ color: '#484f58', fontStyle: 'italic' }}>Ready. Type a command below.</div>
        )}
        {lines.map((l, i) => (
          <div key={i} style={{ color: colorMap[l.type], whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {l.text}
          </div>
        ))}
        {running && <div style={{ color: '#4ecdc4', animation: 'pulse 1s infinite' }}>Running...</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCommand();
        }}
        style={{ display: 'flex', borderTop: '1px solid #21262d' }}
      >
        <span style={{ padding: '8px 4px 8px 12px', color: '#4ecdc4', fontSize: 13, fontFamily: 'inherit' }}>$</span>
        <input
          data-testid="input-terminal-command"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          placeholder="Enter command..."
          autoFocus
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#c8d3d5',
            fontSize: 13,
            fontFamily: 'inherit',
            padding: '8px',
            outline: 'none',
          }}
        />
        <button
          data-testid="button-run-command"
          type="submit"
          disabled={running || !cmd.trim()}
          style={{
            background: running || !cmd.trim() ? '#21262d' : '#238636',
            border: 'none',
            color: '#fff',
            padding: '8px 16px',
            cursor: running || !cmd.trim() ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Run
        </button>
      </form>
    </div>
  );
}
