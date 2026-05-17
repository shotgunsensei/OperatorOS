// Brand palette + CSS-variable string for the marketing surface.
//
// Lives in its own server-safe module (no `'use client'` imports) so the
// root layout server component can dot into the tokens. `design-tokens.ts`
// re-exports `colors` from `SaasLayout.tsx`, which marks the whole module
// as a client boundary — server components can only pass through imported
// names from such modules, not access their properties. Keeping `brand`
// here avoids that trap.

export const brand = {
  bgPrimary: '#080B12',
  bgSecondary: '#0D1117',
  bgElevated: '#121826',
  bgGlass: 'rgba(18, 24, 38, 0.72)',
  borderSoft: 'rgba(148, 163, 184, 0.18)',
  borderStrong: 'rgba(148, 163, 184, 0.32)',
  textPrimary: '#F8FAFC',
  textSecondary: '#A7B0C0',
  textMuted: '#6B7280',
  accentCyan: '#00E5FF',
  accentBlue: '#2563EB',
  accentViolet: '#7C3AED',
  accentRed: '#EF233C',
  accentGreen: '#22C55E',
  accentAmber: '#F59E0B',
  fontDisplay: '"Space Grotesk", Inter, system-ui, sans-serif',
  fontBody: 'Inter, system-ui, sans-serif',
  contentMaxWidth: 1200,
} as const;

export const brandCssVariables = `
  --brand-bg-primary: ${brand.bgPrimary};
  --brand-bg-secondary: ${brand.bgSecondary};
  --brand-bg-elevated: ${brand.bgElevated};
  --brand-bg-glass: ${brand.bgGlass};
  --brand-border-soft: ${brand.borderSoft};
  --brand-border-strong: ${brand.borderStrong};
  --brand-text-primary: ${brand.textPrimary};
  --brand-text-secondary: ${brand.textSecondary};
  --brand-text-muted: ${brand.textMuted};
  --brand-accent-cyan: ${brand.accentCyan};
  --brand-accent-blue: ${brand.accentBlue};
  --brand-accent-violet: ${brand.accentViolet};
  --brand-accent-red: ${brand.accentRed};
  --brand-accent-green: ${brand.accentGreen};
  --brand-accent-amber: ${brand.accentAmber};
  --brand-font-display: ${brand.fontDisplay};
  --brand-font-body: ${brand.fontBody};
`.trim();
