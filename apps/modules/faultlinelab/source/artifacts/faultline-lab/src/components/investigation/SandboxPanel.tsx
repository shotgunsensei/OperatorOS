import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Plus, Upload } from 'lucide-react';
import {
  loadSandboxScenarios,
  persistSandboxScenarios,
  SANDBOX_DEFAULT_CATEGORY,
  SANDBOX_DEFAULT_DIFFICULTY,
  SANDBOX_DEFAULT_IMPORTANCE,
  type SandboxCommand,
  type SandboxEvidence,
  type SandboxEvidenceImportance,
  type SandboxScenario,
} from '@/lib/sandboxScenarios';
import { useAppStore } from '@/stores/useAppStore';
import {
  EXPORT_FORMAT,
  ShareDialog,
  type ScenarioExport,
  type ShareMode,
} from './sandbox/ShareDialog';
import { ScenarioListSidebar } from './sandbox/ScenarioListSidebar';
import { ScenarioEditor } from './sandbox/ScenarioEditor';

export type { SandboxScenario } from '@/lib/sandboxScenarios';

const load = loadSandboxScenarios;
const persist = persistSandboxScenarios;

function blank(): SandboxScenario {
  const now = Date.now();
  return {
    id: `sandbox-${now}`,
    title: 'Untitled scenario',
    briefing: '',
    rootCause: '',
    category: SANDBOX_DEFAULT_CATEGORY,
    difficulty: SANDBOX_DEFAULT_DIFFICULTY,
    commands: [{ command: '', output: '' }],
    evidence: [
      {
        title: '',
        description: '',
        importance: SANDBOX_DEFAULT_IMPORTANCE,
        isRedHerring: false,
      },
    ],
    hints: [],
    createdAt: now,
    updatedAt: now,
  };
}

function fromExport(raw: string): SandboxScenario {
  const parsed = JSON.parse(raw) as Partial<ScenarioExport> & Partial<SandboxScenario>;
  const payload =
    parsed && typeof parsed === 'object' && 'scenario' in parsed && parsed.scenario
      ? (parsed.scenario as SandboxScenario)
      : (parsed as SandboxScenario);

  if (!payload || typeof payload !== 'object') {
    throw new Error('File is not a valid scenario.');
  }
  if (
    typeof payload.title !== 'string' ||
    typeof payload.briefing !== 'string' ||
    typeof payload.rootCause !== 'string'
  ) {
    throw new Error('Scenario is missing title, briefing, or root cause.');
  }
  if (!Array.isArray(payload.commands) || !Array.isArray(payload.evidence)) {
    throw new Error('Scenario is missing commands or evidence arrays.');
  }
  const commands: SandboxCommand[] = payload.commands.map((c) => ({
    command: String((c as SandboxCommand)?.command ?? ''),
    output: String((c as SandboxCommand)?.output ?? ''),
  }));
  const evidence: SandboxEvidence[] = payload.evidence.map((e) => {
    const src = e as SandboxEvidence;
    const importance = src?.importance;
    return {
      title: String(src?.title ?? ''),
      description: String(src?.description ?? ''),
      importance: ((importance as SandboxEvidenceImportance) || SANDBOX_DEFAULT_IMPORTANCE),
      isRedHerring: Boolean(src?.isRedHerring),
    };
  });
  const hints = Array.isArray(payload.hints)
    ? payload.hints.map((h) => ({
        label: String(h?.label ?? 'Hint'),
        text: String(h?.text ?? ''),
        scorePenalty: Number(h?.scorePenalty ?? 0) || 0,
      }))
    : [];
  const now = Date.now();
  return {
    id: `sandbox-${now}`,
    title: String(payload.title),
    briefing: String(payload.briefing),
    rootCause: String(payload.rootCause),
    category: (payload.category as SandboxScenario['category']) || SANDBOX_DEFAULT_CATEGORY,
    difficulty:
      (payload.difficulty as SandboxScenario['difficulty']) || SANDBOX_DEFAULT_DIFFICULTY,
    commands: commands.length ? commands : [{ command: '', output: '' }],
    evidence: evidence.length
      ? evidence
      : [
          {
            title: '',
            description: '',
            importance: SANDBOX_DEFAULT_IMPORTANCE,
            isRedHerring: false,
          },
        ],
    hints,
    createdAt: now,
    updatedAt: now,
  };
}

function safeFilename(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
  return `${slug || 'scenario'}.faultline.json`;
}

export { EXPORT_FORMAT };

export default function SandboxPanel() {
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<ShareMode>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const startSandboxRun = useAppStore((s) => s.startSandboxRun);

  const playScenario = (s: SandboxScenario) => {
    persist(scenarios);
    startSandboxRun(s.id);
  };

  useEffect(() => {
    const list = load();
    setScenarios(list);
    if (list.length > 0) setActiveId(list[0].id);
  }, []);

  const active = scenarios.find((s) => s.id === activeId) || null;

  const update = (next: SandboxScenario) => {
    const list = scenarios.map((s) =>
      s.id === next.id ? { ...next, updatedAt: Date.now() } : s
    );
    setScenarios(list);
    persist(list);
  };

  const create = () => {
    const s = blank();
    const list = [s, ...scenarios];
    setScenarios(list);
    setActiveId(s.id);
    persist(list);
  };

  const remove = (id: string) => {
    const list = scenarios.filter((s) => s.id !== id);
    setScenarios(list);
    persist(list);
    if (activeId === id) setActiveId(list[0]?.id || null);
  };

  const importScenario = (raw: string) => {
    try {
      const next = fromExport(raw);
      const list = [next, ...scenarios];
      setScenarios(list);
      persist(list);
      setActiveId(next.id);
      setShareMode(null);
      setImportText('');
      setImportError(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not parse scenario JSON.');
    }
  };

  const downloadScenario = (s: SandboxScenario) => {
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      exportedAt: Date.now(),
      scenario: {
        title: s.title,
        briefing: s.briefing,
        rootCause: s.rootCause,
        category: s.category,
        difficulty: s.difficulty,
        commands: s.commands,
        evidence: s.evidence,
        hints: s.hints,
      },
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename(s.title);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyScenario = async (s: SandboxScenario) => {
    const json = JSON.stringify({
      format: EXPORT_FORMAT,
      exportedAt: Date.now(),
      scenario: {
        title: s.title,
        briefing: s.briefing,
        rootCause: s.rootCause,
        category: s.category,
        difficulty: s.difficulty,
        commands: s.commands,
        evidence: s.evidence,
        hints: s.hints,
      },
    }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const onPickFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importScenario(String(reader.result || ''));
    reader.onerror = () => setImportError('Could not read file.');
    reader.readAsText(file);
  };

  const duplicate = (s: SandboxScenario) => {
    const copy: SandboxScenario = {
      ...JSON.parse(JSON.stringify(s)),
      id: `sandbox-${Date.now()}`,
      title: `${s.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const list = [copy, ...scenarios];
    setScenarios(list);
    setActiveId(copy.id);
    persist(list);
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#0c1017] border border-fuchsia-900/30 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
        <div className="flex items-center gap-2 text-fuchsia-300">
          <FlaskConical size={14} />
          <span className="text-xs font-mono uppercase tracking-wider">Sandbox</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setImportText('');
              setImportError(null);
              setShareMode('import');
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-200 border border-zinc-700/60 rounded hover:bg-zinc-800/50"
          >
            <Upload size={12} /> Import
          </button>
          <button
            onClick={create}
            className="flex items-center gap-1 px-2 py-1 text-xs text-fuchsia-200 border border-fuchsia-500/40 rounded hover:bg-fuchsia-500/10"
          >
            <Plus size={12} /> New
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        <ScenarioListSidebar
          scenarios={scenarios}
          activeId={activeId}
          setActiveId={setActiveId}
          playScenario={playScenario}
        />

        <main className="col-span-8 overflow-y-auto p-3">
          {!active && (
            <div className="text-sm text-zinc-500 text-center mt-12">
              Select or create a scenario to start authoring.
            </div>
          )}
          {active && (
            <ScenarioEditor
              active={active}
              update={update}
              playScenario={playScenario}
              duplicate={duplicate}
              remove={remove}
              openShare={() => {
                setCopied(false);
                setShareMode('export');
              }}
            />
          )}
        </main>
      </div>

      <ShareDialog
        shareMode={shareMode}
        onClose={() => setShareMode(null)}
        active={active}
        copied={copied}
        copyScenario={copyScenario}
        downloadScenario={downloadScenario}
        fileInputRef={fileInputRef}
        onPickFile={onPickFile}
        importText={importText}
        setImportText={setImportText}
        importError={importError}
        setImportError={setImportError}
        importScenario={importScenario}
      />
    </div>
  );
}
