'use client';

import React from 'react';

interface OperatorMarkProps {
  size?: number;
  ringColor?: string;
  nodeColor?: string;
  chevronColor?: string;
  glow?: boolean;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * OperatorMark — the official OperatorOS command-ring icon.
 *
 * Geometric "O" ring with four orbit nodes and a centered command
 * chevron. Code-only SVG (no raster), themed via CSS variables so the
 * single component drives every brand surface (navbar, footer, loader,
 * favicon source, auth screens).
 *
 * Drawn on a 64×64 viewBox so sub-pixel hinting stays clean at favicon
 * size (16px) and at 256px hero-mark size.
 */
export default function OperatorMark({
  size = 32,
  ringColor = 'var(--brand-accent-cyan, #00E5FF)',
  nodeColor = 'var(--brand-accent-violet, #7C3AED)',
  chevronColor = 'var(--brand-text-primary, #F8FAFC)',
  glow = false,
  title = 'OperatorOS',
  className,
  style,
}: OperatorMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      style={{
        display: 'block',
        filter: glow ? 'var(--brand-mark-drop-shadow, drop-shadow(0 0 12px rgba(0, 229, 255, 0.55)))' : undefined,
        ...style,
      }}
    >
      <title>{title}</title>
      {/* Subtle inner field so the mark reads at small sizes against
          dark and light backgrounds alike. */}
      <circle cx="32" cy="32" r="28" fill="var(--brand-mark-bg-fill, rgba(8, 11, 18, 0.92))" />
      {/* Outer command ring */}
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="none"
        stroke={ringColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Inner orbit ring (faint) */}
      <circle
        cx="32"
        cy="32"
        r="16"
        fill="none"
        stroke={ringColor}
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      {/* Four orbit nodes — N, E, S, W on the outer ring */}
      <circle cx="32" cy="8" r="2.6" fill={nodeColor} />
      <circle cx="56" cy="32" r="2.6" fill={nodeColor} />
      <circle cx="32" cy="56" r="2.6" fill={nodeColor} />
      <circle cx="8" cy="32" r="2.6" fill={nodeColor} />
      {/* Centered command chevron `>_` */}
      <path
        d="M25 26 L31 32 L25 38"
        fill="none"
        stroke={chevronColor}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="33"
        y1="40"
        x2="42"
        y2="40"
        stroke={chevronColor}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
