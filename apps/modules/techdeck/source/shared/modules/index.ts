import type { VaultModuleManifest, ModuleRegistry } from "./types";

function manifest(data: VaultModuleManifest): VaultModuleManifest {
  return data;
}

export const coreModule = manifest({
  id: "core",
  name: "Core Platform",
  description: "Tenant context, users, clients, sites, assets, team roles, settings, and audit logs.",
  enabled: true,
  category: "core",
  version: "1.0.0",
  server: {
    mountPath: "/api",
    routesFile: "server/modules/core/routes.ts",
    emits: [
      "tenant.created",
      "client.created", "client.updated", "client.deleted",
      "site.created", "site.updated", "site.deleted",
      "asset.created", "asset.updated", "asset.deleted",
      "member.invited", "member.role_changed", "member.removed",
    ],
  },
  client: {
    navItems: [
      { title: "Dashboard", url: "/", icon: "LayoutDashboard" },
      { title: "Clients", url: "/clients", icon: "Users" },
      { title: "Sites", url: "/sites", icon: "MapPin", roles: ["OWNER", "ADMIN", "TECH"] },
      { title: "Assets", url: "/assets", icon: "Server", roles: ["OWNER", "ADMIN", "TECH"] },
    ],
    adminNavItems: [
      { title: "Team", url: "/team", icon: "Building2", roles: ["OWNER", "ADMIN"] },
      { title: "Client Access", url: "/client-access", icon: "KeyRound", roles: ["OWNER", "ADMIN"] },
      { title: "Audit Log", url: "/audit", icon: "Shield", roles: ["OWNER", "ADMIN"] },
      { title: "Settings", url: "/settings", icon: "Settings", roles: ["OWNER", "ADMIN", "TECH"] },
    ],
  },
  roles: ["OWNER", "ADMIN", "TECH", "CLIENT"],
});

export const ticketsModule = manifest({
  id: "tickets",
  name: "Tickets",
  description: "Ticket lifecycle, comments, SLA profiles, assignment, and client-facing ticket updates.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/tickets", routesFile: "server/modules/tickets/routes.ts", emits: ["ticket.created", "ticket.updated", "ticket.deleted"] },
  client: { navItems: [{ title: "Tickets", url: "/tickets", icon: "TicketIcon", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH", "CLIENT"],
});

export const calendarModule = manifest({
  id: "calendar",
  name: "Dispatch Calendar",
  description: "Appointments, technician schedules, and field dispatch views.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/appointments", routesFile: "server/modules/calendar/routes.ts", emits: ["appointment.created", "appointment.updated", "appointment.deleted"] },
  client: { navItems: [{ title: "Calendar", url: "/calendar", icon: "CalendarDays", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const timeModule = manifest({
  id: "time",
  name: "Time Tracking",
  description: "Billable and non-billable time entries linked to tickets, clients, and invoices.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/time-entries", routesFile: "server/modules/time/routes.ts", emits: ["time_entry.created", "time_entry.updated", "time_entry.deleted"] },
  client: { navItems: [{ title: "Time Tracking", url: "/time", icon: "Clock", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const invoicingModule = manifest({
  id: "invoicing",
  name: "Invoicing",
  description: "Invoice settings, draft/sent/paid invoices, line items, and public invoice views.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/invoices", routesFile: "server/modules/invoicing/routes.ts", emits: ["invoice.created", "invoice.updated", "invoice.sent", "invoice.paid"] },
  client: {
    adminNavItems: [
      { title: "Invoices", url: "/invoices", icon: "Receipt", roles: ["OWNER", "ADMIN"] },
      { title: "Billing Settings", url: "/billing-settings", icon: "Wrench", roles: ["OWNER", "ADMIN"] },
    ],
  },
  roles: ["OWNER", "ADMIN"],
});

export const kbModule = manifest({
  id: "kb",
  name: "Knowledge Base",
  description: "Runbooks, articles, categories, publishing, and search.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/kb", routesFile: "server/modules/kb/routes.ts", emits: ["kb.article_created", "kb.article_updated", "kb.article_deleted"] },
  client: { navItems: [{ title: "Knowledge Base", url: "/kb", icon: "BookOpen", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const recurringModule = manifest({
  id: "recurring",
  name: "Recurring Tickets",
  description: "Recurring ticket templates and scheduled operational work.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/recurring-tickets", routesFile: "server/modules/recurring/routes.ts", emits: ["recurring_template.created", "recurring_template.updated", "recurring_template.deleted"] },
  client: { adminNavItems: [{ title: "Recurring Tickets", url: "/recurring-tickets", icon: "Repeat", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const itopsModule = manifest({
  id: "itops",
  name: "IT Ops Console",
  description: "AI-assisted operational console for scripts, analysis, and saved technical responses.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/itops", routesFile: "server/modules/itops/routes.ts", emits: ["itops.response_saved"] },
  client: { navItems: [{ title: "IT Ops Console", url: "/itops", icon: "Terminal", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const evidenceModule = manifest({
  id: "evidence",
  name: "Evidence Vault",
  description: "Secure evidence upload, search, tagging, preview, and SHA-256 deduplication.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/evidence", routesFile: "server/modules/evidence/routes.ts", emits: ["evidence.uploaded", "evidence.deleted"] },
  client: { navItems: [{ title: "Evidence", url: "/evidence", icon: "FileText" }] },
  roles: ["OWNER", "ADMIN", "TECH", "CLIENT"],
});

export const licenseModule = manifest({
  id: "license",
  name: "License Server",
  description: "Software license products, keys, activation tracking, and public validation API.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  server: { mountPath: "/api/license", routesFile: "server/modules/license/routes.ts", emits: ["license.product_created", "license.key_issued", "license.key_revoked", "license.activation"] },
  client: { navItems: [{ title: "Licenses", url: "/licenses", icon: "Key", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const webhooksModule = manifest({
  id: "webhooks",
  name: "Webhooks",
  description: "Outbound webhook endpoints, delivery logs, retry handling, and HMAC signing.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "webhooks",
  server: { mountPath: "/api/webhooks", routesFile: "server/modules/webhooks/routes.ts", consumes: ["*"], emits: ["webhook.created", "webhook.updated", "webhook.deleted"] },
  client: { adminNavItems: [{ title: "Webhooks", url: "/webhooks", icon: "Webhook", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const statusModule = manifest({
  id: "status",
  name: "Status Pages",
  description: "Public status pages, components, incidents, and status API output.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "status",
  server: { mountPath: "/api/status", routesFile: "server/modules/status/routes.ts", emits: ["status.page_updated", "status.component_created", "status.component_updated", "status.component_deleted", "status.incident_created", "status.incident_updated", "status.incident_deleted"] },
  client: { adminNavItems: [{ title: "Status", url: "/status-admin", icon: "Activity", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const reportsModule = manifest({
  id: "reports",
  name: "Compliance Reports",
  description: "Evidence packet ZIP generation with manifests, checksums, audit trails, and filtered evidence.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "reports",
  server: { mountPath: "/api/reports", routesFile: "server/modules/reports/routes.ts", emits: ["report.job_created", "report.job_completed", "report.job_failed"] },
  client: { navItems: [{ title: "Reports", url: "/reports", icon: "ClipboardList", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const apiModule = manifest({
  id: "api",
  name: "API Access",
  description: "Scoped API tokens and /api/v1 programmatic access.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "api",
  server: { mountPath: "/api/v1", routesFile: "server/modules/api/routes.ts", emits: [] },
  client: { adminNavItems: [{ title: "API Tokens", url: "/api-tokens", icon: "Key", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const portalModule = manifest({
  id: "portal",
  name: "Client Portal",
  description: "Scoped CLIENT role portal for clients, evidence, tickets, and invoices.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "portal",
  server: { mountPath: "/api/portal", routesFile: "server/modules/portal/routes.ts", emits: [] },
  client: {
    navItems: [
      { title: "Portal", url: "/portal", icon: "Home", roles: ["CLIENT"] },
      { title: "My Tickets", url: "/portal/tickets", icon: "TicketIcon", roles: ["CLIENT"] },
      { title: "My Invoices", url: "/portal/invoices", icon: "Receipt", roles: ["CLIENT"] },
      { title: "My Evidence", url: "/portal/evidence", icon: "FileText", roles: ["CLIENT"] },
    ],
  },
  roles: ["CLIENT"],
});

export const secureIntakeModule = manifest({
  id: "secure-intake",
  name: "Secure Intake",
  description: "Tokenized external upload links, intake spaces, request management, review workflow, storage, policy, and audit.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  operatorOsFeatureKey: "intake",
  server: { mountPath: "/api/secure-intake", routesFile: "server/modules/secure-intake/routes.ts", emits: ["intake.space.created", "intake.request.created", "intake.file.uploaded", "intake.policy.updated"] },
  client: {
    navItems: [
      { title: "Secure Intake", url: "/secure-intake", icon: "Upload", roles: ["OWNER", "ADMIN", "TECH"] },
      { title: "Spaces", url: "/secure-intake/spaces", icon: "FileText", roles: ["OWNER", "ADMIN", "TECH"] },
      { title: "Requests", url: "/secure-intake/requests", icon: "Upload", roles: ["OWNER", "ADMIN", "TECH"] },
      { title: "Files", url: "/secure-intake/files", icon: "FileText", roles: ["OWNER", "ADMIN", "TECH"] },
    ],
    adminNavItems: [
      { title: "Audit", url: "/secure-intake/audit", icon: "Shield", roles: ["OWNER", "ADMIN"] },
      { title: "Policies", url: "/secure-intake/policies", icon: "ShieldCheck", roles: ["OWNER", "ADMIN"] },
      { title: "Storage", url: "/secure-intake/storage", icon: "Server", roles: ["OWNER", "ADMIN"] },
    ],
  },
  roles: ["OWNER", "ADMIN", "TECH"],
});

export const billingModule = manifest({
  id: "billing",
  name: "Billing Projection",
  description: "Read-only OperatorOS entitlement and billing projection. Local checkout and portal writes return 410 Gone.",
  enabled: true,
  category: "core",
  version: "1.0.0",
  server: { mountPath: "/api/billing", routesFile: "server/modules/billing/routes.ts", emits: [] },
  client: { adminNavItems: [{ title: "Billing", url: "/billing", icon: "CreditCard", roles: ["OWNER", "ADMIN"] }] },
  roles: ["OWNER", "ADMIN"],
});

export const adminModule = manifest({
  id: "admin",
  name: "System Administration",
  description: "System-admin tenant and user review with read-only OperatorOS entitlement status.",
  enabled: true,
  category: "core",
  version: "1.0.0",
  server: { mountPath: "/api/admin", routesFile: "server/modules/admin/routes.ts", emits: [] },
  client: { adminNavItems: [{ title: "Admin Panel", url: "/system-admin", icon: "ShieldCheck", roles: ["OWNER"] }] },
  roles: ["OWNER"],
});

export const mobileModule = manifest({
  id: "mobile",
  name: "Mobile Technician View",
  description: "Mobile-first technician routes for tickets, time, and calendar.",
  enabled: true,
  category: "feature",
  version: "1.0.0",
  client: { navItems: [{ title: "Mobile View", url: "/m", icon: "Smartphone", roles: ["OWNER", "ADMIN", "TECH"] }] },
  roles: ["OWNER", "ADMIN", "TECH"],
});

const allModules: VaultModuleManifest[] = [
  coreModule,
  ticketsModule,
  calendarModule,
  timeModule,
  invoicingModule,
  kbModule,
  recurringModule,
  itopsModule,
  evidenceModule,
  licenseModule,
  webhooksModule,
  statusModule,
  reportsModule,
  apiModule,
  portalModule,
  secureIntakeModule,
  billingModule,
  adminModule,
  mobileModule,
];

export const operatorOsFeatureKeyByModuleId: Record<string, string> = Object.fromEntries(
  allModules
    .filter((mod) => mod.operatorOsFeatureKey)
    .map((mod) => [mod.id, mod.operatorOsFeatureKey as string]),
);

export const moduleIdByOperatorOsFeatureKey: Record<string, string> = Object.fromEntries(
  Object.entries(operatorOsFeatureKeyByModuleId).map(([moduleId, featureKey]) => [featureKey, moduleId]),
);

export const moduleRegistry: ModuleRegistry = {
  modules: allModules,

  getModule(id: string): VaultModuleManifest | undefined {
    return allModules.find((m) => m.id === id);
  },

  getEnabledModules(): VaultModuleManifest[] {
    return allModules.filter((m) => m.enabled);
  },

  isEnabled(id: string): boolean {
    const mod = allModules.find((m) => m.id === id);
    return mod?.enabled ?? false;
  },
};

export type { VaultModuleManifest, ModuleDefinition, ModuleRegistry, ModuleNavItem } from "./types";
