import { useAuth } from "@workspace/replit-auth-web";
import { useGetSubscriptionStatus } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, requireSubscription = false, requirePro = false }: { children: React.ReactNode, requireSubscription?: boolean, requirePro?: boolean }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  const shouldFetchSub = isAuthenticated && requireSubscription;
  const { data: subStatus, isLoading: isSubLoading } = useGetSubscriptionStatus(
    shouldFetchSub ? undefined : { query: { enabled: false, queryKey: ['subscription-status-disabled'] as const } }
  );

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/pricing");
    } else if (!isAuthLoading && isAuthenticated && requireSubscription && !isSubLoading) {
      if (!subStatus?.hasSubscription) {
        setLocation("/pricing");
      }
    }
  }, [isAuthenticated, isAuthLoading, requireSubscription, isSubLoading, subStatus, setLocation]);

  if (isAuthLoading || (requireSubscription && isSubLoading)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (requireSubscription && !subStatus?.hasSubscription) return null;
  
  if (requirePro && subStatus?.tier !== 'pro' && subStatus?.tier !== 'enterprise') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="glass p-8 rounded-2xl max-w-md text-center border-ninja-red/20 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-ninja-red"></div>
          <h2 className="text-2xl font-bold mb-4 font-display">Pro Plan Required</h2>
          <p className="text-muted-foreground mb-8">
            This feature requires a Pro ($20/mo) or Enterprise plan. Upgrade to unlock AI script generation.
          </p>
          <button onClick={() => setLocation("/pricing")} className="px-6 py-3 rounded-xl bg-ninja-red text-white font-bold hover:bg-red-600 transition-colors w-full red-glow">
            Upgrade Now
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
