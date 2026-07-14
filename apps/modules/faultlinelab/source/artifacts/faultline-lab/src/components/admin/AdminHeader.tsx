import { ArrowLeft, BarChart3, FilePlus } from 'lucide-react';

export type AdminTab = 'catalog' | 'users' | 'authoring' | 'cross-promo';

type Props = {
  tab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onBack: () => void;
};

export function AdminHeader({ tab, onTabChange, onBack }: Props) {
  return (
    <header className="border-b border-zinc-800/60 bg-zinc-900/50 sticky top-0 z-30 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 hover:text-cyan-400 p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold font-mono tracking-wide text-emerald-400">ADMIN</h1>
          <p className="text-xs text-zinc-500">Catalog & entitlement management</p>
        </div>
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden text-xs">
          <button
            onClick={() => onTabChange('catalog')}
            className={`px-3 py-1.5 font-mono uppercase tracking-wider ${
              tab === 'catalog'
                ? 'bg-zinc-800 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Catalog
          </button>
          <button
            onClick={() => onTabChange('users')}
            className={`px-3 py-1.5 font-mono uppercase tracking-wider ${
              tab === 'users'
                ? 'bg-zinc-800 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => onTabChange('authoring')}
            className={`px-3 py-1.5 font-mono uppercase tracking-wider flex items-center gap-1 ${
              tab === 'authoring'
                ? 'bg-zinc-800 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FilePlus size={12} /> Authoring
          </button>
          <button
            onClick={() => onTabChange('cross-promo')}
            className={`px-3 py-1.5 font-mono uppercase tracking-wider flex items-center gap-1 ${
              tab === 'cross-promo'
                ? 'bg-zinc-800 text-emerald-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 size={12} /> Cross-promo
          </button>
        </div>
      </div>
    </header>
  );
}
