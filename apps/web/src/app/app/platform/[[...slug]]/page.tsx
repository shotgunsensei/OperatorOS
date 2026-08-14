// Phase 1 marketing-redesign route split: console URLs now live under
// `/app/*`. The Platform Command surface is canonically reached at
// `/app/platform[/...]`; legacy `/platform` URLs 308-redirect here via
// `next.config.js` so any bookmarks, audit links, or outbound shares
// keep working. The implementation still lives at
// `apps/web/src/app/platform/[[...slug]]/page.tsx` — re-exporting keeps
// a single source of truth for the gate, slug parsing, and view state.
export { default } from '../../../platform/[[...slug]]/page';
