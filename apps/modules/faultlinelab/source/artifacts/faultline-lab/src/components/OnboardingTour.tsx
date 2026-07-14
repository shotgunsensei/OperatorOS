import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/stores/useAppStore';
import { Compass } from 'lucide-react';
import {
  STEPS,
  computeCardStyle,
  readAnchorRect,
  type AnchorRect,
  type StepId,
  type TourStep,
} from './tour/steps';
import { TourCard } from './tour/TourCard';
import { useTourKeyboard } from './tour/useTourKeyboard';
import { useTourFocus } from './tour/useTourFocus';

interface OnboardingTourProps {
  open: boolean;
  /**
   * Called whenever the user finishes the last step or explicitly dismisses
   * (Esc / backdrop / Skip / X). Per spec, any dismissal is remembered so the
   * tour does not replay until the user invokes the Replay action.
   */
  onClose: () => void;
}

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const view = useAppStore((s) => s.view);
  const [seen, setSeen] = useState<Set<StepId>>(() => new Set());
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  // Reset the seen-set whenever the tour transitions from closed -> open so
  // a Replay action restarts cleanly.
  useEffect(() => {
    if (open) setSeen(new Set());
  }, [open]);

  // The currently displayable step: first not-yet-seen step whose required
  // view matches (or has none). When nothing matches the current view, the
  // overlay hides itself and waits for the user to navigate.
  const step = useMemo<TourStep | null>(() => {
    if (!open) return null;
    for (const s of STEPS) {
      if (seen.has(s.id)) continue;
      if (s.requiredView && s.requiredView !== view) continue;
      return s;
    }
    return null;
  }, [open, seen, view]);

  const isLastUnseen = useMemo(() => {
    if (!step) return false;
    // True iff no other unseen step exists after this one.
    const idx = STEPS.findIndex((s) => s.id === step.id);
    for (let i = idx + 1; i < STEPS.length; i++) {
      if (!seen.has(STEPS[i].id)) return false;
    }
    return true;
  }, [step, seen]);

  useLayoutEffect(() => {
    if (!open || !step) {
      setAnchorRect(null);
      return;
    }
    const measure = () => setAnchorRect(readAnchorRect(step.anchorSelector));
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  useTourFocus(open, step, primaryActionRef);
  useTourKeyboard({ open, step, seen, isLastUnseen, dialogRef, setSeen, onClose });

  if (!open) return null;

  if (!step) {
    return (
      <button
        type="button"
        onClick={() => onClose()}
        className="fixed bottom-4 right-4 z-[100] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0d131c]/95 border border-cyan-500/40 text-[11px] font-mono uppercase tracking-wider text-cyan-200 hover:bg-cyan-500/15 transition-colors shadow-lg shadow-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        aria-label="Skip onboarding tour"
      >
        <Compass size={12} />
        Skip tour
      </button>
    );
  }

  const cardStyle = computeCardStyle(anchorRect);

  const advance = () => {
    const nextSeen = new Set(seen);
    nextSeen.add(step.id);
    setSeen(nextSeen);
    if (isLastUnseen) onClose();
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
    >
      <button
        type="button"
        aria-label="Dismiss tour"
        tabIndex={-1}
        onClick={() => onClose()}
        className="absolute inset-0 w-full h-full bg-black/70 backdrop-blur-[2px]"
      />

      <AnimatePresence>
        {anchorRect && (
          <motion.div
            key={`spot-${step.id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            style={{
              top: anchorRect.top - 6,
              left: anchorRect.left - 6,
              width: anchorRect.width + 12,
              height: anchorRect.height + 12,
            }}
          />
        )}
      </AnimatePresence>

      <TourCard
        ref={primaryActionRef}
        step={step}
        seen={seen}
        cardStyle={cardStyle}
        isLastUnseen={isLastUnseen}
        onAdvance={advance}
        onClose={onClose}
      />
    </div>
  );
}
