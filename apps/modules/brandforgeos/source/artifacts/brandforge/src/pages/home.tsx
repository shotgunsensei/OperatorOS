import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Palette, PenTool, Megaphone, BarChart3, Calendar, Zap,
  ArrowRight, Check, Star, ChevronDown, Workflow, Shield,
  Lock, Users, TrendingUp, Sparkles, Globe, Target
} from "lucide-react";
import { useState } from "react";

const features = [
  { icon: Palette, title: "Brand HQ", desc: "Centralize voice, colors, and guidelines. Every AI-generated asset stays on-brand, automatically.", tag: "Foundation" },
  { icon: PenTool, title: "AI Copy Studio", desc: "Generate ads, emails, social posts, and landing pages tuned to your audience and tone of voice.", tag: "Create" },
  { icon: Megaphone, title: "Campaign Builder", desc: "Plan multi-channel campaigns with linked assets, checklists, and status tracking.", tag: "Launch" },
  { icon: Calendar, title: "Content Calendar", desc: "Schedule, visualize, and manage your publishing pipeline across every channel.", tag: "Publish" },
  { icon: Workflow, title: "AI Workflows", desc: "Guided workflows for launches, content plans, and ad campaigns — all personalized to your brand.", tag: "Automate" },
  { icon: BarChart3, title: "Analytics & Reports", desc: "Track what's working, export white-label reports, and get AI recommendations to improve results.", tag: "Measure" },
];

const plans = [
  { name: "Free", price: 0, annual: 0, features: ["1 Brand", "3 Campaigns", "50 AI Credits/mo", "Basic Analytics", "Copy Studio", "Community Support"], cta: "Get Started" },
  { name: "Starter", price: 19, annual: 15, features: ["3 Brands", "10 Campaigns", "200 AI Credits/mo", "Full Analytics", "Content Calendar", "AI Workflows", "Email Support"], cta: "Start Free Trial" },
  { name: "Growth", price: 59, annual: 47, popular: true, features: ["10 Brands", "Unlimited Campaigns", "1,000 AI Credits/mo", "Advanced Analytics", "Strategy Workspace", "AI Workflows", "5 Team Members", "API Access", "Priority Support"], cta: "Start Free Trial" },
  { name: "Agency", price: 149, annual: 119, features: ["25 Brands", "Unlimited Everything", "5,000 AI Credits/mo", "White Label Reports", "Client Review Mode", "15 Team Members", "Custom Integrations", "Dedicated Support"], cta: "Start Free Trial" },
];

const testimonials = [
  { name: "Sarah Chen", role: "Founder, GlowUp Beauty", text: "BrandForge replaced Jasper, Notion, and our project management tool. Content output tripled — and it actually sounds like us.", avatar: "SC" },
  { name: "Marcus Johnson", role: "CEO, Velocity Agency", text: "We manage 12 client brands from one dashboard. White-label reports alone saved us 10 hours a week.", avatar: "MJ" },
  { name: "Priya Patel", role: "VP Marketing, ScaleKit", text: "The AI workflows understand our positioning. We went from idea to full campaign launch in under an hour.", avatar: "PP" },
];

const faqs = [
  { q: "How is BrandForge different from ChatGPT or Jasper?", a: "BrandForge is a marketing operating system, not just an AI writer. It connects brand identity, copy generation, campaign management, scheduling, and analytics in one workflow. The AI is trained on your brand context, so output is specific — not generic." },
  { q: "Can I manage multiple brands or clients?", a: "Yes. Growth supports 10 brands, Agency supports 25, and Enterprise is unlimited. Each brand has isolated context, team permissions, and white-label reporting." },
  { q: "What counts as an AI credit?", a: "One AI credit equals one generation request — a blog post, ad set, email draft, or strategy recommendation. Most tasks use 1-3 credits. You can purchase additional credit packs anytime." },
  { q: "Is my data secure?", a: "Each workspace is fully isolated with tenant-scoped access controls and audit logging. Your data is never shared between workspaces or used outside of your account." },
  { q: "Can I cancel anytime?", a: "Yes. No contracts, no cancellation fees. Downgrade or cancel from Settings at any time. Your data is preserved for 30 days after cancellation." },
];

export default function Home() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 w-full z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-sm shadow-sm">B</div>
            <span className="font-bold text-lg tracking-tight">BrandForge</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground font-medium hidden sm:block">Log in</Link>
            <Button asChild size="sm" className="rounded-full px-5">
              <Link href="/login">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Zap className="h-3.5 w-3.5" />
              Brand-aware AI for modern marketing teams
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
              One platform from<br />
              <span className="gradient-brand-text">strategy to revenue</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              BrandForge connects brand identity, AI copy generation, campaign management, and analytics into a single workflow. Built for founders, agencies, and growing teams.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button size="lg" asChild className="rounded-full px-8 text-base h-12">
                <Link href="/login">Start Free — No Credit Card <ArrowRight className="h-4 w-4 ml-2" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="rounded-full px-8 text-base h-12">
                <Link href="/pricing">View Plans</Link>
              </Button>
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Free forever plan</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-green-500" /> Setup in 2 minutes</span>
            </div>
          </div>
        </section>

        <section className="pb-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border bg-card p-1.5 shadow-2xl overflow-hidden">
              <div className="w-full aspect-[16/9] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-8 bg-white/80 dark:bg-slate-800/80 border-b flex items-center px-4 gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  <span className="text-[10px] text-muted-foreground ml-3 font-mono">app.brandforge.com/dashboard</span>
                </div>
                <div className="absolute inset-0 mt-8 grid grid-cols-12 gap-2 p-3">
                  <div className="col-span-2 row-span-6 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-2 space-y-2">
                    <div className="w-full h-6 rounded bg-primary/10 flex items-center px-2"><div className="w-4 h-4 rounded gradient-brand" /></div>
                    {["Dashboard", "Brand HQ", "Campaigns", "Copy Studio", "Calendar"].map((label) => (
                      <div key={label} className="w-full h-5 rounded text-[8px] text-muted-foreground flex items-center px-2 hover:bg-muted/50">{label}</div>
                    ))}
                  </div>
                  <div className="col-span-3 row-span-2 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-3">
                    <div className="text-[8px] text-muted-foreground mb-1">Brands</div>
                    <div className="text-lg font-bold">4</div>
                  </div>
                  <div className="col-span-3 row-span-2 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-3">
                    <div className="text-[8px] text-muted-foreground mb-1">Active Campaigns</div>
                    <div className="text-lg font-bold">12</div>
                  </div>
                  <div className="col-span-4 row-span-2 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-3">
                    <div className="text-[8px] text-muted-foreground mb-1">AI Credits</div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-2"><div className="h-full w-3/5 bg-green-500 rounded-full" /></div>
                  </div>
                  <div className="col-span-5 row-span-4 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-3">
                    <div className="text-[8px] font-medium mb-2">Content Output</div>
                    <div className="flex items-end gap-[2px] h-16">
                      {[30,45,20,60,35,50,65,40,55,70,45,80,60,75,50,65,85,55,70,90].map((h, i) => (
                        <div key={i} className="flex-1 bg-primary/60 rounded-t-sm" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className="col-span-5 row-span-4 bg-white dark:bg-slate-800 rounded-lg border shadow-sm p-3">
                    <div className="text-[8px] font-medium mb-2">AI Recommendations</div>
                    <div className="space-y-1.5">
                      {["Shorten ad hooks to under 6 words", "Add testimonials to landing page", "Retarget top-performing assets"].map((r) => (
                        <div key={r} className="flex items-center gap-1.5 text-[7px] text-muted-foreground">
                          <Sparkles className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 px-6 border-y bg-muted/30">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Enterprise Security</span>
                </div>
                <div className="text-xs text-muted-foreground">Encrypted and access-controlled</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Lock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Tenant Isolation</span>
                </div>
                <div className="text-xs text-muted-foreground">Data never shared</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Globe className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Multi-Brand</span>
                </div>
                <div className="text-xs text-muted-foreground">Up to 25 brands per workspace</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Brand-Aware AI</span>
                </div>
                <div className="text-xs text-muted-foreground">Personalized to your voice</div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need. Nothing you don't.</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Stop juggling six different tools. BrandForge gives you one connected platform for your entire marketing operation.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <Card key={f.title} className="group hover:shadow-md hover:border-primary/20 transition-all duration-200">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <f.icon className="h-5 w-5 text-primary" />
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{f.tag}</span>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6 bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">From setup to results in one workflow</h2>
              <p className="text-lg text-muted-foreground">No learning curve. No switching between tools.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: "1", title: "Define your brand", desc: "Set up your business context, audience, and voice in 2 minutes. BrandForge generates your messaging pillars, ICP, and positioning automatically.", icon: Target },
                { step: "2", title: "Create & launch", desc: "Use AI workflows to generate on-brand copy, plan campaigns, and schedule content — everything stays connected.", icon: PenTool },
                { step: "3", title: "Measure & optimize", desc: "Track performance, generate client-ready reports, and get AI recommendations to continuously improve your ROI.", icon: TrendingUp },
              ].map((s) => (
                <div key={s.step} className="text-center">
                  <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center text-white mx-auto mb-5 shadow-lg">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for teams that ship</h2>
              <p className="text-lg text-muted-foreground">Hear from founders and agency leaders using BrandForge</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <Card key={t.name} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex gap-0.5 mb-4">{[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 text-yellow-500 fill-yellow-500" />)}</div>
                    <p className="text-sm leading-relaxed mb-5">"{t.text}"</p>
                    <div className="flex items-center gap-3 pt-4 border-t">
                      <div className="w-9 h-9 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold">{t.avatar}</div>
                      <div>
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20 px-6 bg-muted/30 border-y">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing</h2>
              <p className="text-lg text-muted-foreground mb-6">Start free. Scale when you're ready.</p>
              <div className="inline-flex items-center gap-3 p-1 bg-muted rounded-full">
                <button
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${!annual ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setAnnual(false)}
                >
                  Monthly
                </button>
                <button
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${annual ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setAnnual(true)}
                >
                  Annual <span className="text-green-600 text-xs ml-1">Save 20%</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((p) => (
                <Card key={p.name} className={`relative ${p.popular ? "border-primary shadow-lg ring-1 ring-primary/20" : ""}`}>
                  {p.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full gradient-brand text-white text-xs font-medium">Most Popular</div>
                  )}
                  <CardContent className="pt-6">
                    <h3 className="font-semibold text-lg">{p.name}</h3>
                    <div className="mt-2 mb-4">
                      <span className="text-4xl font-bold">${annual ? p.annual : p.price}</span>
                      <span className="text-muted-foreground">{p.price === 0 ? " forever" : "/mo"}</span>
                      {annual && p.price > 0 && (
                        <div className="text-xs text-green-600 font-medium mt-1">Save ${(p.price - p.annual) * 12}/year</div>
                      )}
                    </div>
                    <ul className="space-y-2.5 mb-6">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant={p.popular ? "default" : "outline"} className="w-full rounded-full">
                      <Link href="/login">{p.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8">
              Need more? <Link href="/pricing" className="text-primary hover:underline font-medium">Enterprise plans</Link> include unlimited brands, dedicated support, and custom SLAs.
            </p>
          </div>
        </section>

        <section id="faq" className="py-20 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Frequently asked questions</h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group border rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className="font-medium text-sm">{faq.q}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0 ml-4" />
                  </summary>
                  <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="rounded-2xl gradient-brand p-12 text-white">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to run your marketing from one platform?</h2>
              <p className="text-lg text-white/80 mb-8">Start free. No credit card. Cancel anytime.</p>
              <Button size="lg" variant="secondary" asChild className="rounded-full px-10 text-base h-12">
                <Link href="/login">Get Started Free <ArrowRight className="h-4 w-4 ml-2" /></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12 px-6 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-xs">B</div>
                <span className="font-bold">BrandForge</span>
              </div>
              <p className="text-sm text-muted-foreground">The marketing OS for modern teams.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Product</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="#features" className="block hover:text-foreground transition-colors">Features</a>
                <Link href="/pricing" className="block hover:text-foreground transition-colors">Pricing</Link>
                <Link href="/templates" className="block hover:text-foreground transition-colors">Templates</Link>
                <Link href="/integrations" className="block hover:text-foreground transition-colors">Integrations</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Resources</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <a href="#faq" className="block hover:text-foreground transition-colors">Help Center</a>
                <Link href="/pricing" className="block hover:text-foreground transition-colors">Pricing</Link>
                <a href="#features" className="block hover:text-foreground transition-colors">Changelog</a>
                <Link href="/login" className="block hover:text-foreground transition-colors">Sign In</Link>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Legal</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <Link href="/privacy" className="block hover:text-foreground transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="block hover:text-foreground transition-colors">Terms of Service</Link>
                <a href="#faq" className="block hover:text-foreground transition-colors">Security</a>
              </div>
            </div>
          </div>
          <div className="border-t pt-8 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} BrandForge OS. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
