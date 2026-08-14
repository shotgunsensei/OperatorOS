import { motion } from "framer-motion";
import { Check, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useGetSubscriptionPlans, useCreateCheckoutSession } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";

export default function Pricing() {
  const { data: plansData, isLoading: plansLoading } = useGetSubscriptionPlans();
  const { mutate: checkout, isPending: checkoutPending } = useCreateCheckoutSession();
  const { isAuthenticated, login } = useAuth();

  const handleSubscribe = (priceId: string) => {
    if (!isAuthenticated) {
      login();
      return;
    }
    if (!priceId) {
      alert('Checkout is not available yet. Please contact support.');
      return;
    }
    checkout({ data: { priceId } }, {
      onSuccess: (res) => {
        window.location.href = res.url;
      }
    });
  };

  const isPro = (name: string) => name.toLowerCase().includes('pro');

  return (
    <div className="min-h-screen pt-32 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-ninja-red/20 text-ninja-red/80 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> Choose Your Power Level
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-display mb-6">
            <span className="text-gradient">Simple, Scalable</span> Pricing
          </h1>
          <p className="text-xl text-muted-foreground">
            Start small, scale fast. Every plan unlocks powerful automation tools.
          </p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plansData?.plans
              .sort((a, b) => a.amount - b.amount)
              .map((plan, idx) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`glass p-8 rounded-3xl relative overflow-hidden flex flex-col ${
                  isPro(plan.name)
                    ? 'border-ninja-red/30 shadow-[0_0_40px_-10px_rgba(220,38,38,0.15)] scale-[1.02]'
                    : ''
                }`}
              >
                {isPro(plan.name) && (
                  <>
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary to-ninja-red" />
                    <span className="absolute top-4 right-4 px-3 py-1 text-[10px] uppercase tracking-wider font-bold bg-ninja-red/20 text-ninja-red rounded-full border border-ninja-red/20">
                      Most Popular
                    </span>
                  </>
                )}

                <div className="mb-8">
                  <h3 className="text-2xl font-bold font-display mb-2">{plan.name.replace(' Plan', '')}</h3>
                  <p className="text-muted-foreground text-sm min-h-[40px]">{plan.description}</p>
                </div>

                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tight">${plan.amount / 100}</span>
                  <span className="text-muted-foreground font-medium">/{plan.interval}</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {(plan.features || []).map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.priceId)}
                  disabled={checkoutPending}
                  className={`w-full py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                    isPro(plan.name)
                      ? 'bg-ninja-red hover:bg-red-600 text-white shadow-lg red-glow'
                      : 'bg-primary hover:bg-primary/90 text-primary-foreground neon-shadow neon-shadow-hover'
                  }`}
                >
                  {checkoutPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Subscribe Now
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
