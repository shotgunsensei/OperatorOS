'use client';

import React, { useEffect, useState } from 'react';
import OperatorMark from './OperatorMark';

interface OperatorLoaderProps {
  fullScreen?: boolean;
  label?: string;
  steps?: string[];
}

const DEFAULT_STEPS = [
  'Loading modules',
  'Checking entitlements',
  'Preparing command layer',
  'Syncing operator console',
];

/**
 * OperatorLoader — branded splash/loading state.
 *
 * - Animated O command ring (pulse + slow rotate)
 * - "Booting OperatorOS…" label
 * - Rotating status text
 * - Respects `prefers-reduced-motion`: drops the rotation animation and
 *   pins the status line to the first step.
 */
export default function OperatorLoader({
  fullScreen = true,
  label = 'Booting OperatorOS…',
  steps = DEFAULT_STEPS,
}: OperatorLoaderProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    if (reducedMotion || steps.length <= 1) return;
    const t = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 1400);
    return () => clearInterval(t);
  }, [reducedMotion, steps.length]);

  const wrapperStyle: React.CSSProperties = fullScreen
    ? {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--brand-bg-primary, #080B12)',
        color: 'var(--brand-text-secondary, #A7B0C0)',
      }
    : {
        padding: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };

  return (
    <div data-testid="branded-loader" role="status" aria-live="polite" style={wrapperStyle}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes operatoros-loader-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes operatoros-loader-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.75; transform: scale(1.04); }
        }
        .operatoros-loader-ring {
          animation: operatoros-loader-pulse 2.2s ease-in-out infinite;
        }
        .operatoros-loader-spin {
          animation: operatoros-loader-spin 6s linear infinite;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-loader-ring,
          .operatoros-loader-spin {
            animation: none !important;
          }
        }
      ` }} />
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div
          className="operatoros-loader-spin"
          style={{
            width: 72,
            height: 72,
            margin: '0 auto 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="operatoros-loader-ring" style={{ display: 'inline-flex' }}>
            <OperatorMark size={64} glow />
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--brand-font-display, "Space Grotesk", Inter, system-ui, sans-serif)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--brand-text-primary, #F8FAFC)',
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </div>
        <div
          data-testid="branded-loader-status"
          style={{
            marginTop: 6,
            fontSize: 13,
            color: 'var(--brand-text-muted, #6B7280)',
            minHeight: 20,
            transition: 'opacity 0.3s',
          }}
        >
          {steps[stepIdx]}
        </div>
      </div>
    </div>
  );
}
