import { motion } from 'framer-motion';
import type { Debrief } from '@/types';
import {
  Target,
  Search,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Award,
  Shield,
  Trophy,
} from 'lucide-react';

export function DebriefSections({ debrief }: { debrief: Debrief }) {
  return (
    <div className="space-y-6">
      <Section title="Actual Root Cause" icon={<Target size={16} />}>
        <h3 className="text-base font-semibold text-zinc-100 mb-2">
          {debrief.actualRootCause.title}
        </h3>
        <p className="text-sm text-zinc-400 mb-3">
          {debrief.actualRootCause.description}
        </p>
        <div className="bg-[#0c1017] border border-zinc-800/40 rounded p-3">
          <p className="text-xs font-mono text-zinc-500 leading-relaxed">
            {debrief.actualRootCause.technicalDetail}
          </p>
        </div>
      </Section>

      <Section title="Key Evidence" icon={<Search size={16} />}>
        <div className="space-y-2">
          {debrief.cluesThatMattered.map(clue => (
            <div key={clue.id} className="flex items-start gap-2 text-sm">
              <CheckCircle size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-zinc-200 font-medium">{clue.title}:</span>{' '}
                <span className="text-zinc-400">{clue.description}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Red Herrings" icon={<AlertTriangle size={16} />}>
        <div className="space-y-2">
          {debrief.misleadingClues.map((clue, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <span className="text-zinc-400">{clue}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Recommended Remediation" icon={<Wrench size={16} />}>
        <p className="text-sm text-zinc-400">{debrief.recommendedRemediation}</p>
      </Section>

      <Section title="Preventative Measures" icon={<Shield size={16} />}>
        <ul className="space-y-1">
          {debrief.preventativeMeasures.map((measure, i) => (
            <li key={i} className="text-sm text-zinc-400 flex items-start gap-2">
              <span className="text-cyan-500 mt-1">-</span>
              {measure}
            </li>
          ))}
        </ul>
      </Section>

      {debrief.achievementsUnlocked.length > 0 && (
        <Section title="Achievements Unlocked" icon={<Award size={16} />}>
          <div className="flex flex-wrap gap-2">
            {debrief.achievementsUnlocked.map(achievement => (
              <motion.div
                key={achievement}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs text-amber-400"
              >
                <Trophy size={12} />
                {achievement}
              </motion.div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111822] border border-zinc-800/40 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3 text-cyan-400">
        {icon}
        <h2 className="text-sm font-mono uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </div>
  );
}
