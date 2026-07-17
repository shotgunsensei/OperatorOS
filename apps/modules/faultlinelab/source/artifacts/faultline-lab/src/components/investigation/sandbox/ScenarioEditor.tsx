import { Copy, Play, Save, Share2, Trash2 } from 'lucide-react';
import type { CaseCategory, Difficulty } from '@/types';
import {
  SANDBOX_DEFAULT_CATEGORY,
  SANDBOX_DEFAULT_DIFFICULTY,
  SANDBOX_DEFAULT_IMPORTANCE,
  type SandboxEvidenceImportance,
  type SandboxHint,
  type SandboxScenario,
} from '@/lib/sandboxScenarios';
import { Field, Section } from './Field';

const CATEGORY_OPTIONS: { value: CaseCategory; label: string }[] = [
  { value: 'windows-ad', label: 'Windows / AD' },
  { value: 'networking', label: 'Networking' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'servers', label: 'Servers' },
  { value: 'mixed', label: 'Mixed' },
];
const DIFFICULTY_OPTIONS: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const IMPORTANCE_OPTIONS: SandboxEvidenceImportance[] = ['low', 'medium', 'high', 'critical'];
const DEFAULT_HINT_LABELS = ['Nudge', 'Hint', 'Strong hint', 'Spoiler'];
const DEFAULT_HINT_PENALTIES = [3, 6, 10, 20];

interface Props {
  active: SandboxScenario;
  update: (next: SandboxScenario) => void;
  playScenario: (s: SandboxScenario) => void;
  duplicate: (s: SandboxScenario) => void;
  remove: (id: string) => void;
  openShare: () => void;
}

export function ScenarioEditor({
  active,
  update,
  playScenario,
  duplicate,
  remove,
  openShare,
}: Props) {
  return (
    <div className="space-y-3 text-sm">
      <Field label="Title">
        <input
          className="w-full bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
          value={active.title}
          onChange={(e) => update({ ...active, title: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <select
            className="w-full bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
            value={active.category ?? SANDBOX_DEFAULT_CATEGORY}
            onChange={(e) => update({ ...active, category: e.target.value as CaseCategory })}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Difficulty">
          <select
            className="w-full bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
            value={active.difficulty ?? SANDBOX_DEFAULT_DIFFICULTY}
            onChange={(e) => update({ ...active, difficulty: e.target.value as Difficulty })}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Briefing">
        <textarea
          rows={3}
          className="w-full bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
          value={active.briefing}
          onChange={(e) => update({ ...active, briefing: e.target.value })}
        />
      </Field>
      <Field label="Root cause (truth)">
        <input
          className="w-full bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-fuchsia-500/50"
          value={active.rootCause}
          onChange={(e) => update({ ...active, rootCause: e.target.value })}
        />
      </Field>

      <Section
        title="Terminal commands"
        onAdd={() =>
          update({ ...active, commands: [...active.commands, { command: '', output: '' }] })
        }
      >
        {active.commands.map((c, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 mb-2">
            <input
              className="col-span-4 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100"
              placeholder="command"
              value={c.command}
              onChange={(e) => {
                const arr = [...active.commands];
                arr[i] = { ...c, command: e.target.value };
                update({ ...active, commands: arr });
              }}
            />
            <input
              className="col-span-7 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100"
              placeholder="output"
              value={c.output}
              onChange={(e) => {
                const arr = [...active.commands];
                arr[i] = { ...c, output: e.target.value };
                update({ ...active, commands: arr });
              }}
            />
            <button
              onClick={() => {
                const arr = active.commands.filter((_, idx) => idx !== i);
                update({
                  ...active,
                  commands: arr.length ? arr : [{ command: '', output: '' }],
                });
              }}
              className="col-span-1 text-zinc-500 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </Section>

      <Section
        title="Evidence"
        onAdd={() =>
          update({
            ...active,
            evidence: [
              ...active.evidence,
              {
                title: '',
                description: '',
                importance: SANDBOX_DEFAULT_IMPORTANCE,
                isRedHerring: false,
              },
            ],
          })
        }
      >
        {active.evidence.map((e, i) => (
          <div key={i} className="border border-zinc-900/60 rounded p-2 mb-2 space-y-2">
            <div className="grid grid-cols-12 gap-2">
              <input
                className="col-span-4 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
                placeholder="title"
                value={e.title}
                onChange={(ev) => {
                  const arr = [...active.evidence];
                  arr[i] = { ...e, title: ev.target.value };
                  update({ ...active, evidence: arr });
                }}
              />
              <input
                className="col-span-7 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
                placeholder="description"
                value={e.description}
                onChange={(ev) => {
                  const arr = [...active.evidence];
                  arr[i] = { ...e, description: ev.target.value };
                  update({ ...active, evidence: arr });
                }}
              />
              <button
                onClick={() => {
                  const arr = active.evidence.filter((_, idx) => idx !== i);
                  update({
                    ...active,
                    evidence: arr.length
                      ? arr
                      : [
                          {
                            title: '',
                            description: '',
                            importance: SANDBOX_DEFAULT_IMPORTANCE,
                            isRedHerring: false,
                          },
                        ],
                  });
                }}
                className="col-span-1 text-zinc-500 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-1">
              <label className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Importance
                <select
                  className="bg-[#0a0e14] border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-zinc-200 normal-case tracking-normal"
                  value={e.importance ?? SANDBOX_DEFAULT_IMPORTANCE}
                  onChange={(ev) => {
                    const arr = [...active.evidence];
                    arr[i] = {
                      ...e,
                      importance: ev.target.value as SandboxEvidenceImportance,
                    };
                    update({ ...active, evidence: arr });
                  }}
                >
                  {IMPORTANCE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-[11px] text-amber-300/90">
                <input
                  type="checkbox"
                  checked={Boolean(e.isRedHerring)}
                  onChange={(ev) => {
                    const arr = [...active.evidence];
                    arr[i] = { ...e, isRedHerring: ev.target.checked };
                    update({ ...active, evidence: arr });
                  }}
                />
                Red herring
              </label>
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Hint tiers (up to 4)"
        onAdd={() => {
          const current = active.hints ?? [];
          if (current.length >= 4) return;
          const i = current.length;
          const next: SandboxHint = {
            label: DEFAULT_HINT_LABELS[i],
            text: '',
            scorePenalty: DEFAULT_HINT_PENALTIES[i],
          };
          update({ ...active, hints: [...current, next] });
        }}
      >
        {(active.hints ?? []).length === 0 && (
          <div className="text-[11px] text-zinc-500 italic">
            No hints — add a tier to give players a graduated nudge ladder.
          </div>
        )}
        {(active.hints ?? []).map((h, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 mb-2">
            <input
              className="col-span-3 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
              placeholder="label"
              value={h.label}
              onChange={(ev) => {
                const arr = [...(active.hints ?? [])];
                arr[i] = { ...h, label: ev.target.value };
                update({ ...active, hints: arr });
              }}
            />
            <input
              className="col-span-6 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
              placeholder="hint text"
              value={h.text}
              onChange={(ev) => {
                const arr = [...(active.hints ?? [])];
                arr[i] = { ...h, text: ev.target.value };
                update({ ...active, hints: arr });
              }}
            />
            <input
              type="number"
              min={0}
              className="col-span-2 bg-[#0a0e14] border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100"
              placeholder="penalty"
              value={h.scorePenalty}
              onChange={(ev) => {
                const arr = [...(active.hints ?? [])];
                const n = Number(ev.target.value);
                arr[i] = { ...h, scorePenalty: Number.isFinite(n) ? n : 0 };
                update({ ...active, hints: arr });
              }}
            />
            <button
              onClick={() => {
                const arr = (active.hints ?? []).filter((_, idx) => idx !== i);
                update({ ...active, hints: arr });
              }}
              className="col-span-1 text-zinc-500 hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </Section>

      <div className="flex gap-2 pt-2 border-t border-zinc-800/50">
        <button
          onClick={() => playScenario(active)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-fuchsia-100 border border-fuchsia-500/50 bg-fuchsia-500/10 rounded hover:bg-fuchsia-500/20"
        >
          <Play size={12} /> Play scenario
        </button>
        <button
          onClick={() => duplicate(active)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-200 border border-zinc-800/60 rounded hover:border-zinc-700"
        >
          <Copy size={12} /> Duplicate
        </button>
        <button
          onClick={openShare}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-fuchsia-200 border border-fuchsia-500/40 rounded hover:bg-fuchsia-500/10"
        >
          <Share2 size={12} /> Share
        </button>
        <button
          onClick={() => remove(active.id)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-300 border border-red-900/40 rounded hover:bg-red-500/10"
        >
          <Trash2 size={12} /> Delete
        </button>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
          <Save size={12} /> Auto-saved locally
        </span>
      </div>
    </div>
  );
}
