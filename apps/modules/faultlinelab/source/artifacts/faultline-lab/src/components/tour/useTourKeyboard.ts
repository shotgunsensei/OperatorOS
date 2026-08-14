import { useEffect, type RefObject } from 'react';
import type { StepId, TourStep } from './steps';

interface UseTourKeyboardOpts {
  open: boolean;
  step: TourStep | null;
  seen: Set<StepId>;
  isLastUnseen: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  setSeen: (s: Set<StepId>) => void;
  onClose: () => void;
}

/**
 * Wires up keyboard handling for the onboarding overlay: Escape closes,
 * ArrowRight advances, and Tab is trapped inside the dialog.
 */
export function useTourKeyboard({
  open,
  step,
  seen,
  isLastUnseen,
  dialogRef,
  setSeen,
  onClose,
}: UseTourKeyboardOpts) {
  useEffect(() => {
    if (!open || !step) return;
    const advance = () => {
      const nextSeen = new Set(seen);
      nextSeen.add(step.id);
      setSeen(nextSeen);
      if (isLastUnseen) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Enter is left to native button activation to avoid double-firing.
      if (e.key === 'ArrowRight') {
        advance();
        return;
      }
      if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, step, seen, isLastUnseen, dialogRef, setSeen, onClose]);
}
