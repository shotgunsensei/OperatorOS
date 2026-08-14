import { Link } from "wouter";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Get started with basic field documentation.",
    features: ["3 reports/month", "Basic PDF exports", "SnapProof branding", "2 templates"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Solo",
    price: 19,
    description: "For independent contractors and solo techs.",
    features: ["25 reports/month", "Custom logo on reports", "All industry templates", "Customer management", "Better exports"],
    cta: "Start Trial",
    highlighted: false,
  },
  {
    name: "Pro",
    price: 49,
    description: "For growing businesses that need polish.",
    features: ["Unlimited reports", "Advanced templates", "Shareable client links", "Full branded exports", "Digital signatures", "Priority support"],
    cta: "Start Trial",
    highlighted: true,
  },
  {
    name: "Team",
    price: 99,
    description: "For teams that share customers and jobs.",
    features: ["Up to 5 team seats", "Shared workspace", "Team activity log", "Advanced branding", "Shared customer database", "Role-based access"],
    cta: "Start Trial",
    highlighted: false,
  },
  {
    name: "White Label",
    price: 199,
    description: "Full branding control for MSPs and agencies.",
    features: ["Up to 25 seats", "100% white-label exports", "Full branding control", "Custom report headers/footers", "Priority support", "Higher storage limits"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function Pricing() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-4">Simple Pricing</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          No per-report fees. No hidden costs. Pick a plan that fits your team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-16">
        {plans.map((plan, i) => (
          <div key={i} className={`bg-card border rounded-lg p-6 flex flex-col ${plan.highlighted ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
            {plan.highlighted && (
              <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Most Popular</div>
            )}
            <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
            <div className="mb-3">
              <span className="text-3xl font-bold">${plan.price}</span>
              <span className="text-muted-foreground text-sm">/mo</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f, j) => (
                <li key={j} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`block text-center py-2.5 rounded text-sm font-medium transition-colors ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="text-center text-muted-foreground text-sm">
        All plans include a 14-day free trial. No credit card required.
      </div>
    </div>
  );
}
