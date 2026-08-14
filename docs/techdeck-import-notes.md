# TechDeck Import Notes

Phase 9 imports TechDeck into OperatorOS as a staged module source snapshot with an OperatorOS adapter and shell. This phase does not fully rewrite TechDeck and does not execute the standalone Express app inside OperatorOS.

## Source Location

- Source checkout inspected: `C:\Dev\Tech-Deck`
- Imported location: `apps/modules/techdeck/source/`
- Active adapter: `apps/modules/techdeck/adapter.ts`
- Active shell: `apps/web/src/components/module-shells/TechDeckShell.tsx`
- OperatorOS local fallback: `/modules/techdeck`
- Production module host: `techdeck.operatoros.net`

## Imported Source Contents

Imported:

- `client/`
- `server/`
- `shared/`
- `tests/`
- `docs/`
- `script/`
- `scripts/`
- root build/config/documentation files
- image assets referenced by the client

Excluded:

- `node_modules/`
- `dist/`
- `.git/`
- local runtime uploads under `data/`
- `package-lock.json`
- pasted prompt text artifacts in `attached_assets/`

Import safety adjustment:

- Hardcoded TechDeck production bootstrap passwords were removed from the imported seed file.
- Phase 10 removed TechDeck-local production super-admin account bootstrap entirely.
- OperatorOS owns root super-admin authority and must grant platform admin status centrally.
- OperatorOS does not execute the standalone TechDeck server in the active module shell path.

## Architecture Findings

TechDeck is a Vite + React + Express + Drizzle/PostgreSQL app. It uses:

- React 18, Vite, Wouter, TanStack Query, shadcn/ui, Tailwind.
- Express API/server serving both SPA and API.
- Drizzle schema under `shared/schema.ts`.
- Local session storage via `express-session` and `connect-pg-simple`.
- OperatorOS SSO flow under `server/auth/sso.ts`.
- OperatorOS entitlement sync under `server/modules/operatoros/routes.ts`.
- Local billing decommission docs and route behavior under `docs/LOCAL_BILLING_DECOMMISSION.md`.

## Current OperatorOS Wiring

OperatorOS now renders TechDeck through the existing module shell route:

1. `techdeck.operatoros.net/*` is resolved by the module registry.
2. Middleware rewrites the host-routed request to `/modules/techdeck`.
3. `/modules/techdeck` validates registry status.
4. The shared `/app/apps/[slug]` module route calls `GET /api/modules/techdeck`.
5. OperatorOS API enforces auth, active tenant, and module entitlement.
6. `TechDeckShell` renders only after the existing entitlement gate passes.

## Adapter Contract

The Phase 9 adapter receives:

- current user
- tenant id
- OperatorOS tenant role
- entitlement snapshot
- platform admin flag

It returns a TechDeck context containing:

- `moduleId = techdeck`
- local TechDeck role mapping
- tenant id
- entitlement state
- standalone login mode
- source path
- compatibility API base path
- production and legacy hostnames

Role mapping:

- OperatorOS platform admin -> TechDeck `ADMIN`
- OperatorOS tenant owner/admin -> TechDeck `ADMIN`
- OperatorOS tenant member -> TechDeck `TECH`
- OperatorOS users are not mapped to TechDeck `OWNER` in this adapter.

## TechDeck Feature Routes Identified

The imported standalone app includes modules for:

- core tenant/client/site/asset workflows
- tickets
- evidence
- IT ops console
- license server
- webhooks
- status pages
- reports
- portal
- API tokens
- billing projection
- calendar
- time entries
- invoicing
- knowledge base
- recurring templates
- secure intake
- mobile views

These routes remain in the imported source snapshot and are not yet mounted as OperatorOS API routes.

## Smoke Checklist

- `/modules/techdeck` loads the TechDeck module shell for an authenticated and entitled user.
- `techdeck.operatoros.net` resolves to the TechDeck local module shell through host routing.
- Cookie-less access redirects to login through existing middleware.
- Missing tenant entitlement is blocked by `GET /api/modules/techdeck`.
- `john@shotgunninjas.com` is allowed through the server-side platform admin override.
- Existing TechDeck source files remain present under `apps/modules/techdeck/source/`.
- Standalone TechDeck login/register/billing routes are not called by the OperatorOS shell.

## Exact Next Step

Phase 10 should convert the imported TechDeck feature routes incrementally. Start with a read-only dashboard route backed by OperatorOS tenant context, then migrate tickets and assets behind `requireTenantModuleAccess('techdeck')`.
