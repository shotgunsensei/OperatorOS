# Tech Deck Module Blueprint

How to add a new module to Tech Deck. Follow every section in order.

---

## 1. Decide on module metadata

Pick an `id` (lowercase, no spaces), `name`, `description`, `version`, and `category`.

| Field | Example |
|---|---|
| id | `status` |
| name | `Status Page` |
| category | `"feature"` (or `"core"` if always-on) |
| operatorOsFeatureKey | OperatorOS feature key, for example `"status"`; omit only for always-on core modules |

---

## 2. Add the Drizzle schema (`shared/schema.ts`)

Define your tables near the bottom of `shared/schema.ts`, grouped by module.

```ts
// ── Status module ──────────────────────────
export const statusMonitors = pgTable("status_monitors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  interval: integer("interval").default(60),
  createdAt: timestamp("created_at").defaultNow(),
});
```

Then add the insert schema, insert type, and select type:

```ts
export const insertStatusMonitorSchema = createInsertSchema(statusMonitors).omit({ id: true, createdAt: true });
export type InsertStatusMonitor = z.infer<typeof insertStatusMonitorSchema>;
export type StatusMonitor = typeof statusMonitors.$inferSelect;
```

After editing, run `npm run db:push` to sync the database.

---

## 3. Add storage methods (`server/storage.ts`)

1. Add methods to the `IStorage` interface:

```ts
// Status module
getMonitorsByTenant(tenantId: string): Promise<StatusMonitor[]>;
createMonitor(data: InsertStatusMonitor): Promise<StatusMonitor>;
```

2. Implement them in `DatabaseStorage` below the interface. All queries **must** be scoped to `tenantId`.

---

## 4. Create server routes (`server/modules/<id>/routes.ts`)

Create the directory and routes file:

```
server/modules/status/routes.ts
```

Follow this skeleton:

```ts
import type { Express } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../replit_integrations/auth";
import { requireTenant, requireRole } from "../../authz";
import { emitEvent } from "../../core/events/helpers";

export function registerStatusRoutes(app: Express) {
  app.get("/api/status/monitors", isAuthenticated, requireTenant(), async (req: any, res) => {
    try {
      const { tenantId } = req.tenantCtx;
      const monitors = await storage.getMonitorsByTenant(tenantId);
      res.json(monitors);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/status/monitors", isAuthenticated, requireRole("OWNER", "ADMIN"), async (req: any, res) => {
    try {
      const { tenantId, userId } = req.tenantCtx;
      const monitor = await storage.createMonitor({ ...req.body, tenantId });

      await emitEvent("status.monitor_created", tenantId, userId, "monitor", monitor.id, {
        name: monitor.name,
      });

      res.json(monitor);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
```

Key rules:
- Import `emitEvent` from `../../core/events/helpers` (not `eventBus` directly).
- Use `requireTenant()` for tenant-scoped routes.
- Use `requireRole(...)` for role-gated routes.
- Keep route handlers thin; delegate to `storage`.

---

## 5. Register routes (`server/routes.ts`)

Import and call your register function:

```ts
import { registerStatusRoutes } from "./modules/status/routes";

// inside registerRoutes():
registerStatusRoutes(app);
```

---

## 6. Register the module manifest (`shared/modules/index.ts`)

Add a new export:

```ts
export const statusModule: VaultModuleManifest = {
  id: "status",
  name: "Status Page",
  description: "Uptime monitoring with public status page.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "status",
  server: {
    mountPath: "/api/status",
    routesFile: "server/modules/status/routes.ts",
    emits: ["status.monitor_created", "status.check_failed"],
  },
  client: {
    navItems: [
      { title: "Status", url: "/status", icon: "Activity" },
    ],
  },
  roles: ["OWNER", "ADMIN"],
};
```

Then add it to the `allModules` array:

```ts
const allModules: VaultModuleManifest[] = [
  coreModule, evidenceModule, licenseModule, webhooksModule,
  statusModule,  // <-- add here
];
```

---

## 7. Create client pages (`client/src/modules/<id>/`)

Directory structure:

```
client/src/modules/status/
  index.ts          # barrel exports
  pages/
    status.tsx      # main page component
```

Barrel file (`index.ts`):

```ts
export { default as StatusPage } from "./pages/status";
```

Page component (`pages/status.tsx`):

```tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
// ... use TanStack Query with queryKey: ["/api/status/monitors"]
```

Rules:
- Use `wouter` for routing (`Link`, `useLocation`, `useParams`).
- Use `@tanstack/react-query` for data fetching (no custom `queryFn` needed; the default fetcher works).
- Use `@/components/ui/*` for shadcn components.
- Add `data-testid` attributes to all interactive and meaningful elements.

---

## 8. Add route to App.tsx (`client/src/App.tsx`)

Import from the module barrel and add a `<Route>`:

```tsx
import { StatusPage } from "./modules/status";

// inside <Switch>:
<Route path="/status" component={StatusPage} />
```

---

## 9. Emit events

Use the `emitEvent` helper from `server/core/events/helpers.ts`:

```ts
import { emitEvent } from "../../core/events/helpers";

await emitEvent(
  "status.monitor_created",   // event type (use module.action format)
  tenantId,                    // always required
  userId,                      // actor (optional but recommended)
  "monitor",                   // entity type (optional)
  monitor.id,                  // entity id (optional)
  { name: monitor.name }       // extra details (optional)
);
```

The helper automatically adds a timestamp and routes through the EventBus, which triggers audit logging and webhook delivery.

---

## 10. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Event type | `module.verb_noun` | `status.monitor_created` |
| Route path | `/api/<module>/<resource>` | `/api/status/monitors` |
| Table name | `snake_case`, plural | `status_monitors` |
| Module id | lowercase, single word | `status` |
| Client dir | `client/src/modules/<id>/` | `client/src/modules/status/` |
| Server dir | `server/modules/<id>/` | `server/modules/status/` |

---

## Checklist

- [ ] Schema tables added to `shared/schema.ts` with insert schema + types
- [ ] Storage methods added to `IStorage` interface and `DatabaseStorage` class
- [ ] Server routes created at `server/modules/<id>/routes.ts`
- [ ] Routes registered in `server/routes.ts`
- [ ] Module manifest added to `shared/modules/index.ts` and `allModules` array
- [ ] Client pages created at `client/src/modules/<id>/pages/`
- [ ] Barrel exports at `client/src/modules/<id>/index.ts`
- [ ] Route added to `client/src/App.tsx`
- [ ] Events emitted via `emitEvent` helper (not `eventBus.emit` directly)
- [ ] `npm run db:push` to sync database
- [ ] App starts without errors
