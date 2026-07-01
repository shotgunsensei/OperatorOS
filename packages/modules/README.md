# OperatorOS Module Registry

Shared OperatorOS module registry boundary.

The Phase 2 registry is intentionally metadata-only. It does not import module
source code and does not mount module routes.

## Registry

- `registry.ts`: central normalized module registry and lookup helpers.

## Current Design

The registry composes the existing SDK catalog and ecosystem metadata so current
backend/frontend behavior does not drift while the monorepo consolidation is in
progress.

This directory intentionally does not contain a `package.json` yet. Keeping it
out of the active pnpm workspace avoids install/lockfile churn until a later
phase wires the registry into runtime imports.

Do not import TechDeck, PulseDesk, TradeFlowKit, or any other module source code
from this package. It must stay safe for both server and browser imports.
