import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { Terminal, ChevronRight } from 'lucide-react';

export default function TerminalPanel() {
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalHistory = useAppStore(s => s.terminalHistory);
  const executeCommand = useAppStore(s => s.executeCommand);
  const currentCaseDef = useAppStore(s => s.currentCaseDef);
  const settings = useAppStore(s => s.settings);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    setCommandHistory(prev => [cmd, ...prev]);
    setHistoryIndex(-1);
    setInput('');
    executeCommand(cmd);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.max(historyIndex - 1, -1);
      setHistoryIndex(newIndex);
      setInput(newIndex === -1 ? '' : commandHistory[newIndex] || '');
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-zinc-800/50 overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-[#111822] border-b border-zinc-800/50">
        <Terminal size={14} className="text-cyan-400" />
        <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          Diagnostic Terminal
        </span>
        {currentCaseDef && (
          <span className="text-xs font-mono text-zinc-600 ml-auto">
            {currentCaseDef.terminalCommands.length} commands available
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono"
        style={{ fontSize: `${settings.terminalFontSize}px` }}
      >
        {terminalHistory.length === 0 && (
          <div className="text-zinc-600 text-sm">
            <p className="mb-2">
              Diagnostic terminal ready. Type "help" for available commands.
            </p>
            <p className="text-zinc-700">
              Commands are case-aware and return data relevant to the current investigation.
            </p>
          </div>
        )}

        {terminalHistory.map((entry, i) => (
          <div key={i} className="mb-1">
            {entry.type === 'input' ? (
              <div className="flex items-center gap-2 text-cyan-400">
                <ChevronRight size={12} className="flex-shrink-0" />
                <span>{entry.content}</span>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                <pre className="text-zinc-300 whitespace-pre-wrap leading-relaxed mb-3 pl-5">
                  {entry.content}
                </pre>
                {entry.evidenceUnlocked && entry.evidenceUnlocked.length > 0 && (
                  <div className="pl-5 mb-3 py-1 px-2 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-xs font-mono inline-block">
                    Evidence unlocked: {entry.evidenceUnlocked.length} item(s)
                  </div>
                )}
              </motion.div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-zinc-800/50">
        <div className="flex items-center gap-2 px-4 py-3">
          <ChevronRight size={14} className="text-cyan-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="flex-1 bg-transparent text-zinc-200 font-mono outline-none placeholder:text-zinc-700"
            style={{ fontSize: `${settings.terminalFontSize}px` }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </form>
    </div>
  );
}
