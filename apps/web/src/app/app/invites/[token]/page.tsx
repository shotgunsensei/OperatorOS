// Phase 1 marketing-redesign route split: invite-accept flow now lives
// canonically at `/app/invites/:token`. Legacy `/invites/:token` URLs
// (which the API embeds in transactional emails) 308-redirect here via
// `next.config.js`. The implementation still lives at
// `apps/web/src/app/invites/[token]/page.tsx`.
export { default } from '../../../invites/[token]/page';
