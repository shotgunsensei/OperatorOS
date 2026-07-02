# TechDeck Module Import

Phase 9 imports TechDeck as the first OperatorOS-consolidated module.

## Active OperatorOS Integration

- `adapter.ts` defines the OperatorOS-to-TechDeck context mapping.
- `apps/web/src/components/module-shells/TechDeckShell.tsx` is the active OperatorOS shell for `/modules/techdeck` and `techdeck.operatoros.net`.
- `apps/web/src/app/apps/[slug]/page.tsx` performs the current auth and entitlement gate before rendering the shell.

## Imported Legacy Source

The TechDeck source snapshot lives under `source/`.

Imported:

- `client/`
- `server/`
- `shared/`
- `tests/`
- `docs/`
- build/config files required to understand the standalone app
- image assets referenced by the TechDeck client

Excluded:

- `node_modules/`
- `dist/`
- `.git/`
- local runtime uploads under `data/`
- `package-lock.json`
- pasted prompt text artifacts from `attached_assets/`

## Boundary

OperatorOS owns identity, sessions, tenants, roles, billing, entitlements, module registry, and platform admin authority. The imported TechDeck source is not executed as an independent app inside OperatorOS in Phase 9. It is preserved for adapter work and later route-by-route conversion.

Do not re-enable standalone TechDeck billing, checkout, registration, or module entitlement authority from this directory.
