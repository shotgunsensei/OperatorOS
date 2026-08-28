'use client';

import React from 'react';
import OperatorMark from './OperatorMark';

interface OperatorLogoProps {
  size?: number;
  wordmarkSize?: number;
  tagline?: string | null;
  showDomain?: boolean;
  href?: string | null;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

/**
 * OperatorLogo — horizontal lockup: command-ring mark + "OperatorOS"
 * wordmark, rebuilt from the supplied metallic-silver/electric-blue identity.
 * Compact icon-only contexts should use OperatorMark directly.
 */
export default function OperatorLogo({
  size = 32,
  wordmarkSize = 16,
  tagline = null,
  showDomain = true,
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
      data-brand-asset="operatoros-lockup"
      role="img"
      aria-label={tagline ? `OperatorOS — ${tagline}` : 'OperatorOS.net'}
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
      <OperatorMark size={size} decorative />
      <span aria-hidden="true" style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span
            style={{
              fontFamily: 'var(--brand-font-display, "Inter Variable", system-ui, sans-serif)',
              fontWeight: 850,
              fontStyle: 'italic',
              fontSize: wordmarkSize,
              letterSpacing: '-0.055em',
              color: '#F8FAFC',
              background: 'linear-gradient(180deg, #FFFFFF 0%, #E9EEF5 42%, #9AA9BC 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Operator
          </span>
          <span
            style={{
              fontFamily: 'var(--brand-font-display, "Inter Variable", system-ui, sans-serif)',
              fontWeight: 900,
              fontStyle: 'italic',
              fontSize: wordmarkSize * 1.08,
              letterSpacing: '-0.06em',
              color: '#078BFF',
              background: 'linear-gradient(180deg, #14D9FF 0%, #078BFF 48%, #1745E8 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 14px rgba(0, 170, 255, 0.28)',
            }}
          >
            OS
          </span>
        </span>
        {tagline ? (
          <span
            style={{
              marginTop: 3,
              fontFamily: '"Inter Variable", system-ui, sans-serif',
              fontSize: Math.max(9, Math.round(wordmarkSize * 0.58)),
              color: 'var(--brand-text-muted, #8090A4)',
              letterSpacing: '0.035em',
            }}
          >
            {tagline}
          </span>
        ) : showDomain ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span style={{ width: 15, height: 1, background: 'linear-gradient(90deg, transparent, #00C8FF)' }} />
            <span
              style={{
                fontFamily: 'var(--brand-font-display, "Inter Variable", system-ui, sans-serif)',
                fontSize: Math.max(8, Math.round(wordmarkSize * 0.52)),
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: '#0797FF',
              }}
            >
              .net
            </span>
            <span style={{ flex: 1, minWidth: 15, height: 1, background: 'linear-gradient(90deg, #00C8FF, transparent)' }} />
          </span>
        ) : null}
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
