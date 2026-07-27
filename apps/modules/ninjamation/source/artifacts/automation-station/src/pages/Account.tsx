import { useAuth } from "@workspace/replit-auth-web";
import { useGetSubscriptionStatus, useCreatePortalSession } from "@workspace/api-client-react";
import { Loader2, CreditCard, Star, Clock } from "lucide-react";
import { motion } from "framer-motion";

export default function Account() {
  const { user } = useAuth();
  const { data: subStatus, isLoading: subLoading } = useGetSubscriptionStatus();
  const { mutate: portal, isPending: portalPending } = useCreatePortalSession();

  const handleManageBilling = () => {
    portal(undefined, {
      onSuccess: (res) => {
        window.location.href = res.url;
      }
    });
  };

  return (
    <div className="min-h-screen pt-32 pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-black font-display mb-8">Account Settings</h1>

        <div className="grid gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-8"
          >
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Star className="w-5 h-5 text-primary" /> Profile
            </h2>
            <div className="flex items-center gap-6">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border border-white/10 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl font-bold text-muted-foreground">
                  {user?.firstName?.charAt(0) || user?.email?.charAt(0) || '?'}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold">{user?.firstName} {user?.lastName}</h3>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-8"
          >
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" /> Subscription
            </h2>
            
            {subLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : subStatus?.hasSubscription ? (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white/5 p-6 rounded-xl border border-white/5 mb-8">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Plan</p>
                    <p className="text-2xl font-bold capitalize text-gradient">{subStatus.tier} Tier</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Renews: {subStatus.currentPeriodEnd ? new Date(subStatus.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                <div className="flex justify-end">
                  {subStatus.stripeCustomerId ? (
                    <button 
                      onClick={handleManageBilling}
                      disabled={portalPending}
                      className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-medium transition-colors flex items-center gap-2"
                    >
                      {portalPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Manage Billing
                    </button>
                  ) : (
                    <p className="text-sm text-muted-foreground">Your subscription is managed by an administrator.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-6">You are not currently subscribed to any plan.</p>
                <a href="/pricing" className="inline-block px-6 py-3 rounded-xl bg-ninja-red text-white font-bold red-glow hover:-translate-y-0.5 transition-all duration-300">
                  View Plans
                </a>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
