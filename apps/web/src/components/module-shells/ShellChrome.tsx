'use client';

/**
 * Task #66 — shared chrome for module shells.
 *
 * Shared module-shell status and canonical launch controls.
 *
 *   • <ShellLiveBadge />     — green "Live" pill next to the title.
 *   • <ShellLaunchButton />  — primary CTA that becomes a disabled
 *                              unavailable state when the module's
 *                              canonical base URL is absent.
 */

import React from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { badgeStyles, buttonStyles, semantic, fontSize, radius } from '@/lib/design-tokens';

export function ShellLiveBadge() {
  return (
    <span
      data-testid="badge-shell-live"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        ...badgeStyles.success,
        background: '#14532d',
        color: '#dcfce7',
        borderColor: '#22c55e',
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
      }}
    >
      Live
    </span>
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
        data-testid={`${testId}-unavailable`}
        aria-disabled="true"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: radius.sm,
          background: semantic.bgHover,
          color: semantic.textMuted,
          border: `1px solid ${semantic.border}`,
          fontWeight: 600, fontSize: fontSize.body,
          cursor: 'not-allowed',
        }}
      >
        <Clock size={14} /> Launch unavailable
      </span>
    );
  }
  return (
    <a
      href={baseUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      onClick={(e) => {
        e.preventDefault();
        import('@/lib/launch').then(({ openExternal }) => openExternal(baseUrl));
      }}
        style={{
          ...buttonStyles.primary,
        display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: radius.sm, textDecoration: 'none',
      }}
    >
      {label} <ArrowRight size={14} />
    </a>
  );
}
