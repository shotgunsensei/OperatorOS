import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

// Layouts
import { AppLayout } from "@/components/layout/AppLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";

// Public Pages
import Index from "@/pages/index";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Pricing from "@/pages/pricing";
import Features from "@/pages/features";
import UseCases from "@/pages/use-cases";

// App Pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs";
import JobDetail from "@/pages/job-detail";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Templates from "@/pages/templates";
import Activity from "@/pages/activity";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import Billing from "@/pages/billing";

// Misc
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { data: user, isLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  if (isLoading) return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  
  if (!user) return <Redirect to="/login" />;

  return (
    <AppLayout>
      <Component {...rest} />
    </AppLayout>
  );
}

function PublicRoute({ component: Component, ...rest }: any) {
  return (
    <PublicLayout>
      <Component {...rest} />
    </PublicLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={() => <PublicRoute component={Index} />} />
      <Route path="/features" component={() => <PublicRoute component={Features} />} />
      <Route path="/use-cases" component={() => <PublicRoute component={UseCases} />} />
      <Route path="/pricing" component={() => <PublicRoute component={Pricing} />} />
      <Route path="/login" component={() => <PublicRoute component={Login} />} />
      <Route path="/register" component={() => <PublicRoute component={Register} />} />

      {/* Protected App Routes */}
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/jobs" component={() => <ProtectedRoute component={Jobs} />} />
      <Route path="/jobs/:id" component={() => <ProtectedRoute component={JobDetail} />} />
      <Route path="/customers" component={() => <ProtectedRoute component={Customers} />} />
      <Route path="/customers/:id" component={() => <ProtectedRoute component={CustomerDetail} />} />
      <Route path="/templates" component={() => <ProtectedRoute component={Templates} />} />
      <Route path="/activity" component={() => <ProtectedRoute component={Activity} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/billing" component={() => <ProtectedRoute component={Billing} />} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
