import { motion } from 'framer-motion';
import { Briefcase, X } from 'lucide-react';
import { categoryLabels, difficultyColors } from '@/data/cases';
import { getCaseEntryById } from '@/data/caseCatalog';
import { CaseAuthorAvatar } from '../CaseAuthorAvatar';
import type { CaseDefinition } from '@/types';

interface Props {
  caseDef: CaseDefinition;
  onClose: () => void;
}

export function BriefingModal({ caseDef, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#111822] border border-zinc-800/60 rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <Briefcase size={16} className="text-cyan-400" />
            <h2 className="font-mono text-sm uppercase tracking-wider text-zinc-200">
              Case Briefing
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {(() => {
            const entry = getCaseEntryById(caseDef.id);
            const avatarEntry = entry ?? {
              title: caseDef.title,
              authorImagePath: undefined,
            };
            return (
              <div className="flex items-start gap-4 mb-4">
                <CaseAuthorAvatar entry={avatarEntry} size={64} />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-zinc-100 mb-2">
                    {caseDef.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">
                      {categoryLabels[caseDef.category]}
                    </span>
                    <span className="text-zinc-700">|</span>
                    <span
                      className={`uppercase tracking-wider ${difficultyColors[caseDef.difficulty]}`}
                    >
                      {caseDef.difficulty}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
          <pre className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap font-sans mb-6">
            {caseDef.briefing}
          </pre>

          <p className="text-sm text-zinc-500 mb-4">{caseDef.description}</p>

          <button
            onClick={onClose}
            className="w-full py-3 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs uppercase tracking-widest rounded hover:bg-cyan-500/20 transition-colors"
          >
            Begin Investigation
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
