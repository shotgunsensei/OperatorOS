import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "next-themes";
import { AppLayout } from "@/components/app-layout";
import { MarketingLayout } from "@/components/marketing-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { Loader2 } from "lucide-react";

// Eager: small, always-rendered shells
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";

// Lazy: route-level chunks for everything else
const Pricing = lazy(() => import("@/pages/pricing"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Contact = lazy(() => import("@/pages/contact"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const StudySets = lazy(() => import("@/pages/study-sets"));
const StudySetNew = lazy(() => import("@/pages/study-sets-new"));
const StudySetDetail = lazy(() => import("@/pages/study-set-detail"));
const StudySetFlashcards = lazy(() => import("@/pages/study-set-flashcards"));
const StudySetQuiz = lazy(() => import("@/pages/study-set-quiz"));
const StudySetReview = lazy(() => import("@/pages/study-set-review"));
const StudySetPlan = lazy(() => import("@/pages/study-set-plan"));
const Exams = lazy(() => import("@/pages/exams"));
const Account = lazy(() => import("@/pages/account"));
const Admin = lazy(() => import("@/pages/admin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function PageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, "")}>
              <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <Switch>
                  <Route path="/">
                    <MarketingLayout><Landing /></MarketingLayout>
                  </Route>
                  <Route path="/login">
                    <MarketingLayout><Login /></MarketingLayout>
                  </Route>
                  <Route path="/signup">
                    <MarketingLayout><Signup /></MarketingLayout>
                  </Route>
                  <Route path="/pricing">
                    <MarketingLayout><Pricing /></MarketingLayout>
                  </Route>
                  <Route path="/contact">
                    <MarketingLayout><Contact /></MarketingLayout>
                  </Route>
                  <Route path="/terms">
                    <MarketingLayout><Terms /></MarketingLayout>
                  </Route>
                  <Route path="/privacy">
                    <MarketingLayout><Privacy /></MarketingLayout>
                  </Route>

                  <Route path="/app" nest>
                    <AppLayout>
                      <Suspense fallback={<PageFallback />}>
                        <Switch>
                          <Route path="/" component={Dashboard} />
                          <Route path="/sets" component={StudySets} />
                          <Route path="/sets/new" component={StudySetNew} />
                          <Route path="/sets/:id" component={StudySetDetail} />
                          <Route path="/sets/:id/flashcards" component={StudySetFlashcards} />
                          <Route path="/sets/:id/quiz" component={StudySetQuiz} />
                          <Route path="/sets/:id/review" component={StudySetReview} />
                          <Route path="/sets/:id/plan" component={StudySetPlan} />
                          <Route path="/exams" component={Exams} />
                          <Route path="/account" component={Account} />
                          <Route path="/admin" component={Admin} />
                          <Route component={NotFound} />
                        </Switch>
                      </Suspense>
                    </AppLayout>
                  </Route>

                  <Route component={NotFound} />
                </Switch>
              </Suspense>
              </ErrorBoundary>
            </WouterRouter>
            <Toaster />
            <SonnerToaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
