// Phase 1 marketing-redesign route split: per-app module pages now live
// canonically at `/app/apps/:slug`. Legacy `/apps/:slug` URLs
// 308-redirect here via `next.config.js`. The implementation still
// lives at `apps/web/src/app/apps/[slug]/page.tsx` — re-export keeps
// a single source of truth.
export { default } from '../../../apps/[slug]/page';
