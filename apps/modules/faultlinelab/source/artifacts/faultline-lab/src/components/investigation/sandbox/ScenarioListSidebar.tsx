import { Play } from 'lucide-react';
import type { SandboxScenario } from '@/lib/sandboxScenarios';

interface Props {
  scenarios: SandboxScenario[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  playScenario: (s: SandboxScenario) => void;
}

export function ScenarioListSidebar({
  scenarios,
  activeId,
  setActiveId,
  playScenario,
}: Props) {
  return (
    <aside className="col-span-4 border-r border-zinc-800/60 overflow-y-auto">
      {scenarios.length === 0 && (
        <div className="p-4 text-xs text-zinc-500">
          No scenarios yet. Click <strong>New</strong> to author your first puzzle.
        </div>
      )}
      {scenarios.map((s) => (
        <div
          key={s.id}
          className={`flex items-stretch border-b border-zinc-900/50 ${
            activeId === s.id ? 'bg-fuchsia-500/10' : 'hover:bg-zinc-800/30'
          }`}
        >
          <button
            onClick={() => setActiveId(s.id)}
            className="flex-1 text-left px-3 py-2 min-w-0"
          >
            <div className="text-sm text-zinc-200 truncate">{s.title || 'Untitled'}</div>
            <div className="text-[10px] font-mono text-zinc-500">
              {s.commands.length} cmd · {s.evidence.length} evidence
              {s.hints && s.hints.length > 0 ? ` · ${s.hints.length} hint` : ''}
            </div>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              playScenario(s);
            }}
            title="Play this scenario"
            aria-label={`Play ${s.title || 'scenario'}`}
            className="px-2 text-fuchsia-300 hover:text-fuchsia-200 hover:bg-fuchsia-500/10"
          >
            <Play size={14} />
          </button>
        </div>
      ))}
    </aside>
  );
}
