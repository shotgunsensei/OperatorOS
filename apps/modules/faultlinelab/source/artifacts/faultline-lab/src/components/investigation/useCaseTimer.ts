import { useEffect, useState } from 'react';
import type { CaseState } from '@/types';

export type Countdown = { label: string; overtime: boolean };

export function useCaseTimer(currentCaseState: CaseState | null) {
  const [elapsed, setElapsed] = useState('00:00');
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!currentCaseState) return;
    const tick = () => {
      const ms = Date.now() - currentCaseState.startedAt;
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      setElapsed(
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );

      if (currentCaseState.chaos?.timePressure && currentCaseState.timeLimitMs) {
        const remainingMs = currentCaseState.timeLimitMs - ms;
        const overtime = remainingMs < 0;
        const absMs = Math.abs(remainingMs);
        const m = Math.floor(absMs / 60000).toString().padStart(2, '0');
        const s = Math.floor((absMs % 60000) / 1000).toString().padStart(2, '0');
        setCountdown({ label: `${overtime ? '+' : ''}${m}:${s}`, overtime });
      } else {
        setCountdown(null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentCaseState]);

  return { elapsed, countdown };
}
