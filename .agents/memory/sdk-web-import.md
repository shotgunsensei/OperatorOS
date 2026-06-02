---
name: Importing @operatoros/sdk into the Next web app
description: Why the web app needs webpack extensionAlias to import the shared SDK barrel
---

# Importing `@operatoros/sdk` from `apps/web`

The SDK (`packages/sdk`) is authored as ESM TypeScript and its barrel uses
explicit `.js` extensions in relative re-exports (e.g. `export * from './catalog.js'`).
`apps/web` already lists it in `transpilePackages`, and `tsc` resolves the `.js`
specifiers to the `.ts` sources via `moduleResolution`, so **typecheck passes**.
But Next/webpack does **not** resolve `.js` → `.ts` by default, so any web import
of `@operatoros/sdk` 500s at runtime with `Module not found: Can't resolve './catalog.js'`.

**Fix (already applied):** an additive `webpack.resolve.extensionAlias`
`{ '.js': ['.ts','.tsx','.js','.jsx'] }` in `apps/web/next.config.js`.

**Why:** keeps the preferred SDK-helper import path working instead of falling
back to reading raw JSON. Additive — real `.js` files still resolve.

**How to apply:** if you import anything from `@operatoros/sdk` in the web app
and hit a "Module not found .js" error despite passing typecheck, this alias is
the cause/fix. Config changes require a workflow restart to take effect.
