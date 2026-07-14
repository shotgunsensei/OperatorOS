import {
  Calendar,
  CreditCard,
  FlaskConical,
  LogIn,
  Settings,
  ShoppingBag,
  User,
} from 'lucide-react';
import type { AppView } from '@/types';

interface IncidentBoardHeaderProps {
  profileName: string;
  casesSolved: number;
  currentStreak: number;
  isSignedIn: boolean;
  isAdmin: boolean;
  setView: (view: AppView) => void;
}

export function IncidentBoardHeader({
  profileName,
  casesSolved,
  currentStreak,
  isSignedIn,
  isAdmin,
  setView,
}: IncidentBoardHeaderProps) {
  return (
    <header className="border-b border-zinc-800/60 px-4 sm:px-6 py-3 sm:py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="h-9 sm:h-10 w-auto select-none"
            draggable={false}
          />
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h1 className="font-mono text-lg font-bold text-cyan-400 tracking-wider uppercase">
            Faultline Lab
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setView('daily')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-cyan-400 transition-colors rounded-md hover:bg-zinc-800/50"
          >
            <Calendar size={14} />
            <span className="hidden sm:inline">Daily</span>
            {currentStreak > 0 && (
              <span className="text-orange-400 font-mono">{currentStreak}</span>
            )}
          </button>
          <button
            onClick={() => setView('sandbox')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-purple-300 transition-colors rounded-md hover:bg-zinc-800/50"
          >
            <FlaskConical size={14} />
            <span className="hidden sm:inline">Sandbox</span>
          </button>
          <button
            onClick={() => setView('store')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-cyan-400 transition-colors rounded-md hover:bg-zinc-800/50"
          >
            <ShoppingBag size={14} />
            <span className="hidden sm:inline">Store</span>
          </button>
          <button
            onClick={() => setView('profile')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-800/50"
          >
            <User size={14} />
            <span className="hidden sm:inline">{profileName}</span>
            <span className="text-cyan-400 font-mono">{casesSolved} solved</span>
          </button>
          {!isSignedIn && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && (
            <button
              onClick={() => setView('auth')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20"
            >
              <LogIn size={14} />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setView('admin')}
              className="px-2.5 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 font-mono uppercase tracking-wider"
            >
              Admin
            </button>
          )}
          {isSignedIn && (
            <button
              onClick={() => setView('account')}
              className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Account & billing"
              aria-label="Account & billing"
            >
              <CreditCard size={16} />
            </button>
          )}
          <button
            onClick={() => setView('settings')}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
