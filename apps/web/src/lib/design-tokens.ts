// Centralized design tokens for OperatorOS web. Re-exports the existing
// `colors` palette from SaasLayout (kept there to avoid breaking dozens of
// existing imports) and adds spacing, radii, shadow, icon-size scales,
// plus shared style primitives (cardStyle, panelStyle, badgeStyles,
// buttonStyles) used by Gate 3 surfaces.

import type { CSSProperties } from 'react';
import { colors as palette } from '../components/SaasLayout';

export { palette as colors };

// ─────────────────────────────────────────────────────────────────────
// Semantic color aliases. All consuming code reaches for accentDanger /
// accentSuccess / accentWarning rather than the raw red/green/yellow so
// theming stays consistent across surfaces.
// ─────────────────────────────────────────────────────────────────────
export const semantic = {
  border: palette.border,
  borderHover: palette.accent,
  accent: palette.accent,
  accentDanger: palette.accentRed,
  accentSuccess: palette.accentGreen,
  accentWarning: palette.accentYellow,
  accentInfo: palette.accentPurple,
  bg: palette.bg,
  bgPanel: palette.bgSecondary,
  bgHover: palette.bgHover,
  text: palette.text,
  textMuted: palette.textMuted,
  textDim: palette.textDim,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const shadow = {
  card: '0 1px 2px rgba(0,0,0,0.4)',
  cardHover: '0 4px 16px rgba(0,0,0,0.5)',
  popover: '0 8px 24px rgba(0,0,0,0.6)',
} as const;

export const iconSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  body: 13,
  md: 14,
  lg: 16,
  xl: 18,
  h2: 22,
  h1: 28,
} as const;

// ─────────────────────────────────────────────────────────────────────
// Reusable style primitives. Use these in Gate 3 surfaces so visual
// rhythm is consistent without each page re-defining its own card chrome.
// ─────────────────────────────────────────────────────────────────────
export const cardStyle: CSSProperties = {
  background: semantic.bgPanel,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.lg,
  padding: space.lg,
  boxShadow: shadow.card,
};

export const panelStyle: CSSProperties = {
  background: semantic.bgPanel,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.lg,
  overflow: 'hidden',
};

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export const badgeStyles: Record<BadgeVariant, CSSProperties> = {
  neutral: {
    fontSize: fontSize.xs, padding: '2px 10px', borderRadius: radius.pill,
    border: `1px solid ${semantic.border}`, color: semantic.textMuted,
  },
  info: {
    fontSize: fontSize.xs, padding: '2px 10px', borderRadius: radius.pill,
    border: `1px solid ${semantic.accentInfo}55`, color: semantic.accentInfo,
  },
  success: {
    fontSize: fontSize.xs, padding: '2px 10px', borderRadius: radius.pill,
    border: `1px solid ${semantic.accentSuccess}55`, color: semantic.accentSuccess,
  },
  warning: {
    fontSize: fontSize.xs, padding: '2px 10px', borderRadius: radius.pill,
    border: `1px solid ${semantic.accentWarning}55`, color: semantic.accentWarning,
  },
  danger: {
    fontSize: fontSize.xs, padding: '2px 10px', borderRadius: radius.pill,
    border: `1px solid ${semantic.accentDanger}55`, color: semantic.accentDanger,
  },
};

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export const buttonStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    padding: '8px 16px', borderRadius: radius.md, border: 'none',
    background: semantic.accent, color: '#fff',
    fontSize: fontSize.body, fontWeight: 600, cursor: 'pointer',
  },
  secondary: {
    padding: '8px 16px', borderRadius: radius.md,
    border: `1px solid ${semantic.border}`, background: 'transparent',
    color: semantic.text, fontSize: fontSize.body, fontWeight: 600, cursor: 'pointer',
  },
  ghost: {
    padding: '6px 10px', borderRadius: radius.sm, border: 'none',
    background: 'transparent', color: semantic.accent,
    fontSize: fontSize.sm, cursor: 'pointer',
  },
  danger: {
    padding: '8px 16px', borderRadius: radius.md,
    border: `1px solid ${semantic.accentDanger}55`, background: 'transparent',
    color: semantic.accentDanger, fontSize: fontSize.body, fontWeight: 600, cursor: 'pointer',
  },
};

// Stable test-id helpers — use these in components so tests can rely on a
// single naming scheme.
export const testId = {
  nav: (id: string) => `nav-${id}`,
  sidebarSection: (id: string) => `sidebar-section-${id}`,
  page: (id: string) => `page-${id}`,
} as const;
