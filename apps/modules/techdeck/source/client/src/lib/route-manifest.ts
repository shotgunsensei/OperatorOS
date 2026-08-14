export type TechDeckRole = "OWNER" | "ADMIN" | "TECH" | "CLIENT";
export type RouteRole = TechDeckRole | "SYSTEM_ADMIN" | "PUBLIC";
export type EntitlementFeature = "api" | "portal" | "status" | "webhooks" | "reports" | "intake";

export type NavGroupId =
  | "client-portal"
  | "command-center"
  | "service-desk"
  | "clients-assets"
  | "field-ops"
  | "evidence-compliance"
  | "automation-integrations"
  | "administration"
  | "operatoros"
  | "system";

export type NavIconKey =
  | "activity"
  | "book"
  | "building"
  | "calendar"
  | "clock"
  | "code"
  | "creditCard"
  | "dashboard"
  | "file"
  | "home"
  | "key"
  | "keyRound"
  | "mapPin"
  | "receipt"
  | "repeat"
  | "server"
  | "shield"
  | "shieldCheck"
  | "smartphone"
  | "terminal"
  | "ticket"
  | "upload"
  | "users"
  | "webhook"
  | "wrench";

export interface FrontendRouteMatrixEntry {
  path: string;
  component: string;
  authRequired: boolean;
  allowedRoles: readonly RouteRole[];
  blockedWhenInactive: boolean;
  sidebarNavItem?: string;
  mobileSupport?: "native" | "desktop" | "none";
  serverGate?: string;
}

export interface SidebarNavItem {
  title: string;
  href: string;
  icon: NavIconKey;
  group: NavGroupId;
  roles: readonly TechDeckRole[];
  exact?: boolean;
  systemOnly?: boolean;
  showWhenPaused?: boolean;
  hideWhenPaused?: boolean;
  hideWhenActiveForClient?: boolean;
  entitlementFeature?: EntitlementFeature;
}

export interface SidebarNavSection {
  id: NavGroupId;
  label: string;
  items: Array<SidebarNavItem & { locked: boolean; lockedReason?: string }>;
}

export const sidebarGroupLabels: Record<NavGroupId, string> = {
  "client-portal": "Client Portal",
  "command-center": "Command Center",
  "service-desk": "Service Desk",
  "clients-assets": "Clients & Assets",
  "field-ops": "Field Ops",
  "evidence-compliance": "Evidence & Compliance",
  "automation-integrations": "Automation & Integrations",
  administration: "Administration",
  operatoros: "OperatorOS",
  system: "System",
};

export const frontendRouteMatrix: readonly FrontendRouteMatrixEntry[] = [
  { path: "/", component: "LandingPage | DashboardPage | Portal redirect", authRequired: false, allowedRoles: ["PUBLIC", "OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, sidebarNavItem: "Dashboard", mobileSupport: "desktop", serverGate: "/api/auth/user + /api/tenant" },
  { path: "/status/:slug", component: "PublicStatusPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "public /api/public/status/:slug" },
  { path: "/t/upload/:token", component: "ExternalUploadPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "tokenized public intake routes" },
  { path: "/privacy", component: "PrivacyPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/terms", component: "TermsPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/refund", component: "RefundPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/pricing", component: "PricingPage redirect", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "redirects to OperatorOS billing" },
  { path: "/access-denied", component: "AccessDeniedPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/delete-account", component: "DeleteAccountPage", authRequired: false, allowedRoles: ["PUBLIC", "OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "/api/account/info + DELETE /api/account require auth" },
  { path: "/login", component: "LoginPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/register", component: "RegisterPage", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none" },
  { path: "/reviewer-login", component: "ReviewerLoginPage redirect", authRequired: false, allowedRoles: ["PUBLIC"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "redirects to OperatorOS review access" },
  { path: "/portal", component: "PortalHomePage", authRequired: true, allowedRoles: ["CLIENT"], blockedWhenInactive: true, sidebarNavItem: "Portal", mobileSupport: "none", serverGate: "requireTenant + requireFeature(portal)" },
  { path: "/portal/clients/:id", component: "PortalClientDetailPage", authRequired: true, allowedRoles: ["CLIENT"], blockedWhenInactive: true, mobileSupport: "none", serverGate: "requireTenant + requireFeature(portal)" },
  { path: "/portal/evidence", component: "PortalEvidencePage", authRequired: true, allowedRoles: ["CLIENT"], blockedWhenInactive: true, sidebarNavItem: "My Evidence", mobileSupport: "none", serverGate: "requireTenant + requireFeature(portal)" },
  { path: "/portal/tickets", component: "PortalTicketsPage", authRequired: true, allowedRoles: ["CLIENT"], blockedWhenInactive: true, sidebarNavItem: "My Tickets", mobileSupport: "none", serverGate: "requireTenant + requireFeature(portal)" },
  { path: "/portal/invoices", component: "PortalInvoicesPage", authRequired: true, allowedRoles: ["CLIENT"], blockedWhenInactive: true, sidebarNavItem: "My Invoices", mobileSupport: "none", serverGate: "requireTenant + requireFeature(portal)" },
  { path: "/tickets", component: "TicketsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Tickets", mobileSupport: "native", serverGate: "requireTenant + requireNotPaused for writes" },
  { path: "/tickets/:id", component: "TicketDetailPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "native", serverGate: "requireTenant + requireNotPaused for writes" },
  { path: "/clients", component: "ClientsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Clients", mobileSupport: "desktop", serverGate: "requireTenant/requireClientAccess + requireNotPaused for writes" },
  { path: "/clients/:id", component: "ClientDetailPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "desktop", serverGate: "requireClientAccess" },
  { path: "/sites", component: "SitesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Sites", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN,TECH) + requireNotPaused for writes" },
  { path: "/assets", component: "AssetsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Assets", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN,TECH) + requireNotPaused for writes" },
  { path: "/calendar", component: "CalendarPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Calendar", mobileSupport: "native", serverGate: "requireTenant + requireNotPaused for writes" },
  { path: "/time", component: "TimeEntriesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Time Tracking", mobileSupport: "native", serverGate: "requireTenant + requireNotPaused for writes" },
  { path: "/kb", component: "KbListPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Knowledge Base", mobileSupport: "desktop", serverGate: "requireTenant + admin write gates" },
  { path: "/kb/:id", component: "KbArticlePage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "desktop", serverGate: "requireTenant" },
  { path: "/evidence", component: "EvidencePage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, sidebarNavItem: "Evidence", mobileSupport: "desktop", serverGate: "requireTenant + requireNotPaused for writes" },
  { path: "/evidence/upload", component: "EvidenceUploadPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "desktop", serverGate: "requireTenant + requireNotPaused + storage limit" },
  { path: "/evidence/:id", component: "EvidenceDetailPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, mobileSupport: "desktop", serverGate: "requireTenant + requireNotPaused for deletes" },
  { path: "/invoices", component: "InvoicesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Invoices", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/invoices/:id", component: "InvoiceDetailPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/billing-settings", component: "BillingSettingsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Billing Settings", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/recurring-tickets", component: "RecurringTemplatesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Recurring Tickets", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/team", component: "TeamPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Team", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + user limit" },
  { path: "/audit", component: "AuditPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Audit Log", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN)" },
  { path: "/client-access", component: "ClientAccessPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Client Access", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/licenses", component: "LicensesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Licenses", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireNotPaused for writes" },
  { path: "/licenses/developer", component: "DeveloperPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Developer", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN)" },
  { path: "/webhooks", component: "WebhooksPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Webhooks", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireFeature(webhooks)" },
  { path: "/status-admin", component: "StatusAdminPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Status", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireFeature(status)" },
  { path: "/api-tokens", component: "ApiTokensPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "API Tokens", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN) + requireFeature(api)" },
  { path: "/billing", component: "BillingPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: false, sidebarNavItem: "Billing", mobileSupport: "desktop", serverGate: "read-only OperatorOS entitlement snapshot" },
  { path: "/reports", component: "ReportsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Reports", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN,TECH) + requireFeature(reports)" },
  { path: "/itops", component: "ItOpsConsolePage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "IT Ops Console", mobileSupport: "desktop", serverGate: "requireRole(OWNER,ADMIN,TECH) + requireNotPaused" },
  { path: "/secure-intake", component: "IntakeDashboardPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Secure Intake", mobileSupport: "desktop", serverGate: "requireFeature(intake)" },
  { path: "/secure-intake/spaces", component: "IntakeSpacesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Spaces", mobileSupport: "desktop", serverGate: "requireFeature(intake)" },
  { path: "/secure-intake/requests", component: "IntakeRequestsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Requests", mobileSupport: "desktop", serverGate: "requireFeature(intake)" },
  { path: "/secure-intake/files", component: "IntakeFilesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Files", mobileSupport: "desktop", serverGate: "requireFeature(intake)" },
  { path: "/secure-intake/audit", component: "IntakeAuditPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Audit", mobileSupport: "desktop", serverGate: "requireFeature(intake) + requireRole(OWNER,ADMIN)" },
  { path: "/secure-intake/policies", component: "IntakePoliciesPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Policies", mobileSupport: "desktop", serverGate: "requireFeature(intake) + requireRole(OWNER,ADMIN)" },
  { path: "/secure-intake/storage", component: "IntakeStoragePage", authRequired: true, allowedRoles: ["OWNER", "ADMIN"], blockedWhenInactive: true, sidebarNavItem: "Storage", mobileSupport: "desktop", serverGate: "requireFeature(intake) + requireRole(OWNER,ADMIN)" },
  { path: "/settings", component: "SettingsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Settings", mobileSupport: "desktop", serverGate: "read-only settings queries are tenant scoped" },
  { path: "/account-security", component: "AccountSecurityPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "OperatorOS identity/security management" },
  { path: "/mfa-setup", component: "MfaSetupPage redirect", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, mobileSupport: "none", serverGate: "redirects to OperatorOS identity/security management" },
  { path: "/system-admin", component: "AdminPanelPage", authRequired: true, allowedRoles: ["SYSTEM_ADMIN"], blockedWhenInactive: false, sidebarNavItem: "Admin Panel", mobileSupport: "desktop", serverGate: "requireSystemAdmin" },
  { path: "/m", component: "MobileTicketsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, sidebarNavItem: "Mobile View", mobileSupport: "native", serverGate: "same ticket/time/calendar APIs" },
  { path: "/m/tickets", component: "MobileTicketsPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "native", serverGate: "same ticket APIs" },
  { path: "/m/tickets/:id", component: "MobileTicketDetailPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "native", serverGate: "same ticket APIs" },
  { path: "/m/time", component: "MobileTimePage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "native", serverGate: "same time APIs" },
  { path: "/m/calendar", component: "MobileCalendarPage", authRequired: true, allowedRoles: ["OWNER", "ADMIN", "TECH"], blockedWhenInactive: true, mobileSupport: "native", serverGate: "same appointment APIs" },
  { path: "*", component: "NotFound", authRequired: false, allowedRoles: ["PUBLIC", "OWNER", "ADMIN", "TECH", "CLIENT"], blockedWhenInactive: false, mobileSupport: "none" },
];

export const sidebarNavItems: readonly SidebarNavItem[] = [
  { title: "Portal", href: "/portal", icon: "home", group: "client-portal", roles: ["CLIENT"], exact: true },
  { title: "My Tickets", href: "/portal/tickets", icon: "ticket", group: "client-portal", roles: ["CLIENT"] },
  { title: "My Invoices", href: "/portal/invoices", icon: "receipt", group: "client-portal", roles: ["CLIENT"] },
  { title: "My Evidence", href: "/portal/evidence", icon: "file", group: "client-portal", roles: ["CLIENT"] },
  { title: "Dashboard", href: "/", icon: "dashboard", group: "command-center", roles: ["OWNER", "ADMIN", "TECH"], exact: true },
  { title: "Reports", href: "/reports", icon: "activity", group: "command-center", roles: ["OWNER", "ADMIN", "TECH"], entitlementFeature: "reports" },
  { title: "Mobile View", href: "/m", icon: "smartphone", group: "command-center", roles: ["OWNER", "ADMIN", "TECH"], exact: true },
  { title: "Tickets", href: "/tickets", icon: "ticket", group: "service-desk", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Knowledge Base", href: "/kb", icon: "book", group: "service-desk", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Recurring Tickets", href: "/recurring-tickets", icon: "repeat", group: "service-desk", roles: ["OWNER", "ADMIN"] },
  { title: "Clients", href: "/clients", icon: "users", group: "clients-assets", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Sites", href: "/sites", icon: "mapPin", group: "clients-assets", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Assets", href: "/assets", icon: "server", group: "clients-assets", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Client Access", href: "/client-access", icon: "keyRound", group: "clients-assets", roles: ["OWNER", "ADMIN"] },
  { title: "Calendar", href: "/calendar", icon: "calendar", group: "field-ops", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Time Tracking", href: "/time", icon: "clock", group: "field-ops", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Evidence", href: "/evidence", icon: "file", group: "evidence-compliance", roles: ["OWNER", "ADMIN", "TECH", "CLIENT"], showWhenPaused: true, hideWhenActiveForClient: true },
  { title: "Secure Intake", href: "/secure-intake", icon: "upload", group: "evidence-compliance", roles: ["OWNER", "ADMIN", "TECH"], entitlementFeature: "intake" },
  { title: "Spaces", href: "/secure-intake/spaces", icon: "file", group: "evidence-compliance", roles: ["OWNER", "ADMIN", "TECH"], entitlementFeature: "intake" },
  { title: "Requests", href: "/secure-intake/requests", icon: "upload", group: "evidence-compliance", roles: ["OWNER", "ADMIN", "TECH"], entitlementFeature: "intake" },
  { title: "Files", href: "/secure-intake/files", icon: "file", group: "evidence-compliance", roles: ["OWNER", "ADMIN", "TECH"], entitlementFeature: "intake" },
  { title: "Intake Audit", href: "/secure-intake/audit", icon: "shield", group: "evidence-compliance", roles: ["OWNER", "ADMIN"], entitlementFeature: "intake" },
  { title: "Policies", href: "/secure-intake/policies", icon: "shieldCheck", group: "evidence-compliance", roles: ["OWNER", "ADMIN"], entitlementFeature: "intake" },
  { title: "Storage", href: "/secure-intake/storage", icon: "server", group: "evidence-compliance", roles: ["OWNER", "ADMIN"], entitlementFeature: "intake" },
  { title: "Audit Log", href: "/audit", icon: "shield", group: "evidence-compliance", roles: ["OWNER", "ADMIN"] },
  { title: "IT Ops Console", href: "/itops", icon: "terminal", group: "automation-integrations", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Licenses", href: "/licenses", icon: "key", group: "automation-integrations", roles: ["OWNER", "ADMIN"], exact: true },
  { title: "Developer", href: "/licenses/developer", icon: "code", group: "automation-integrations", roles: ["OWNER", "ADMIN"] },
  { title: "Status", href: "/status-admin", icon: "activity", group: "automation-integrations", roles: ["OWNER", "ADMIN"], entitlementFeature: "status" },
  { title: "Webhooks", href: "/webhooks", icon: "webhook", group: "automation-integrations", roles: ["OWNER", "ADMIN"], entitlementFeature: "webhooks" },
  { title: "API Tokens", href: "/api-tokens", icon: "key", group: "automation-integrations", roles: ["OWNER", "ADMIN"], entitlementFeature: "api" },
  { title: "Invoices", href: "/invoices", icon: "receipt", group: "administration", roles: ["OWNER", "ADMIN"] },
  { title: "Billing Settings", href: "/billing-settings", icon: "wrench", group: "administration", roles: ["OWNER", "ADMIN"] },
  { title: "Team", href: "/team", icon: "building", group: "administration", roles: ["OWNER", "ADMIN"] },
  { title: "Settings", href: "/settings", icon: "wrench", group: "administration", roles: ["OWNER", "ADMIN", "TECH"] },
  { title: "Billing", href: "/billing", icon: "creditCard", group: "operatoros", roles: ["OWNER", "ADMIN"], showWhenPaused: true },
  { title: "Admin Panel", href: "/system-admin", icon: "shieldCheck", group: "system", roles: ["OWNER", "ADMIN", "TECH", "CLIENT"], systemOnly: true, showWhenPaused: true },
];

export const sidebarGroupOrder: readonly NavGroupId[] = [
  "client-portal",
  "command-center",
  "service-desk",
  "clients-assets",
  "field-ops",
  "evidence-compliance",
  "automation-integrations",
  "administration",
  "operatoros",
  "system",
];

export function routeMatches(location: string, href: string, exact = false): boolean {
  if (href === "/") return location === "/";
  if (exact) return location === href;
  return location === href || location.startsWith(`${href}/`);
}

export function getSidebarSections({
  role,
  isSystemAdmin = false,
  isPaused = false,
  features,
}: {
  role: TechDeckRole;
  isSystemAdmin?: boolean;
  isPaused?: boolean;
  features?: readonly string[];
}): SidebarNavSection[] {
  const featureSet = features ? new Set(features) : null;
  const items = sidebarNavItems
    .filter((item) => item.roles.includes(role))
    .filter((item) => !item.systemOnly || isSystemAdmin)
    .filter((item) => {
      if (isPaused) return item.showWhenPaused;
      if (role === "CLIENT" && item.hideWhenActiveForClient) return false;
      return !item.hideWhenPaused;
    });

  return sidebarGroupOrder
    .map((groupId) => ({
      id: groupId,
      label: sidebarGroupLabels[groupId],
      items: items
        .filter((item) => item.group === groupId)
        .map((item) => {
          const locked = !!item.entitlementFeature && !!featureSet && !featureSet.has(item.entitlementFeature);
          return {
            ...item,
            locked,
            lockedReason: locked ? "Managed by OperatorOS" : undefined,
          };
        }),
    }))
    .filter((section) => section.items.length > 0);
}
