import { Search, Wrench, ClipboardCheck, Sparkles } from 'lucide-react';
import type { AppView } from '@/types';

export type StepId = 'welcome' | 'pick-incident' | 'investigate' | 'debrief';

export interface TourStep {
  id: StepId;
  title: string;
  body: string;
  /**
   * If set, this step is only eligible to render when the app is currently
   * showing this view. The tour shows the first eligible unseen step.
   */
  requiredView?: AppView;
  /** CSS selector resolved when the step is shown; null = centered card. */
  anchorSelector?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

export const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Faultline Lab',
    body:
      'Faultline Lab drops you into broken systems. Read the briefing, run real commands, gather evidence, then submit your diagnosis. This quick tour walks you through the three screens you will use most.',
    requiredView: 'incident-board',
    icon: Sparkles,
  },
  {
    id: 'pick-incident',
    title: 'Step 1 — Pick an incident',
    body:
      'Every card on this board is a self-contained scenario with its own briefing, telemetry, and scoring rubric. Click a playable card to begin — the four free starters are a good place to learn the rhythm.',
    requiredView: 'incident-board',
    anchorSelector: '[data-tour="case-grid"]',
    icon: Search,
  },
  {
    id: 'investigate',
    title: 'Step 2 — Run the investigation',
    body:
      'This is your investigation workspace. Use the terminal, event logs, and ticket history on the left; pin findings to the evidence locker on the right. The scoring engine rewards efficient diagnostics.',
    requiredView: 'investigation',
    anchorSelector: '[data-tour="investigation-workspace"]',
    icon: Wrench,
  },
  {
    id: 'debrief',
    title: 'Step 3 — Review your debrief',
    body:
      'After you submit a diagnosis, the debrief screen breaks down what you got right, what you missed, and where to improve next time. Replay the case any time to chase a higher tier.',
    requiredView: 'debrief',
    anchorSelector: '[data-tour="debrief-summary"]',
    icon: ClipboardCheck,
  },
];

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function readAnchorRect(selector?: string): AnchorRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function computeCardStyle(anchorRect: AnchorRect | null): React.CSSProperties {
  if (!anchorRect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 420,
      maxWidth: 'calc(100vw - 32px)',
    };
  }
  const cardWidth = 420;
  const margin = 16;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const preferredLeft = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - cardWidth / 2, margin),
    viewportW - cardWidth - margin,
  );
  const spaceBelow = viewportH - (anchorRect.top + anchorRect.height);
  const placeBelow = spaceBelow > 240;
  const top = placeBelow
    ? anchorRect.top + anchorRect.height + 16
    : Math.max(anchorRect.top - 240, margin);
  return {
    top,
    left: preferredLeft,
    width: cardWidth,
    maxWidth: `calc(100vw - ${margin * 2}px)`,
  };
}
