# `@operatoros/config` Placeholder

Reserved package boundary for future shared configuration and environment
contract helpers.

No package manifest or runtime code is added in Phase 1. Current production
configuration remains in app-local files such as:

- `apps/web/next.config.js`
- `apps/web/src/lib/api-config.ts`
- `apps/api/src/lib/session-secret.ts`
- `apps/api/src/lib/service-token.ts`
- `packages/sdk/src/ecosystem.ts`

Future extraction must never expose private environment variables to browser
bundles.
