import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import PublicLayout from "@/components/layout/PublicLayout";
import AppLayout from "@/components/layout/AppLayout";

// Eager: critical above-the-fold landing experience
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

// Lazy: everything else loads on-demand to keep the initial bundle lean.
const Login = lazy(() => import("@/pages/login"));
const Signup = lazy(() => import("@/pages/signup"));
const Pricing = lazy(() => import("@/pages/pricing"));
const Contact = lazy(() => import("@/pages/contact"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Builder = lazy(() => import("@/pages/builder"));
const Kits = lazy(() => import("@/pages/kits"));
const KitDetail = lazy(() => import("@/pages/kit-detail"));
const Brands = lazy(() => import("@/pages/brands"));
const Exports = lazy(() => import("@/pages/exports"));
const Account = lazy(() => import("@/pages/account"));
const Admin = lazy(() => import("@/pages/admin"));
const Templates = lazy(() => import("@/pages/templates"));
const TemplateDetail = lazy(() => import("@/pages/template-detail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8">
      <div className="font-mono text-xs text-muted-foreground animate-pulse">LOADING_MODULE...</div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Switch>
      {/* Public routes */}
      <Route path="/">
        <PublicLayout><Landing /></PublicLayout>
      </Route>
      <Route path="/pricing">
        <PublicLayout><Pricing /></PublicLayout>
      </Route>
      <Route path="/login">
        <PublicLayout><Login /></PublicLayout>
      </Route>
      <Route path="/signup">
        <PublicLayout><Signup /></PublicLayout>
      </Route>
      <Route path="/contact">
        <PublicLayout><Contact /></PublicLayout>
      </Route>
      <Route path="/terms">
        <PublicLayout><Terms /></PublicLayout>
      </Route>
      <Route path="/privacy">
        <PublicLayout><Privacy /></PublicLayout>
      </Route>

      {/* App routes */}
      <Route path="/dashboard">
        <AppLayout><Dashboard /></AppLayout>
      </Route>
      <Route path="/builder">
        <AppLayout><Builder /></AppLayout>
      </Route>
      <Route path="/templates">
        <AppLayout><Templates /></AppLayout>
      </Route>
      <Route path="/templates/:slug">
        <AppLayout><TemplateDetail /></AppLayout>
      </Route>
      <Route path="/kits">
        <AppLayout><Kits /></AppLayout>
      </Route>
      <Route path="/kits/:id">
        <AppLayout><KitDetail /></AppLayout>
      </Route>
      <Route path="/brands">
        <AppLayout><Brands /></AppLayout>
      </Route>
      <Route path="/exports">
        <AppLayout><Exports /></AppLayout>
      </Route>
      <Route path="/account">
        <AppLayout><Account /></AppLayout>
      </Route>
      <Route path="/admin">
        <AppLayout><Admin /></AppLayout>
      </Route>

      <Route>
        <PublicLayout><NotFound /></PublicLayout>
      </Route>
    </Switch>
    </Suspense>
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
        <SonnerToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
