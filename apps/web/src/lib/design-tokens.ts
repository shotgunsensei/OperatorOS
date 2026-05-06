// Centralized design tokens for OperatorOS web. Re-exports the existing
// `colors` palette from SaasLayout (kept there to avoid breaking dozens of
// existing imports) and adds spacing, radii, shadow, and icon-size scales
// used by Gate 3 surfaces (role-aware sidebar, marketplace, tenant admin).

export { colors } from '../components/SaasLayout';

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

// Stable test-id helpers — use these in components so tests can rely on a
// single naming scheme.
export const testId = {
  nav: (id: string) => `nav-${id}`,
  sidebarSection: (id: string) => `sidebar-section-${id}`,
  page: (id: string) => `page-${id}`,
} as const;
