---
name: Replit provider scan marker
description: The provider package scan can retain development-environment signals while using its own exact Node and pnpm tuple.
---

The Replit provider package scan may run with the same workspace-domain and Nix signals as the editor, so runtime path and `REPLIT_DEV_DOMAIN` alone are not reliable discriminators. Keep the package-manager exception exact to the observed provider Node/pnpm/platform/architecture tuple and require the deployment-only `REPLIT_DEPLOYMENT=1` marker when those editor-like signals are present.

**Why:** A publish attempt still rejected the exact scanner tuple after a non-Nix, signal-stripped fallback was added; the provider retained enough workspace context to fail that predicate.

**How to apply:** When the provider changes its scanner tuple or environment markers, add a narrowly scoped test case and update the documented fingerprint rather than allowing arbitrary pnpm versions or all Replit environments.