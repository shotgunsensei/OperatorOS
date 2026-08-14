import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Import Components
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Import Pages
import Home from "@/pages/Home";
import Pricing from "@/pages/Pricing";
import Library from "@/pages/Library";
import ScriptDetail from "@/pages/ScriptDetail";
import Account from "@/pages/Account";
import GenerateAI from "@/pages/GenerateAI";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import CheckoutCancel from "@/pages/CheckoutCancel";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/pricing" component={Pricing} />
          
          <Route path="/library">
            <ProtectedRoute requireSubscription>
              <Library />
            </ProtectedRoute>
          </Route>
          
          <Route path="/scripts/:id">
            <ProtectedRoute requireSubscription>
              <ScriptDetail />
            </ProtectedRoute>
          </Route>
          
          <Route path="/generate">
            <ProtectedRoute requireSubscription>
              <GenerateAI />
            </ProtectedRoute>
          </Route>
          
          <Route path="/account">
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          </Route>
          
          <Route path="/checkout/success">
            <ProtectedRoute>
              <CheckoutSuccess />
            </ProtectedRoute>
          </Route>
          
          <Route path="/checkout/cancel">
            <ProtectedRoute>
              <CheckoutCancel />
            </ProtectedRoute>
          </Route>
          
          <Route path="/admin" component={Admin} />
          
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
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
