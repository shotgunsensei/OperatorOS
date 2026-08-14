import { motion } from 'framer-motion';
import { ArrowRight, Zap } from 'lucide-react';
import type { AppView } from '@/types';

interface ProUpsellBannerProps {
  setView: (view: AppView) => void;
}

export function ProUpsellBanner({ setView }: ProUpsellBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="mb-6 p-4 bg-gradient-to-r from-amber-500/5 to-transparent border border-amber-500/20 rounded-lg flex items-center justify-between gap-4 flex-wrap"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded bg-amber-500/10 text-amber-400">
          <Zap size={16} />
        </div>
        <div>
          <div className="text-sm text-zinc-200 font-medium">
            Ready for harder cases?
          </div>
          <div className="text-xs text-zinc-500">
            Pro unlocks every case, advanced tools, and deep telemetry — $8.99/mo or $79/yr.
          </div>
        </div>
      </div>
      <button
        onClick={() => setView('store')}
        className="text-xs text-amber-300 hover:text-amber-200 font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors flex items-center gap-1.5"
      >
        See Pricing
        <ArrowRight size={12} />
      </button>
    </motion.div>
  );
}
