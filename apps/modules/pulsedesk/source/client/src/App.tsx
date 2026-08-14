import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { DemoBanner } from "@/components/demo-banner";
import { NotificationCenter } from "@/components/notification-center";
import { PulseLoader } from "@/components/pulse-line";
import NotFound, { Unauthorized } from "@/pages/not-found";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import AuthPage from "@/pages/auth-page";
import LandingPage from "@/pages/landing";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import OrgSetup from "@/pages/org-setup";
import Dashboard from "@/pages/dashboard";
import TicketsPage from "@/pages/tickets";
import TicketDetail from "@/pages/ticket-detail";
import SubmitIssue from "@/pages/submit-issue";
import DepartmentsPage from "@/pages/departments";
import AssetsPage from "@/pages/assets";
import SupplyRequestsPage from "@/pages/supply-requests";
import FacilityRequestsPage from "@/pages/facility-requests";
import VendorsPage from "@/pages/vendors";
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const EmailSettingsPage = lazy(() => import("@/pages/email-settings"));
const AdminPage = lazy(() => import("@/pages/admin"));
import { canSubmitIssues, canViewAnalytics, isReadOnly, canManageSettings } from "@/lib/permissions";

function LazyFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <PulseLoader />
    </div>
  );
}

function RoleGate({ children, check, fallback }: {
  children: React.ReactNode;
  check: boolean;
  fallback?: React.ReactNode;
}) {
  if (!check) return <>{fallback || <Unauthorized />}</>;
  return <>{children}</>;
}

function AppContent() {
  const { user, org, membership, isLoading } = useAuth();
  const role = membership?.role;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <PulseLoader />
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/login" component={AuthPage} />
        <Route path="/" component={LandingPage} />
        <Route><AuthPage /></Route>
      </Switch>
    );
  }

  if (!org) {
    return <OrgSetup />;
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex flex-col h-screen w-full">
        <DemoBanner />
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-end px-4 py-1.5 border-b bg-background/80 backdrop-blur-sm lg:hidden">
              <NotificationCenter />
            </div>
            <ErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
              <Switch>
                <Route path="/privacy" component={PrivacyPolicy} />
                <Route path="/terms" component={TermsOfService} />
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/tickets" component={TicketsPage} />
                <Route path="/tickets/:id" component={TicketDetail} />
                <Route path="/submit">
                  <RoleGate check={canSubmitIssues(role)}>
                    <SubmitIssue />
                  </RoleGate>
                </Route>
                <Route path="/departments" component={DepartmentsPage} />
                <Route path="/assets" component={AssetsPage} />
                <Route path="/assets/:assetId/report-issue">
                  <RoleGate check={canSubmitIssues(role)}>
                    <SubmitIssue />
                  </RoleGate>
                </Route>
                <Route path="/supply-requests">
                  <RoleGate check={!isReadOnly(role)}>
                    <SupplyRequestsPage />
                  </RoleGate>
                </Route>
                <Route path="/facility-requests">
                  <RoleGate check={!isReadOnly(role)}>
                    <FacilityRequestsPage />
                  </RoleGate>
                </Route>
                <Route path="/vendors" component={VendorsPage} />
                <Route path="/analytics">
                  <RoleGate check={canViewAnalytics(role) || role === "admin"}>
                    <AnalyticsPage />
                  </RoleGate>
                </Route>
                <Route path="/email-settings">
                  <RoleGate check={canManageSettings(role)}>
                    <EmailSettingsPage />
                  </RoleGate>
                </Route>
                <Route path="/settings">
                  <RoleGate check={!isReadOnly(role)}>
                    <SettingsPage />
                  </RoleGate>
                </Route>
                <Route path="/admin">
                  <RoleGate check={!!user?.isSuperAdmin}>
                    <AdminPage />
                  </RoleGate>
                </Route>
                <Route component={NotFound} />
              </Switch>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </AuthProvider>
        <PwaInstallPrompt />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
