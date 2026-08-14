import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { useMobileRedirect } from "@/hooks/use-mobile-redirect";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PausedBanner } from "@/components/paused-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { Badge } from "@/components/ui/badge";
import { Activity, Building2, ShieldCheck } from "lucide-react";

import { LandingPage, OnboardingPage } from "@/modules/core";

const DashboardPage = lazy(() => import("@/modules/core/pages/dashboard"));
const ClientsPage = lazy(() => import("@/modules/core/pages/clients"));
const ClientDetailPage = lazy(() => import("@/modules/core/pages/client-detail"));
const SitesPage = lazy(() => import("@/modules/core/pages/sites"));
const AssetsPage = lazy(() => import("@/modules/core/pages/assets"));
const TeamPage = lazy(() => import("@/modules/core/pages/team"));
const AuditPage = lazy(() => import("@/modules/core/pages/audit"));
const ClientAccessPage = lazy(() => import("@/modules/core/pages/client-access"));
const SettingsPage = lazy(() => import("@/modules/core/pages/settings"));

const EvidencePage = lazy(() => import("@/modules/evidence").then(m => ({ default: m.EvidencePage })));
const EvidenceUploadPage = lazy(() => import("@/modules/evidence").then(m => ({ default: m.EvidenceUploadPage })));
const EvidenceDetailPage = lazy(() => import("@/modules/evidence").then(m => ({ default: m.EvidenceDetailPage })));

const LicensesPage = lazy(() => import("@/modules/license").then(m => ({ default: m.LicensesPage })));
const DeveloperPage = lazy(() => import("@/modules/license").then(m => ({ default: m.DeveloperPage })));

const WebhooksPage = lazy(() => import("@/modules/webhooks").then(m => ({ default: m.WebhooksPage })));
const StatusAdminPage = lazy(() => import("@/modules/status").then(m => ({ default: m.StatusAdminPage })));
const PublicStatusPage = lazy(() => import("@/modules/status").then(m => ({ default: m.PublicStatusPage })));
const ReportsPage = lazy(() => import("@/modules/reports").then(m => ({ default: m.ReportsPage })));

const PortalHomePage = lazy(() => import("@/modules/portal").then(m => ({ default: m.PortalHomePage })));
const PortalClientDetailPage = lazy(() => import("@/modules/portal").then(m => ({ default: m.PortalClientDetailPage })));
const PortalEvidencePage = lazy(() => import("@/modules/portal").then(m => ({ default: m.PortalEvidencePage })));
const PortalTicketsPage = lazy(() => import("@/modules/portal").then(m => ({ default: m.PortalTicketsPage })));
const PortalInvoicesPage = lazy(() => import("@/modules/portal").then(m => ({ default: m.PortalInvoicesPage })));

const ApiTokensPage = lazy(() => import("@/modules/api").then(m => ({ default: m.ApiTokensPage })));
const BillingPage = lazy(() => import("@/modules/billing").then(m => ({ default: m.BillingPage })));
const AccessDeniedPage = lazy(() => import("@/pages/access-denied"));
const AdminPanelPage = lazy(() => import("@/modules/admin").then(m => ({ default: m.AdminPanelPage })));
const TicketsPage = lazy(() => import("@/modules/tickets").then(m => ({ default: m.TicketsPage })));
const TicketDetailPage = lazy(() => import("@/modules/tickets").then(m => ({ default: m.TicketDetailPage })));
const CalendarPage = lazy(() => import("@/modules/calendar").then(m => ({ default: m.CalendarPage })));
const TimeEntriesPage = lazy(() => import("@/modules/time").then(m => ({ default: m.TimeEntriesPage })));
const BillingSettingsPage = lazy(() => import("@/modules/invoicing").then(m => ({ default: m.BillingSettingsPage })));
const InvoicesPage = lazy(() => import("@/modules/invoicing").then(m => ({ default: m.InvoicesPage })));
const InvoiceDetailPage = lazy(() => import("@/modules/invoicing").then(m => ({ default: m.InvoiceDetailPage })));
const KbListPage = lazy(() => import("@/modules/kb").then(m => ({ default: m.KbListPage })));
const KbArticlePage = lazy(() => import("@/modules/kb").then(m => ({ default: m.KbArticlePage })));
const AccountSecurityPage = lazy(() => import("@/pages/account-security"));
const RecurringTemplatesPage = lazy(() => import("@/modules/recurring").then(m => ({ default: m.RecurringTemplatesPage })));
const ItOpsConsolePage = lazy(() => import("@/modules/itops").then(m => ({ default: m.ItOpsConsolePage })));

const IntakeDashboardPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeDashboardPage })));
const IntakeSpacesPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeSpacesPage })));
const IntakeRequestsPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeRequestsPage })));
const IntakeFilesPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeFilesPage })));
const IntakeAuditPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeAuditPage })));
const IntakePoliciesPage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakePoliciesPage })));
const IntakeStoragePage = lazy(() => import("@/modules/secure-intake").then(m => ({ default: m.IntakeStoragePage })));

const MobileLayout = lazy(() => import("@/modules/mobile").then(m => ({ default: m.MobileLayout })));
const MobileTicketsPage = lazy(() => import("@/modules/mobile").then(m => ({ default: m.MobileTicketsPage })));
const MobileTicketDetailPage = lazy(() => import("@/modules/mobile").then(m => ({ default: m.MobileTicketDetailPage })));
const MobileTimePage = lazy(() => import("@/modules/mobile").then(m => ({ default: m.MobileTimePage })));
const MobileCalendarPage = lazy(() => import("@/modules/mobile").then(m => ({ default: m.MobileCalendarPage })));

const NotFound = lazy(() => import("@/pages/not-found"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const RefundPage = lazy(() => import("@/pages/refund"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const ReviewerLoginPage = lazy(() => import("@/pages/reviewer-login"));
const DeleteAccountPage = lazy(() => import("@/pages/delete-account"));
const LoginPage = lazy(() => import("@/pages/login"));
const RegisterPage = lazy(() => import("@/pages/register"));
const MfaSetupPage = lazy(() => import("@/pages/mfa-setup"));
const ExternalUploadPage = lazy(() => import("@/pages/external-upload"));

import type { TenantWithMember } from "@/lib/types";

function PageFallback() {
  return (
    <div className="flex items-center justify-center p-12" data-testid="page-fallback">
      <div className="space-y-3 w-64">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function RouteShell({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function AuthenticatedApp() {
  const { data: tenantInfo, isLoading: tenantLoading } = useQuery<TenantWithMember | null>({
    queryKey: ["/api/tenant"],
    queryFn: async () => {
      const res = await fetch("/api/tenant", { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load tenant");
      return res.json();
    },
  });

  const { data: adminCheck } = useQuery<{ isSystemAdmin: boolean }>({
    queryKey: ["/api/auth/admin-check"],
  });

  const { data: entitlements } = useQuery<{ snapshot: { subscriptionStatus?: string } | null }>({
    queryKey: ["/api/me/entitlements"],
    refetchInterval: 60000,
  });

  const [location] = useLocation();
  const isSystemAdmin = adminCheck?.isSystemAdmin === true;
  const BLOCKING_STATUSES = new Set(["past_due", "unpaid", "canceled"]);
  const isPaused = !!entitlements?.snapshot?.subscriptionStatus
    && BLOCKING_STATUSES.has(entitlements.snapshot.subscriptionStatus);

  const role = (tenantInfo?.role ?? "TECH") as "OWNER" | "ADMIN" | "TECH" | "CLIENT";
  useMobileRedirect(!!tenantInfo && role !== "CLIENT" && !isPaused);

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!tenantInfo) {
    return <OnboardingPage />;
  }

  const isClient = role === "CLIENT";
  const isAdminOrOwner = role === "OWNER" || role === "ADMIN";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (location.startsWith("/m") && !isClient) {
    return (
      <RouteShell>
        <MobileLayout>
          <Switch>
            <Route path="/m">{() => <MobileTicketsPage />}</Route>
            <Route path="/m/tickets" component={MobileTicketsPage} />
            <Route path="/m/tickets/:id" component={MobileTicketDetailPage} />
            <Route path="/m/time" component={MobileTimePage} />
            <Route path="/m/calendar" component={MobileCalendarPage} />
            <Route>{() => <MobileTicketsPage />}</Route>
          </Switch>
        </MobileLayout>
      </RouteShell>
    );
  }

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar role={role} isSystemAdmin={isSystemAdmin} isPaused={isPaused} />
        <div className="flex flex-col flex-1 min-w-0">
          <header
            className="glass-header flex min-h-14 items-center justify-between gap-4 px-3 py-2 sticky top-0 z-50"
            data-testid="app-operations-bar"
          >
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background/60 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-none">
                    {tenantInfo.tenant.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    Tech Deck command workspace
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="hidden md:inline-flex gap-1">
                <ShieldCheck className="h-3 w-3" />
                {isPaused ? "OperatorOS attention required" : "OperatorOS managed"}
              </Badge>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {role}
              </Badge>
              <ThemeToggle />
            </div>
          </header>
          <PausedBanner />
          <main className="flex-1 overflow-auto">
            <RouteShell>
              {isPaused ? (
                <Switch>
                  <Route path="/">{() => <Redirect to="/evidence" />}</Route>
                  <Route path="/evidence" component={EvidencePage} />
                  <Route path="/evidence/:id" component={EvidenceDetailPage} />
                  {isAdminOrOwner && <Route path="/billing" component={BillingPage} />}
                  {isSystemAdmin && <Route path="/system-admin" component={AdminPanelPage} />}
                  <Route>{() => <Redirect to="/evidence" />}</Route>
                </Switch>
              ) : (
                <Switch>
                  {isClient ? (
                    <Route path="/">{() => <Redirect to="/portal" />}</Route>
                  ) : (
                    <Route path="/" component={DashboardPage} />
                  )}
                  {isClient && <Route path="/portal" component={PortalHomePage} />}
                  {isClient && <Route path="/portal/clients/:id" component={PortalClientDetailPage} />}
                  {isClient && <Route path="/portal/evidence" component={PortalEvidencePage} />}
                  {isClient && <Route path="/portal/tickets" component={PortalTicketsPage} />}
                  {isClient && <Route path="/portal/invoices" component={PortalInvoicesPage} />}
                  {!isClient && <Route path="/tickets" component={TicketsPage} />}
                  {!isClient && <Route path="/tickets/:id" component={TicketDetailPage} />}
                  {!isClient && <Route path="/clients" component={ClientsPage} />}
                  {!isClient && <Route path="/clients/:id" component={ClientDetailPage} />}
                  {!isClient && <Route path="/sites" component={SitesPage} />}
                  {!isClient && <Route path="/assets" component={AssetsPage} />}
                  {!isClient && <Route path="/calendar" component={CalendarPage} />}
                  {!isClient && <Route path="/time" component={TimeEntriesPage} />}
                  {!isClient && <Route path="/kb" component={KbListPage} />}
                  {!isClient && <Route path="/kb/:id" component={KbArticlePage} />}
                  {!isClient && <Route path="/evidence" component={EvidencePage} />}
                  {!isClient && <Route path="/evidence/upload" component={EvidenceUploadPage} />}
                  {!isClient && <Route path="/evidence/:id" component={EvidenceDetailPage} />}
                  {isAdminOrOwner && <Route path="/invoices" component={InvoicesPage} />}
                  {isAdminOrOwner && <Route path="/invoices/:id" component={InvoiceDetailPage} />}
                  {isAdminOrOwner && <Route path="/billing-settings" component={BillingSettingsPage} />}
                  {isAdminOrOwner && <Route path="/recurring-tickets" component={RecurringTemplatesPage} />}
                  {isAdminOrOwner && <Route path="/team" component={TeamPage} />}
                  {isAdminOrOwner && <Route path="/audit" component={AuditPage} />}
                  {isAdminOrOwner && <Route path="/client-access" component={ClientAccessPage} />}
                  {isAdminOrOwner && <Route path="/licenses" component={LicensesPage} />}
                  {isAdminOrOwner && <Route path="/licenses/developer" component={DeveloperPage} />}
                  {isAdminOrOwner && <Route path="/webhooks" component={WebhooksPage} />}
                  {isAdminOrOwner && <Route path="/status-admin" component={StatusAdminPage} />}
                  {isAdminOrOwner && <Route path="/api-tokens" component={ApiTokensPage} />}
                  {isAdminOrOwner && <Route path="/billing" component={BillingPage} />}
                  {!isClient && <Route path="/reports" component={ReportsPage} />}
                  {!isClient && <Route path="/itops" component={ItOpsConsolePage} />}
                  {!isClient && <Route path="/secure-intake" component={IntakeDashboardPage} />}
                  {!isClient && <Route path="/secure-intake/spaces" component={IntakeSpacesPage} />}
                  {!isClient && <Route path="/secure-intake/requests" component={IntakeRequestsPage} />}
                  {!isClient && <Route path="/secure-intake/files" component={IntakeFilesPage} />}
                  {isAdminOrOwner && <Route path="/secure-intake/audit" component={IntakeAuditPage} />}
                  {isAdminOrOwner && <Route path="/secure-intake/policies" component={IntakePoliciesPage} />}
                  {isAdminOrOwner && <Route path="/secure-intake/storage" component={IntakeStoragePage} />}
                  {!isClient && <Route path="/settings" component={SettingsPage} />}
                  <Route path="/account-security" component={AccountSecurityPage} />
                  <Route path="/mfa-setup" component={MfaSetupPage} />
                  {isSystemAdmin && <Route path="/system-admin" component={AdminPanelPage} />}
                  <Route component={NotFound} />
                </Switch>
              )}
            </RouteShell>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/status/:slug">{() => <RouteShell><PublicStatusPage /></RouteShell>}</Route>
      <Route path="/t/upload/:token">{() => <RouteShell><ExternalUploadPage /></RouteShell>}</Route>
      <Route path="/privacy">{() => <RouteShell><PrivacyPage /></RouteShell>}</Route>
      <Route path="/terms">{() => <RouteShell><TermsPage /></RouteShell>}</Route>
      <Route path="/refund">{() => <RouteShell><RefundPage /></RouteShell>}</Route>
      <Route path="/pricing">{() => <RouteShell><PricingPage /></RouteShell>}</Route>
      <Route path="/access-denied">{() => <RouteShell><AccessDeniedPage /></RouteShell>}</Route>
      <Route path="/delete-account">{() => <RouteShell><DeleteAccountPage /></RouteShell>}</Route>
      <Route path="/login">{() => <RouteShell><LoginPage /></RouteShell>}</Route>
      <Route path="/register">{() => <RouteShell><RegisterPage /></RouteShell>}</Route>
      <Route path="/reviewer-login">{() => <RouteShell><ReviewerLoginPage /></RouteShell>}</Route>
      <Route>
        {() => {
          if (isLoading) {
            return (
              <div className="flex items-center justify-center min-h-screen">
                <div className="space-y-3 w-64">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            );
          }

          if (!user) {
            return <LandingPage />;
          }

          return <AuthenticatedApp />;
        }}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <ErrorBoundary>
            <AppRouter />
          </ErrorBoundary>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
