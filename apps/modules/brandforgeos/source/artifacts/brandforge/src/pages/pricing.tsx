import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, ArrowRight, Zap, ChevronDown } from "lucide-react";

const plans = [
  {
    name: "Free", price: 0, annual: 0,
    desc: "For individuals exploring BrandForge",
    features: ["1 Brand", "3 Campaigns", "50 AI Credits/mo", "Basic Analytics", "Copy Studio", "Community Support"],
    limits: { brands: 1, campaigns: 3, credits: 50, seats: 1 },
    cta: "Get Started",
  },
  {
    name: "Starter", price: 19, annual: 15,
    desc: "For solo founders and small teams",
    features: ["3 Brands", "10 Campaigns", "200 AI Credits/mo", "Full Analytics", "Content Calendar", "AI Workflows", "Email Support"],
    limits: { brands: 3, campaigns: 10, credits: 200, seats: 2 },
    cta: "Start Free Trial",
  },
  {
    name: "Growth", price: 59, annual: 47, popular: true,
    desc: "For growing businesses and teams",
    features: ["10 Brands", "Unlimited Campaigns", "1,000 AI Credits/mo", "Advanced Analytics", "Strategy Workspace", "AI Workflows", "5 Team Members", "API Access", "Priority Support"],
    limits: { brands: 10, campaigns: -1, credits: 1000, seats: 5 },
    cta: "Start Free Trial",
  },
  {
    name: "Agency", price: 149, annual: 119,
    desc: "For agencies managing client brands",
    features: ["25 Brands", "Unlimited Everything", "5,000 AI Credits/mo", "White Label Reports", "Client Review Mode", "15 Team Members", "Custom Integrations", "Dedicated Support"],
    limits: { brands: 25, campaigns: -1, credits: 5000, seats: 15 },
    cta: "Start Free Trial",
  },
];

const comparisonFeatures = [
  { name: "Brands", free: "1", starter: "3", growth: "10", agency: "25" },
  { name: "Campaigns", free: "3", starter: "10", growth: "Unlimited", agency: "Unlimited" },
  { name: "AI Credits/month", free: "50", starter: "200", growth: "1,000", agency: "5,000" },
  { name: "Team Members", free: "1", starter: "2", growth: "5", agency: "15" },
  { name: "Copy Studio", free: true, starter: true, growth: true, agency: true },
  { name: "Content Calendar", free: false, starter: true, growth: true, agency: true },
  { name: "AI Workflows", free: false, starter: true, growth: true, agency: true },
  { name: "Strategy Workspace", free: false, starter: false, growth: true, agency: true },
  { name: "Advanced Analytics", free: false, starter: false, growth: true, agency: true },
  { name: "Client Review Mode", free: false, starter: false, growth: false, agency: true },
  { name: "White Label", free: false, starter: false, growth: false, agency: true },
  { name: "API Access", free: false, starter: false, growth: true, agency: true },
  { name: "Custom Integrations", free: false, starter: false, growth: false, agency: true },
  { name: "Priority Support", free: false, starter: false, growth: true, agency: true },
];

const faqs = [
  { q: "Can I switch plans anytime?", a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle." },
  { q: "What happens when I hit my AI credit limit?", a: "You'll see a notification when you're approaching your limit. You can upgrade your plan or purchase additional credits." },
  { q: "Is there a free trial?", a: "Yes! All paid plans come with a 14-day free trial. No credit card required to start." },
  { q: "What counts as an AI credit?", a: "Each AI generation (copy, strategy, campaign ideas, workflow step) costs 1 credit. Regenerations also count as credits." },
  { q: "Do you offer annual billing?", a: "Yes, save up to 20% with annual billing. You can switch between monthly and annual at any time." },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 w-full z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">B</div>
            <span className="font-bold text-lg tracking-tight">BrandForge</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground font-medium">Log in</Link>
            <Button asChild size="sm" className="rounded-full px-5"><Link href="/login">Get Started</Link></Button>
          </div>
        </div>
      </header>

      <main className="pt-24">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Simple, transparent pricing</h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">Start free. Scale as you grow. No hidden fees.</p>

            <div className="flex items-center justify-center gap-3 mt-8">
              <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
              <button
                onClick={() => setAnnual(!annual)}
                className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
              <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
                Annual <Badge variant="secondary" className="ml-1 text-[10px] text-green-600">Save 20%</Badge>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-20">
            {plans.map(plan => (
              <Card key={plan.name} className={`relative flex flex-col ${plan.popular ? "border-primary shadow-lg ring-1 ring-primary/20" : "hover:shadow-md"} transition-all`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full gradient-brand text-white text-xs font-medium shadow-sm">Most Popular</div>
                )}
                <CardContent className="pt-8 pb-6 flex flex-col flex-1">
                  <h3 className="font-bold text-lg">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">{plan.desc}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">${annual ? plan.annual : plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.price === 0 ? " forever" : "/mo"}</span>
                    {annual && plan.price > 0 && (
                      <div className="text-xs text-green-600 font-medium mt-1">
                        ${(plan.price - plan.annual) * 12}/yr saved
                      </div>
                    )}
                  </div>
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={plan.popular ? "default" : "outline"} className="w-full rounded-full">
                    <Link href="/login">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mb-20 bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0">
            <CardContent className="py-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
                <p className="text-slate-300 max-w-lg">Need unlimited brands, custom integrations, SSO, dedicated support, and SLA guarantees? Let's talk about a plan tailored to your organization.</p>
              </div>
              <Button variant="secondary" size="lg" className="rounded-full px-8 whitespace-nowrap">
                Contact Sales <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          <div className="mb-20">
            <h2 className="text-2xl font-bold text-center mb-8">Compare plans</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 pr-4 font-medium text-muted-foreground">Feature</th>
                    {plans.map(p => (
                      <th key={p.name} className="text-center py-3 px-4 font-semibold">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map(f => (
                    <tr key={f.name} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{f.name}</td>
                      {(["free", "starter", "growth", "agency"] as const).map(plan => {
                        const val = f[plan];
                        return (
                          <td key={plan} className="text-center py-3 px-4">
                            {typeof val === "boolean" ? (
                              val ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            ) : (
                              <span className="font-medium">{val}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="max-w-3xl mx-auto mb-20">
            <h2 className="text-2xl font-bold text-center mb-8">Frequently asked questions</h2>
            <div className="space-y-3">
              {faqs.map(faq => (
                <details key={faq.q} className="group border rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className="font-medium text-sm">{faq.q}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-6 pb-4 text-sm text-muted-foreground">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
