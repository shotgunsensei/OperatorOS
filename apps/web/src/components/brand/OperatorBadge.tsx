'use client';

import React from 'react';
import OperatorMark from './OperatorMark';

interface OperatorBadgeProps {
  size?: number;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * OperatorBadge — compact "powered by OperatorOS" chip suitable for
 * module cards, app-shell footers, and embedded surfaces where a full
 * logo lockup would be too heavy.
 */
export default function OperatorBadge({
  size = 16,
  label = 'OperatorOS',
  className,
  style,
}: OperatorBadgeProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--brand-border-soft, rgba(148, 163, 184, 0.18))',
        background: 'var(--brand-bg-glass, rgba(18, 24, 38, 0.72))',
        fontFamily: 'var(--brand-font-display, "Space Grotesk", Inter, system-ui, sans-serif)',
        fontSize: Math.max(10, size - 4),
        fontWeight: 600,
        color: 'var(--brand-text-secondary, #A7B0C0)',
        ...style,
      }}
    >
      <OperatorMark size={size} />
      {label}
    </span>
  );
}
