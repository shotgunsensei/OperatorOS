import { motion } from 'framer-motion';
import { ArrowRight, Calendar, Sparkles } from 'lucide-react';
import type { AppView } from '@/types';

interface WelcomeBannerProps {
  setView: (view: AppView) => void;
}

export function WelcomeBanner({ setView }: WelcomeBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6 p-5 bg-gradient-to-r from-cyan-500/5 via-cyan-500/[0.02] to-transparent border border-cyan-500/20 rounded-lg"
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div className="p-2.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-[240px]">
          <h3 className="text-base font-semibold text-zinc-100 mb-1">
            Welcome, Investigator.
          </h3>
          <p className="text-sm text-zinc-400 mb-3 leading-relaxed">
            Faultline Lab drops you into broken systems. Read the briefing, run real commands, gather evidence, then submit your diagnosis.
            Start with one of the four free starter cases below — they teach the rhythm in about 20 minutes each.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setView('daily')}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors flex items-center gap-1.5"
            >
              <Calendar size={12} />
              Try Daily Challenge
            </button>
            <button
              onClick={() => setView('store')}
              className="text-xs text-zinc-400 hover:text-zinc-200 font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-600 transition-colors flex items-center gap-1.5"
            >
              Browse Packs
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
