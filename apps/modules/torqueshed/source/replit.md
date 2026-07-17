# TorqueShed

A visually rich digital garage for community build journals, evidence-led diagnostics, vehicle history, and a reputation-backed DIY marketplace.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- OperatorOS SSO and native-link env: see `.env.example` and `docs/operatoros-sso.md`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: Vite, React, Lucide, bespoke responsive garage design system
- Native: Expo Router for iOS and Android
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/torqueshed` — Vite/React web app and visual system
- `artifacts/torqueshed-mobile` — Expo Router native app for iOS and Android
- `artifacts/api-server/src/routes/auth.ts` — OperatorOS consume and TorqueShed session boundary
- `lib/db/src/schema/index.ts` — local OperatorOS user projection and revocable sessions

## Architecture decisions

- OperatorOS remains the identity, tenant, and entitlement authority.
- TorqueShed exchanges the one-time SSO JWT server-to-server and issues its own opaque session.
- The web uses an HttpOnly cookie; native stores its bearer session in OS secure storage.
- Production API hosting serves the built SPA and both mobile association documents from the same origin.

## Product

- Community build feed, build journals, live bay chat, Torque Assist diagnostic plans, DIY marketplace, and personal garage.

## User preferences

- Production host is `https://torqueshed.pro`.
- Preserve the premium dark garage identity and hold all frontend work to a full visual-polish pass.
- Maintain native iOS and Android experiences alongside web.

## Gotchas

- Apply DB schema changes before testing the SSO callback.
- Configure OperatorOS `TORQUESHED_URL=https://torqueshed.pro` before launch testing.
- iOS association requires the Apple team ID; Android association requires the production signing fingerprint.
