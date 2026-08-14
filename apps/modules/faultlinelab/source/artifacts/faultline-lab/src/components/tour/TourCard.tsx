import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import { STEPS, type StepId, type TourStep } from './steps';

interface TourCardProps {
  step: TourStep;
  seen: Set<StepId>;
  cardStyle: React.CSSProperties;
  isLastUnseen: boolean;
  onAdvance: () => void;
  onClose: () => void;
}

export const TourCard = forwardRef<HTMLButtonElement, TourCardProps>(function TourCard(
  { step, seen, cardStyle, isLastUnseen, onAdvance, onClose },
  primaryActionRef,
) {
  const Icon = step.icon;
  const stepNumber = STEPS.findIndex((s) => s.id === step.id) + 1;

  return (
    <motion.div
      key={`card-${step.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute bg-[#0d131c] border border-cyan-500/40 rounded-lg shadow-xl shadow-cyan-500/10 p-5 font-sans"
      style={cardStyle}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/80 mb-0.5">
            Tour · {stepNumber} / {STEPS.length}
          </div>
          <h2
            id="onboarding-tour-title"
            className="text-base font-semibold text-zinc-100 leading-snug"
          >
            {step.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip tour"
          className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          <X size={14} />
        </button>
      </div>

      <p className="text-sm text-zinc-400 leading-relaxed mb-4">{step.body}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {STEPS.map((s) => {
            const isCurrent = s.id === step.id;
            const isDone = seen.has(s.id);
            return (
              <span
                key={s.id}
                className={`h-1.5 w-5 rounded-full transition-colors ${
                  isCurrent ? 'bg-cyan-400' : isDone ? 'bg-emerald-500/60' : 'bg-zinc-700'
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            Skip
          </button>
          {isLastUnseen ? (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={onAdvance}
              className="text-[11px] font-mono uppercase tracking-wider text-emerald-200 bg-emerald-500/15 border border-emerald-500/40 hover:bg-emerald-500/25 transition-colors px-3 py-1.5 rounded flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <Check size={12} />
              Finish
            </button>
          ) : (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={onAdvance}
              className="text-[11px] font-mono uppercase tracking-wider text-cyan-200 bg-cyan-500/15 border border-cyan-500/40 hover:bg-cyan-500/25 transition-colors px-3 py-1.5 rounded flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              Next
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
