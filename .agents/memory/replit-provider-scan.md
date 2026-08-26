---
name: Replit provider scan marker
description: The provider package scan can retain development-environment signals while using its own exact Node and pnpm tuple.
---

The Replit provider package scan may run with the same workspace-domain and Nix signals as the editor, and it does not reliably expose `REPLIT_DEPLOYMENT=1` during its package-install phase. Runtime path and environment markers are therefore not reliable discriminators. Keep the package-manager exception exact to the observed provider Node/pnpm/platform/architecture tuple.

**Why:** Multiple publish attempts still rejected the exact scanner tuple after both non-Nix and deployment-marker fallbacks were added; the provider changed or omitted those environment signals while keeping the toolchain fingerprint stable.

**How to apply:** When the provider changes its scanner tuple or environment markers, add a narrowly scoped test case and update the documented fingerprint rather than allowing arbitrary pnpm versions or all Replit environments.