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
  // Ink used on top of the cyan→violet gradient CTA. The gradient is
  // bright enough that pure white loses contrast, so we use the same
  // near-black as the page background.
  accentInk: '#0B0B12',
  // Glass surface used by the sticky navbar (scrolled vs unscrolled
  // variants share the same hue, only opacity changes).
  bgGlassNavScrolled: 'rgba(8, 11, 18, 0.82)',
  bgGlassNavTop: 'rgba(8, 11, 18, 0.55)',
  bgGlassHover: 'rgba(255, 255, 255, 0.03)',
  // Brand glow tokens for the gradient CTA — kept centralized so all
  // accents share the same cyan/violet falloff and Phase 2 components
  // don't reinvent them.
  ctaGlowSoft: '0 0 0 1px rgba(0, 229, 255, 0.18), 0 10px 30px -10px rgba(124, 58, 237, 0.55)',
  ctaGlowHover: '0 0 0 1px rgba(0, 229, 255, 0.32), 0 14px 36px -10px rgba(124, 58, 237, 0.75)',
  ctaGlowLarge: '0 0 0 1px rgba(0, 229, 255, 0.22), 0 18px 48px -16px rgba(124, 58, 237, 0.7)',
  markDropShadow: 'drop-shadow(0 0 12px rgba(0, 229, 255, 0.55))',
  markBgFill: 'rgba(8, 11, 18, 0.92)',
  // Radial backdrop used behind marketing hero headlines.
  heroRadial: 'radial-gradient(60% 50% at 50% 30%, rgba(0, 229, 255, 0.12) 0%, rgba(124, 58, 237, 0.08) 45%, transparent 70%)',
  // Module status badge palette — surfaced as tokens so marketing
  // components never reach for raw hex/rgba literals. Each tuple is
  // (text, background tint, border tint) and reuses the same hue as
  // the underlying accent color (green=Available, amber=Beta,
  // slate=ComingSoon, violet=Locked).
  statusAvailableText:   '#22C55E',
  statusAvailableBg:     'rgba(34, 197, 94, 0.12)',
  statusAvailableBorder: 'rgba(34, 197, 94, 0.35)',
  statusBetaText:        '#F59E0B',
  statusBetaBg:          'rgba(245, 158, 11, 0.12)',
  statusBetaBorder:      'rgba(245, 158, 11, 0.35)',
  statusComingSoonText:   '#A7B0C0',
  statusComingSoonBg:     'rgba(148, 163, 184, 0.10)',
  statusComingSoonBorder: 'rgba(148, 163, 184, 0.28)',
  statusLockedText:   '#7C3AED',
  statusLockedBg:     'rgba(124, 58, 237, 0.12)',
  statusLockedBorder: 'rgba(124, 58, 237, 0.35)',
  fontDisplay: 'var(--brand-font-space-grotesk), var(--brand-font-inter), Inter, system-ui, sans-serif',
  fontBody: 'var(--brand-font-inter), Inter, system-ui, sans-serif',
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
  --brand-accent-ink: ${brand.accentInk};
  --brand-bg-glass-nav-scrolled: ${brand.bgGlassNavScrolled};
  --brand-bg-glass-nav-top: ${brand.bgGlassNavTop};
  --brand-bg-glass-hover: ${brand.bgGlassHover};
  --brand-cta-glow-soft: ${brand.ctaGlowSoft};
  --brand-cta-glow-hover: ${brand.ctaGlowHover};
  --brand-cta-glow-large: ${brand.ctaGlowLarge};
  --brand-font-display: ${brand.fontDisplay};
  --brand-font-body: ${brand.fontBody};
`.trim();
