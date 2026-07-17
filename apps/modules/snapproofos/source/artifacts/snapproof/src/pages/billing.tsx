import { useGetBillingPlan } from "@workspace/api-client-react";

export default function Billing() {
  const { data: plan, isLoading } = useGetBillingPlan();

  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-muted rounded mb-8"></div></div>;
  }

  const plans = [
    { id: "free", name: "Free", price: 0, features: ["3 reports/month", "Basic exports", "SnapProof branding"] },
    { id: "solo", name: "Solo", price: 19, features: ["25 reports/month", "Custom logo", "Basic customer management"] },
    { id: "pro", name: "Pro", price: 49, features: ["Unlimited reports", "Advanced templates", "Share links", "Branded exports"] },
    { id: "team", name: "Team", price: 99, features: ["Up to 5 users", "Team workspace", "Advanced branding"] },
    { id: "whitelabel", name: "White Label", price: 199, features: ["White-label exports", "Full branding control", "Priority support"] },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Billing</h1>
      <p className="text-muted-foreground mb-8">Manage your subscription and usage.</p>

      {plan && (
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Plan</p>
              <p className="text-2xl font-bold">{plan.planName}</p>
              <p className="text-muted-foreground text-sm mt-1">${plan.monthlyPrice}/month</p>
            </div>
            <div className="text-right text-sm space-y-1">
              <p className="text-muted-foreground">Reports: <span className="text-foreground font-medium">{plan.currentUsage?.reportsUsed || 0}</span></p>
              <p className="text-muted-foreground">Team: <span className="text-foreground font-medium">{plan.currentUsage?.teamSeats || 0} seat(s)</span></p>
              <p className="text-muted-foreground">Storage: <span className="text-foreground font-medium">{plan.currentUsage?.storageUsedMb || 0} MB</span></p>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold mb-4">Available Plans</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {plans.map((p) => (
          <div key={p.id} className={`bg-card border rounded-lg p-5 ${plan?.planId === p.id ? "border-primary" : "border-border"}`}>
            <h3 className="font-bold text-lg mb-1">{p.name}</h3>
            <p className="text-2xl font-bold mb-4">${p.price}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {p.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
            {plan?.planId === p.id && (
              <div className="mt-4 text-xs text-primary font-medium uppercase tracking-wider">Current Plan</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
