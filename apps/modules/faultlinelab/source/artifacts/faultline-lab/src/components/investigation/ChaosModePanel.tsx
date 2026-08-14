import { useEffect, useState } from 'react';
import { Zap, Shuffle, Bomb, Timer, EyeOff, RotateCcw } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import {
  DEFAULT_CHAOS as DEFAULTS,
  loadChaosSettings,
  saveChaosSettings,
  type ChaosSettings,
} from '@/lib/chaos';

export type { ChaosSettings };
export { loadChaosSettings, saveChaosSettings };

const TOGGLES: { key: keyof ChaosSettings; label: string; desc: string; icon: typeof Zap }[] = [
  {
    key: 'shuffleEvidence',
    label: 'Shuffle Evidence',
    desc: 'Randomize the order evidence appears in the locker.',
    icon: Shuffle,
  },
  {
    key: 'injectRedHerrings',
    label: 'Inject Red Herrings',
    desc: 'Spawn extra plausible-but-false leads in event logs.',
    icon: Bomb,
  },
  {
    key: 'timePressure',
    label: 'Time Pressure',
    desc: 'Show a countdown that penalizes slow diagnoses.',
    icon: Timer,
  },
  {
    key: 'hintBlackout',
    label: 'Hint Blackout',
    desc: 'Disable hints completely for the run.',
    icon: EyeOff,
  },
];

export default function ChaosModePanel() {
  const currentCaseDef = useAppStore((s) => s.currentCaseDef);
  const currentCaseState = useAppStore((s) => s.currentCaseState);
  const [settings, setSettings] = useState<ChaosSettings>(DEFAULTS);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (currentCaseDef) setSettings(loadChaosSettings(currentCaseDef.id));
  }, [currentCaseDef]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!currentCaseDef) return null;

  const activeChaos = currentCaseState?.chaos;
  const timeLimitMs = currentCaseState?.timeLimitMs;
  const elapsedMs = currentCaseState ? now - currentCaseState.startedAt : 0;
  const remainingMs =
    activeChaos?.timePressure && timeLimitMs ? timeLimitMs - elapsedMs : null;
  const overtimeSec =
    remainingMs !== null && remainingMs < 0 ? Math.floor(-remainingMs / 1000) : 0;
  const formatClock = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const update = (next: ChaosSettings) => {
    setSettings(next);
    saveChaosSettings(currentCaseDef.id, next);
  };

  const enabledCount = TOGGLES.filter((t) => settings[t.key]).length;
  const score = Math.round((enabledCount * 25 + (settings.intensity - 1) * 25) * 0.6);

  return (
    <div className="flex flex-col h-full bg-[#0c1017] rounded-lg border border-amber-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#111822] border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            Chaos Mode · {currentCaseDef.title}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-zinc-500">Modifiers: {enabledCount}/{TOGGLES.length}</span>
          <span className="text-amber-300">+{score}% challenge</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeChaos && (
          <div className="p-2 rounded border border-amber-700/40 bg-amber-500/5 text-[11px] text-amber-200 font-mono">
            Active modifiers for this run:{' '}
            {[
              activeChaos.shuffleEvidence && 'shuffle',
              activeChaos.injectRedHerrings && 'red-herrings',
              activeChaos.timePressure && 'time-pressure',
              activeChaos.hintBlackout && 'hint-blackout',
            ]
              .filter(Boolean)
              .join(' · ') || 'none'}
            {' · '}intensity ×{activeChaos.intensity.toFixed(1)}
          </div>
        )}

        {remainingMs !== null && (
          <div
            className={`p-3 rounded border ${
              overtimeSec > 0
                ? 'border-red-500/50 bg-red-500/10 text-red-200'
                : 'border-amber-500/40 bg-amber-500/5 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="uppercase tracking-wider">
                {overtimeSec > 0 ? 'Overtime' : 'Time remaining'}
              </span>
              <span className="text-base font-semibold">
                {overtimeSec > 0 ? `+${formatClock(overtimeSec * 1000)}` : formatClock(remainingMs)}
              </span>
            </div>
            <p className="text-[11px] mt-1 opacity-80">
              {overtimeSec > 0
                ? 'Every 30s past the deadline costs 2 efficiency points (capped at 20).'
                : 'Submit before the timer hits 00:00 to avoid time penalties.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TOGGLES.map((t) => {
            const Icon = t.icon;
            const on = !!settings[t.key];
            return (
              <button
                key={t.key}
                onClick={() => update({ ...settings, [t.key]: !on })}
                className={`text-left p-3 rounded border transition-colors ${
                  on
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-zinc-800/60 bg-[#0a0e14] hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={on ? 'text-amber-300' : 'text-zinc-500'} />
                  <span className={`text-sm font-medium ${on ? 'text-amber-100' : 'text-zinc-300'}`}>
                    {t.label}
                  </span>
                  <span className={`ml-auto text-[10px] font-mono uppercase ${on ? 'text-amber-300' : 'text-zinc-600'}`}>
                    {on ? 'on' : 'off'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{t.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="p-3 rounded border border-zinc-800/60 bg-[#0a0e14]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Intensity ×{settings.intensity.toFixed(1)}
            </span>
            <span className="text-[10px] text-zinc-600">scales every active modifier</span>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={settings.intensity}
            onChange={(e) => update({ ...settings, intensity: parseFloat(e.target.value) })}
            className="w-full accent-amber-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => update(DEFAULTS)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800/60 rounded"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <p className="text-[11px] text-zinc-500">
            Settings are saved per case. They will apply on your next restart of this case.
          </p>
        </div>
      </div>
    </div>
  );
}
