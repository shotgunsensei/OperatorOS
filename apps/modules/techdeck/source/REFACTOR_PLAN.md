# Pending Large-File Refactors (T10, T11)

These two refactors are documented here rather than executed in the current session because they cross drizzle's `relations()` references and the live storage interface, where a single broken import can cascade across the entire backend. The plan below is what a follow-up task should execute.

---

## T10 — Decompose `server/storage.ts` (2531 lines)

### Target structure

```
server/storage/
├── index.ts                # composes all submodules into the singleton exported as `storage`
├── interface.ts            # IStorage (current top-of-file interface)
├── tenants.ts              # tenants, members, invitations
├── core.ts                 # clients, sites, assets, tags
├── tickets.ts              # tickets, comments, SLA, getNextTicketNumber
├── evidence.ts             # evidence items
├── audit.ts                # audit logs
├── license.ts              # products, keys, activations
├── webhooks.ts             # endpoints, deliveries
├── status.ts               # status pages/components/incidents
├── reports.ts              # report jobs
├── api.ts                  # api tokens
├── billing.ts              # plans, subscriptions, usage
├── invoicing.ts            # invoices, line items
├── kb.ts                   # articles
├── recurring.ts            # ticket templates
├── intake.ts               # intake spaces, requests, files
└── time.ts                 # time entries
```

### Mechanics

1. Each file exports a class fragment, e.g. `export class TenantStorage implements Pick<IStorage, "createTenant" | "getTenantBySlug" | ...>`.
2. `index.ts` composes them via mixin or by instantiating each fragment and merging methods onto a single `storage` object that satisfies `IStorage`.
3. Keep the **import path stable**: callers continue to `import { storage } from "@server/storage"` (resolved via `server/storage.ts` → re-export from `server/storage/index.ts`).
4. Validate after each fragment extraction by running `npx tsc --noEmit` and the app smoke test before moving the next group.

### Risk hotspots

- Cross-table queries that join across what would become two fragments (e.g. tickets ↔ clients). Resolve by passing the `db` instance and bare drizzle helpers, not by calling other fragments' methods inside one another.
- The handful of helper functions defined at the bottom of the file (e.g. enum mappers) — move into `server/storage/util.ts` and import.

---

## T11 — Split `shared/schema.ts` (1572 lines)

### Target structure

```
shared/schema/
├── index.ts                # the file shared/schema.ts becomes a re-export of this
├── tenants.ts              # tenants, members, invitations + insert schemas + types
├── core.ts                 # clients, sites, assets, tags
├── evidence.ts
├── audit.ts
├── license.ts
├── webhooks.ts
├── status.ts
├── reports.ts
├── api-tokens.ts
├── billing.ts              # plans, subscriptions, usage, PlanLimits
└── ... (one file per domain)
```

### Mechanics

1. Keep `shared/schema.ts` as a thin barrel: `export * from "./schema/tenants"; export * from "./schema/core"; ...`.
2. Move each table + its `relations()` + its `insert*Schema` + its `T` / `InsertT` types together — relations are scoped to the table they describe.
3. Cross-file `relations()` references (e.g. `clients` → `tenants`) will require importing the referenced table from the sibling file. **Watch for circular imports**: drizzle's `relations()` is evaluated lazily inside the callback, so a TypeScript-only circular import is generally safe, but a top-level `import` cycle that materializes during module load is not. If a cycle appears, move both tables into the same file or extract the shared piece into a third file.
4. `shared/modules/index.ts` is **off-limits** per the user preference — do not touch it during this refactor.
5. Validate after each domain extraction with `npx drizzle-kit push --dry-run` (or the project's equivalent) plus `npx tsc --noEmit` to make sure migration intent is unchanged.

### Risk hotspots

- `usersTable` — referenced by many tables for `assignedToId`/`createdById`. Should live in `shared/schema/users.ts` early in the dependency order.
- The `subscriptionPlans` and `tenantSubscriptions` pair — strong coupling, keep together in `billing.ts`.
- Drizzle `pgEnum` definitions used across multiple tables — extract to `shared/schema/enums.ts` and import.

### Acceptance for both

- All existing imports unchanged (`@shared/schema`, `@server/storage` keep working).
- `npx tsc --noEmit` passes with zero new errors.
- App boots, the existing pages render, and the smoke test (`npm test`) stays green.
- File size targets: `shared/schema.ts` ≤ 30 lines (pure re-exports); `server/storage.ts` ≤ 30 lines (pure re-exports); each domain file 100–300 lines.

---

## Why deferred

Both refactors are mechanically straightforward but operationally risky in a single session because:
1. They touch hundreds of import sites if done wrong.
2. A circular-import cycle in drizzle's `relations()` only fails at runtime, not at typecheck.
3. The session that performs the refactor needs to be focused entirely on it (no other UX/feature work mixed in) so the diff is reviewable.

Recommend doing each as its own dedicated task with a fresh review cycle.
