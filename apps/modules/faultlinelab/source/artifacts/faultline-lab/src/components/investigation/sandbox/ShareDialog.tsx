import { RefObject } from 'react';
import {
  Check,
  Copy,
  Download,
  Plus,
  Share2,
  Upload,
  X,
} from 'lucide-react';
import type { SandboxScenario } from '@/lib/sandboxScenarios';

export type ShareMode = 'export' | 'import' | null;

export const EXPORT_FORMAT = 'faultline-lab.sandbox-scenario.v1';

export interface ScenarioExport {
  format: typeof EXPORT_FORMAT;
  exportedAt: number;
  scenario: Omit<SandboxScenario, 'id' | 'createdAt' | 'updatedAt'>;
}

export function toExport(s: SandboxScenario): ScenarioExport {
  return {
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
  };
}

export function ShareDialog({
  shareMode,
  onClose,
  active,
  copied,
  copyScenario,
  downloadScenario,
  fileInputRef,
  onPickFile,
  importText,
  setImportText,
  importError,
  setImportError,
  importScenario,
}: {
  shareMode: ShareMode;
  onClose: () => void;
  active: SandboxScenario | null;
  copied: boolean;
  copyScenario: (s: SandboxScenario) => void;
  downloadScenario: (s: SandboxScenario) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onPickFile: (file: File | null) => void;
  importText: string;
  setImportText: (text: string) => void;
  importError: string | null;
  setImportError: (err: string | null) => void;
  importScenario: (raw: string) => void;
}) {
  if (!shareMode) return null;
  return (
    <div
      className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#0c1017] border border-fuchsia-900/40 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-fuchsia-300">
            {shareMode === 'export' ? <Share2 size={13} /> : <Upload size={13} />}
            {shareMode === 'export' ? 'Share scenario' : 'Import scenario'}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {shareMode === 'export' && active && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-zinc-400">
              Send this scenario to another player by downloading the file or copying the JSON
              below. They can paste or upload it from their own Sandbox panel.
            </p>
            <textarea
              readOnly
              rows={10}
              className="w-full bg-[#0a0e14] border border-zinc-800 rounded p-2 text-[11px] font-mono text-zinc-200 focus:outline-none"
              value={JSON.stringify(toExport(active), null, 2)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadScenario(active)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-fuchsia-200 border border-fuchsia-500/40 rounded hover:bg-fuchsia-500/10"
              >
                <Download size={12} /> Download JSON
              </button>
              <button
                onClick={() => copyScenario(active)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-200 border border-zinc-800/60 rounded hover:border-zinc-700"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy to clipboard'}
              </button>
            </div>
            <p className="text-[11px] text-amber-300/80 border-t border-zinc-800/50 pt-2">
              Heads up: shared cases run with the same ephemeral semantics as authored ones.
              They live only in the recipient's browser, won't sync across devices, and will
              disappear if they clear local storage.
            </p>
          </div>
        )}

        {shareMode === 'import' && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-zinc-400">
              Paste a scenario JSON below, or upload a <code>.json</code> file an author shared
              with you.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onPickFile(e.target.files?.[0] || null);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-200 border border-zinc-800/60 rounded hover:border-zinc-700"
            >
              <Upload size={12} /> Choose file…
            </button>
            <textarea
              rows={10}
              placeholder="Paste scenario JSON here…"
              className="w-full bg-[#0a0e14] border border-zinc-800 rounded p-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-fuchsia-500/50"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                if (importError) setImportError(null);
              }}
            />
            {importError && (
              <div className="text-[11px] text-red-300 border border-red-900/40 rounded px-2 py-1.5 bg-red-500/5">
                {importError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                disabled={!importText.trim()}
                onClick={() => importScenario(importText)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-fuchsia-200 border border-fuchsia-500/40 rounded hover:bg-fuchsia-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={12} /> Add to my sandbox
              </button>
            </div>
            <p className="text-[11px] text-amber-300/80 border-t border-zinc-800/50 pt-2">
              Heads up: imported cases run with the same ephemeral semantics as authored ones.
              They live only in this browser, won't sync across devices, and will disappear if
              you clear local storage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
