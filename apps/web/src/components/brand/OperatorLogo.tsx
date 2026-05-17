'use client';

import React from 'react';
import OperatorMark from './OperatorMark';

interface OperatorLogoProps {
  size?: number;
  wordmarkSize?: number;
  tagline?: string | null;
  href?: string | null;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

/**
 * OperatorLogo — horizontal lockup: command-ring mark + "OperatorOS"
 * wordmark. Optional tagline ("Powered by Shotgun Ninjas") rendered as
 * a small secondary line.
 */
export default function OperatorLogo({
  size = 32,
  wordmarkSize = 16,
  tagline = null,
  href = null,
  onClick,
  className,
  style,
  testId,
}: OperatorLogoProps) {
  const content = (
    <span
      className={className}
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        textDecoration: 'none',
        color: 'inherit',
        cursor: href || onClick ? 'pointer' : 'default',
        ...style,
      }}
      onClick={onClick}
    >
      <OperatorMark size={size} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span
          style={{
            fontFamily: 'var(--brand-font-display, "Space Grotesk", Inter, system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: wordmarkSize,
            letterSpacing: '-0.01em',
            color: 'var(--brand-text-primary, #F8FAFC)',
          }}
        >
          OperatorOS
        </span>
        {tagline && (
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: Math.max(9, Math.round(wordmarkSize * 0.6)),
              color: 'var(--brand-text-muted, #6B7280)',
              letterSpacing: '0.02em',
            }}
          >
            {tagline}
          </span>
        )}
      </span>
    </span>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }
  return content;
}
