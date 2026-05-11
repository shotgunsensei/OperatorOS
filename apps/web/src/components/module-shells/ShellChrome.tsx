'use client';

/**
 * Task #66 — shared chrome for module shells.
 *
 * Three pieces every module shell now renders so the launch experience
 * is honest:
 *
 *   • <ShellLiveBadge />     — green "Live" pill next to the title.
 *   • <ShellMvpNotice />     — explicit "MVP module shell — deeper AI
 *                              workflows not yet implemented" banner so
 *                              users aren't tricked into thinking the
 *                              shell renders the full product.
 *   • <ShellLaunchButton />  — primary CTA that becomes a disabled
 *                              "Coming soon" pill when the module's
 *                              external base URL is unset (replaces the
 *                              previous href="#" sham link).
 */

import React from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { semantic, space, fontSize, radius } from '@/lib/design-tokens';

export function ShellLiveBadge() {
  return (
    <span
      data-testid="badge-shell-live"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        background: 'rgba(63,185,80,0.12)',
        color: '#3fb950',
        border: '1px solid rgba(63,185,80,0.4)',
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
      }}
    >
      Live
    </span>
  );
}

export function ShellMvpNotice() {
  return (
    <div
      data-testid="text-shell-mvp-notice"
      role="note"
      style={{
        marginBottom: space.lg,
        padding: '10px 14px',
        borderRadius: radius.sm,
        background: 'rgba(210,153,34,0.08)',
        border: '1px solid rgba(210,153,34,0.35)',
        color: '#d29922',
        fontSize: fontSize.body,
      }}
    >
      MVP module shell — deeper AI workflows not yet implemented.
    </div>
  );
}

export function ShellLaunchButton({
  baseUrl,
  testId,
  label,
}: {
  baseUrl?: string;
  testId: string;
  label: string;
}) {
  const live = !!(baseUrl && baseUrl.startsWith('http'));
  if (!live) {
    return (
      <span
        data-testid={`${testId}-coming-soon`}
        aria-disabled="true"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: radius.sm,
          background: 'rgba(139,148,158,0.12)',
          color: semantic.textMuted,
          border: `1px solid ${semantic.border}`,
          fontWeight: 600, fontSize: fontSize.body,
          cursor: 'not-allowed',
        }}
      >
        <Clock size={14} /> Coming soon
      </span>
    );
  }
  return (
    <a
      href={baseUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderRadius: radius.sm,
        background: semantic.accent, color: '#fff', textDecoration: 'none',
        fontWeight: 600, fontSize: fontSize.body,
      }}
    >
      {label} <ArrowRight size={14} />
    </a>
  );
}
