import { useAppStore } from '@/stores/useAppStore';
import { ArrowLeft } from 'lucide-react';
import { AccountSection } from './settings/AccountSection';
import { PreferenceSection } from './settings/PreferenceSection';
import { ResetDataCard } from './settings/ResetDataCard';

export default function SettingsScreen() {
  const setView = useAppStore(s => s.setView);

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setView('incident-board')}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
            Settings
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 pb-20 sm:pb-8">
        <AccountSection />
        <PreferenceSection />
        <ResetDataCard />
      </main>
    </div>
  );
}
