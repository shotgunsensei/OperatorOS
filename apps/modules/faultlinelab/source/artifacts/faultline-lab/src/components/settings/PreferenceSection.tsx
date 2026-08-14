import { Volume2, VolumeX, Sparkles, Type, Compass } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { SettingsRow, ToggleSwitch } from './SettingsRow';

export function PreferenceSection() {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const setView = useAppStore(s => s.setView);

  const handleReplayTour = () => {
    updateSettings({ onboardingTourCompletedAt: null });
    setView('incident-board');
  };

  return (
    <>
      <SettingsRow
        icon={
          settings.soundEnabled ? (
            <Volume2 size={16} className="text-cyan-400" />
          ) : (
            <VolumeX size={16} className="text-zinc-500" />
          )
        }
        title="Sound Effects"
        description="Toggle sound effects"
        action={
          <ToggleSwitch
            on={settings.soundEnabled}
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
          />
        }
      />

      <SettingsRow
        icon={<Sparkles size={16} className="text-cyan-400" />}
        title="Animations"
        description="Toggle motion and transitions"
        action={
          <ToggleSwitch
            on={settings.animationsEnabled}
            onClick={() => updateSettings({ animationsEnabled: !settings.animationsEnabled })}
          />
        }
      />

      <SettingsRow
        icon={<Type size={16} className="text-cyan-400" />}
        title="Terminal Font Size"
        description={`${settings.terminalFontSize}px`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                updateSettings({
                  terminalFontSize: Math.max(10, settings.terminalFontSize - 1),
                })
              }
              className="w-8 h-8 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
            >
              -
            </button>
            <span className="w-8 text-center text-sm font-mono text-zinc-300">
              {settings.terminalFontSize}
            </span>
            <button
              onClick={() =>
                updateSettings({
                  terminalFontSize: Math.min(20, settings.terminalFontSize + 1),
                })
              }
              className="w-8 h-8 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
            >
              +
            </button>
          </div>
        }
      />

      <SettingsRow
        className="mt-4"
        icon={<Compass size={16} className="text-cyan-400" />}
        title="Replay onboarding tour"
        description="Re-show the 4-step intro on the Incident Board"
        action={
          <button
            onClick={handleReplayTour}
            className="px-3 py-1.5 rounded text-xs font-mono uppercase bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          >
            Replay
          </button>
        }
      />
    </>
  );
}
