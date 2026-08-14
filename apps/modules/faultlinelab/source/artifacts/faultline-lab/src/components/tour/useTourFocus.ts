import { useEffect, useRef, type RefObject } from 'react';
import type { TourStep } from './steps';

/**
 * Manages focus for the onboarding overlay: stores the previously-focused
 * element on open and restores it on close, and moves focus to the step's
 * primary action whenever the visible step changes.
 */
export function useTourFocus(
  open: boolean,
  step: TourStep | null,
  primaryActionRef: RefObject<HTMLButtonElement | null>,
) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !step) return;
    const raf = requestAnimationFrame(() => primaryActionRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, step, primaryActionRef]);
}
