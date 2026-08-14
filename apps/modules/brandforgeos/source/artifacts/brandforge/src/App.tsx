import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TenantProvider } from "@/lib/tenant-context";

import Home from "./pages/home";
import Login from "./pages/login";
import Pricing from "./pages/pricing";
import Onboarding from "./pages/onboarding";
import Dashboard from "./pages/dashboard";
import Brands from "./pages/brands";
import BrandDetail from "./pages/brand-detail";
import Campaigns from "./pages/campaigns";
import CampaignDetail from "./pages/campaign-detail";
import CopyStudio from "./pages/copy-studio";
import CalendarPage from "./pages/calendar";
import Analytics from "./pages/analytics";
import SettingsPage from "./pages/settings";
import Strategy from "./pages/strategy";
import AIWorkflows from "./pages/ai-workflows";
import IntegrationsPage from "./pages/integrations";
import TemplatesPage from "./pages/templates";
import AdminPage from "./pages/admin";
import ReportsPage from "./pages/reports";
import { PrivacyPage, TermsPage } from "./pages/legal";

function NotFound() {
  return <div className="p-8 text-center">404 Not Found</div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/brands" component={Brands} />
      <Route path="/brands/:id">{(params) => <BrandDetail brandId={parseInt(params.id)} />}</Route>
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/new" component={Campaigns} />
      <Route path="/campaigns/:id">{(params) => <CampaignDetail campaignId={parseInt(params.id)} />}</Route>
      <Route path="/copy-studio" component={CopyStudio} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/strategy" component={Strategy} />
      <Route path="/ai-workflows" component={AIWorkflows} />
      <Route path="/integrations" component={IntegrationsPage} />
      <Route path="/templates" component={TemplatesPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <TenantProvider>
            <Router />
          </TenantProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
