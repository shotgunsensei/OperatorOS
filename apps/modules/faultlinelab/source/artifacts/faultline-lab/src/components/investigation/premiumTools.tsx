import {
  BarChart3,
  ChevronUp,
  FlaskConical,
  Gauge,
  Lock,
  Network,
  Zap,
} from 'lucide-react';
import { getRequiredProductForFeature } from '@/lib/entitlements';

export interface PremiumToolMeta {
  id: string;
  label: string;
  icon: typeof Network;
  description: string;
  baseline: string;
}

export const premiumTools: PremiumToolMeta[] = [
  {
    id: 'wireshark-panel',
    label: 'Wireshark',
    icon: Network,
    description:
      'Inspect packet captures, decode protocols, and follow streams alongside your terminal session.',
    baseline:
      'Open the Wireshark tab to inspect the capture for this case. Use the filter bar (e.g. proto:tcp, port:443) to narrow the trace.',
  },
  {
    id: 'deep-telemetry',
    label: 'Deep Telemetry',
    icon: Gauge,
    description:
      'Stream high-resolution metrics, heatmaps, and anomaly markers from the system under investigation.',
    baseline:
      'Open the Telemetry tab to scrub through CPU, memory, and latency series. Anomaly markers highlight likely incident windows.',
  },
  {
    id: 'chaos-mode',
    label: 'Chaos Mode',
    icon: Zap,
    description:
      'Randomize evidence order, inject red herrings, and add time pressure for replayable challenge runs.',
    baseline:
      'Open the Chaos tab to enable modifiers (shuffled evidence, extra red herrings, timed runs) before re-attempting any case.',
  },
  {
    id: 'sandbox-pro',
    label: 'Sandbox',
    icon: FlaskConical,
    description: 'Spin up a custom scenario sandbox to author your own diagnostic puzzles.',
    baseline:
      'Open the Sandbox tab to author your own scenarios — symptoms, terminal commands, evidence, and a guided diagnosis flow.',
  },
  {
    id: 'pro-analytics',
    label: 'Analytics',
    icon: BarChart3,
    description:
      'Career dashboards, skill heatmaps, and exportable case reports tied to this investigation.',
    baseline:
      'Open the Analytics tab to see your skill heatmap, time-to-diagnose trends, and exportable case reports.',
  },
];

interface PremiumToolPanelProps {
  tool: PremiumToolMeta;
  unlocked: boolean;
  onUpgrade: () => void;
}

export function PremiumToolPanel({ tool, unlocked, onUpgrade }: PremiumToolPanelProps) {
  const Icon = tool.icon;
  const required = unlocked ? null : getRequiredProductForFeature(tool.id);

  if (unlocked) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#0d1219] border border-emerald-500/20 rounded-lg p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-300 mb-3">
            <Icon size={20} />
          </div>
          <p className="text-[11px] font-mono uppercase tracking-wider text-emerald-300/80 mb-1">
            {tool.label} ready
          </p>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">{tool.label}</h3>
          <p className="text-sm text-zinc-400 leading-relaxed mb-3">{tool.description}</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.baseline}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gradient-to-br from-zinc-900 to-[#0d1219] border border-cyan-800/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Lock size={18} />
          </div>
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400/80">
              Premium tool locked
            </p>
            <h3 className="text-base font-semibold text-zinc-100">{tool.label}</h3>
          </div>
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed mb-4">{tool.description}</p>

        {required && (
          <div className="rounded-md border border-zinc-800/60 bg-black/20 p-3 mb-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
              Included in
            </p>
            <p className="text-sm text-zinc-200 font-semibold">{required.name}</p>
            {required.shortDescription && (
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                {required.shortDescription}
              </p>
            )}
          </div>
        )}

        <button
          onClick={onUpgrade}
          disabled={!required}
          className="w-full py-2.5 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <ChevronUp size={14} className="rotate-90" />
          {required ? `Unlock ${tool.label}` : 'Coming soon'}
        </button>
        <p className="text-[11px] text-zinc-500 text-center mt-3">
          Free tools (Terminal, Event Logs, Tickets) stay available — upgrades only add to your kit.
        </p>
      </div>
    </div>
  );
}
