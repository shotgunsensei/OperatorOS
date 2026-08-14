import {
  Shield,
  FileText,
  Users,
  Lock,
  ArrowRight,
  Database,
  Terminal,
  Ticket,
  Calendar,
  Receipt,
  BookOpen,
  Webhook,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ThemeToggle } from "@/components/theme-toggle";
import heroImage from "@assets/techdeckhero_1771446566988.png";
import logoImage from "@assets/ShotgunNinjaVaulticon_1770412982737.png";
import {
  getOperatorOsBaseUrl,
  getOperatorOsBillingUrl,
  getOperatorOsRequestAccessUrl,
} from "@/lib/operatoros";

const OPERATOROS_URL = getOperatorOsBaseUrl();
const OPERATOROS_BILLING_URL = getOperatorOsBillingUrl();
const REQUEST_ACCESS_URL = getOperatorOsRequestAccessUrl();

const painPoints = [
  {
    icon: AlertTriangle,
    title: "Scripts scattered everywhere",
    description:
      "PowerShell on a desktop. Bash in a Notion page. A USB stick somewhere. Nobody knows which version is current.",
  },
  {
    icon: Clock,
    title: "Tickets without context",
    description:
      "Techs reopen the same case three times because the previous fix, the asset history, and the client notes all live in different tools.",
  },
  {
    icon: Lock,
    title: "Compliance is a fire drill",
    description:
      "When the audit hits, you're screen-shotting Slack threads and praying nobody asks for an immutable trail.",
  },
];

const features = [
  {
    icon: Ticket,
    title: "Ticketing & SLA",
    description:
      "Full ticket lifecycle with SLA profiles, response/resolution clocks, comments, and status indicators.",
  },
  {
    icon: Terminal,
    title: "IT Ops Console",
    description:
      "AI-powered terminal for senior engineers. Quick Fix, Script Builder, Deep Dive, Network Analysis, System Design.",
  },
  {
    icon: FileText,
    title: "Evidence Vault",
    description:
      "Upload, deduplicate (SHA-256), search, and tag screenshots, logs, and PDFs. Linked to clients, sites, and assets.",
  },
  {
    icon: ShieldCheck,
    title: "Secure File Intake",
    description:
      "Token-based upload links for clients and external parties. Password-protect, expire, audit, approve.",
  },
  {
    icon: Calendar,
    title: "Dispatch Calendar",
    description:
      "Schedule appointments, weekly grid view, mobile technician view at /m for on-the-road updates.",
  },
  {
    icon: Receipt,
    title: "Time Tracking & Invoicing",
    description:
      "Log time against tickets and clients. Generate invoices, line items, and public invoice views.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    description:
      "Runbooks, articles, categories, search. The institutional memory your bench techs actually open.",
  },
  {
    icon: Webhook,
    title: "Webhooks & API",
    description:
      "HMAC-signed webhooks, scoped API tokens, status pages. Wire TechDeck into your existing stack.",
  },
  {
    icon: Activity,
    title: "Audit & Reports",
    description:
      "Every action logged. Generate compliance ZIP packets on demand. Built for MSPs that get audited.",
  },
];

const useCases = [
  {
    icon: Building2,
    title: "Managed Service Providers",
    description:
      "Run dozens of client environments with strict tenant isolation. Role-based access for OWNER, ADMIN, TECH, and CLIENT seats.",
    bullets: [
      "Per-client portal with restricted views",
      "MSP-tier plan with high seat & storage limits",
      "Webhook + API integrations to your PSA/RMM",
    ],
  },
  {
    icon: Wrench,
    title: "Internal IT Teams",
    description:
      "Replace the messy mix of spreadsheets, shared drives, and Slack threads with one operational cockpit.",
    bullets: [
      "Asset & site tracking with full history",
      "Knowledge base for internal runbooks",
      "Audit trail for SOC2 / HIPAA / PCI prep",
    ],
  },
  {
    icon: Zap,
    title: "Solo Technicians",
    description:
      "A focused workspace for independent technicians launched through the same OperatorOS entitlement flow as larger teams.",
    bullets: [
      "Mobile view at /m for on-site work",
      "AI IT Ops Console for fast triage",
      "Time tracking → invoice in two clicks",
    ],
  },
];

const plans = [
  {
    name: "Essentials",
    price: "OperatorOS",
    tagline: "For independent technicians",
    features: [
      "Core ticketing and evidence",
      "Mobile technician view",
      "OperatorOS-managed access",
      "Entitlement-based limits",
    ],
    cta: "Request Access",
    href: REQUEST_ACCESS_URL,
    highlighted: false,
  },
  {
    name: "Team",
    price: "OperatorOS",
    tagline: "For small IT shops",
    features: [
      "Everything in Essentials",
      "IT Ops Console (AI)",
      "Team roles and audit logs",
      "Webhooks and status pages when entitled",
    ],
    cta: "Launch from OperatorOS",
    href: OPERATOROS_URL,
    highlighted: true,
  },
  {
    name: "MSP",
    price: "OperatorOS",
    tagline: "For managed service providers",
    features: [
      "Everything in Team",
      "OperatorOS-controlled modules",
      "API access and Secure Intake when entitled",
      "Compliance report packets",
    ],
    cta: "Manage in OperatorOS",
    href: OPERATOROS_URL,
    highlighted: false,
  },
];

const stats = [
  { value: "6", label: "Core modules" },
  { value: "4", label: "Role tiers" },
  { value: "100%", label: "Tenant isolated" },
  { value: "SHA-256", label: "Evidence dedup" },
];

const faqs = [
  {
    q: "Who is Tech Deck built for?",
    a: "MSPs, internal IT teams, and senior technicians who need ticketing, evidence, automation, and audit in one place — without stitching together five tools.",
  },
  {
    q: "How do I get access?",
    a: "Tech Deck access is granted from OperatorOS. Launch Tech Deck from your OperatorOS workspace or request access from the account owner.",
  },
  {
    q: "How does multi-tenant isolation work?",
    a: "Every record is scoped by tenantId at the database and middleware layer. Users in one tenant cannot see, query, or reference data from any other tenant. Period.",
  },
  {
    q: "What is the IT Ops Console?",
    a: "An AI-powered terminal for senior engineers and MSPs with five modes — Quick Fix, Script Builder, Deep Dive, Network Analysis, and System Design. Streaming responses, syntax-highlighted code, and a local Knowledge Vault to save and tag answers.",
  },
  {
    q: "Do you support compliance audits?",
    a: "Every state-changing action emits an event into an immutable audit log. The Reports module generates downloadable ZIP packets containing tickets, evidence, and audit trails for any time window.",
  },
  {
    q: "Can clients submit files securely?",
    a: "Yes. The Secure Intake module gives you tokenized upload links — password-protected, expiring, one-time-use — so external parties can drop files into a controlled space without an account.",
  },
  {
    q: "What about mobile technicians in the field?",
    a: "There's a dedicated mobile view at /m with bottom-tab navigation for tickets, time tracking, and the dispatch calendar. Built for one-hand use on a phone between jobs.",
  },
  {
    q: "How is billing handled?",
    a: "Billing, plan changes, and module entitlements are managed in OperatorOS. Tech Deck receives a read-only entitlement snapshot and enforces it locally.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <img
              src={logoImage}
              alt="Tech Deck"
              className="w-8 h-8 rounded-md object-cover"
            />
            <span className="font-semibold text-sm tracking-tight">
              Tech Deck
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors" data-testid="link-nav-features">Features</a>
            <a href="#use-cases" className="hover:text-foreground transition-colors" data-testid="link-nav-use-cases">Use Cases</a>
            <a href={OPERATOROS_BILLING_URL} className="hover:text-foreground transition-colors" data-testid="link-nav-pricing">OperatorOS Billing</a>
            <a href="#faq" className="hover:text-foreground transition-colors" data-testid="link-nav-faq">FAQ</a>
            <a href="#ecosystem" className="hover:text-foreground transition-colors" data-testid="link-nav-ecosystem">Ecosystem</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild data-testid="button-login">
              <a href={OPERATOROS_URL}>
                Launch from OperatorOS
                <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />
          <div className="relative z-10 flex flex-col min-h-[480px] sm:min-h-[540px] px-6">
            <div className="flex-1" />
            <div className="max-w-3xl mx-auto text-center pb-10 sm:pb-14">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-normal text-white drop-shadow-lg">
                Tech Deck
              </h1>
              <p className="mt-3 mb-6 text-base sm:text-lg text-white/78">
                MSP operations cockpit for ticketing, evidence, automation, secure intake, and audit-ready IT work.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" asChild data-testid="button-get-started">
                  <a href={OPERATOROS_URL}>
                    Launch from OperatorOS
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="backdrop-blur-sm bg-white/5 border-white/20 text-white hover:bg-white/15"
                  data-testid="button-learn-more"
                >
                  <a href="#features">See What's Inside</a>
                </Button>
              </div>
              <div className="flex items-center justify-center gap-4 mt-5 text-xs text-white/60">
                <span>OperatorOS-managed access</span>
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span>Read-only entitlements</span>
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span>Request access from your workspace owner</span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <section className="border-y bg-card/30">
          <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
            {stats.map((s) => (
              <div key={s.label} className="bg-background py-6 px-4 text-center" data-testid={`stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className="text-2xl font-bold tracking-tight text-primary">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Problem */}
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-3">The Problem</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-3">
                IT teams are drowning in disconnected tools.
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Tickets in one app. Scripts in another. Evidence on a shared drive. Client notes in a chat thread. Every minute lost to context-switching is a minute the SLA clock keeps running.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {painPoints.map((p) => (
                <Card key={p.title} className="hover-elevate" data-testid={`card-pain-${p.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-md bg-destructive/10 flex items-center justify-center mb-4">
                      <p.icon className="w-5 h-5 text-destructive" />
                    </div>
                    <h3 className="font-semibold mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="py-20 px-6 bg-card/40 border-y">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-6">
              <Badge variant="outline" className="mb-3">The Solution</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-3">
                One cockpit. Every tool a tech actually opens.
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Tech Deck centralizes scripts, endpoint checks, documentation, automation, and technician workflows into a single multi-tenant platform built for MSPs and senior IT teams.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-3">Features</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                Everything in one stack
              </h2>
              <p className="text-muted-foreground">
                Nine modules. One OperatorOS launch. One audit trail. One entitlement snapshot.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate" data-testid={`card-feature-${feature.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section id="use-cases" className="py-20 px-6 bg-card/40 border-y">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-3">Built For</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                Whoever's holding the pager
              </h2>
              <p className="text-muted-foreground">
                Solo techs to multi-team MSPs. The same cockpit scales with you.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {useCases.map((u) => (
                <Card key={u.title} className="hover-elevate" data-testid={`card-usecase-${u.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-6">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                      <u.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{u.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {u.description}
                    </p>
                    <ul className="space-y-2">
                      {u.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* OperatorOS access */}
        <section id="operatoros-access" className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-3">OperatorOS Access</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                Access follows your OperatorOS workspace
              </h2>
              <p className="text-muted-foreground">
                Plan names, billing state, and module access are assigned in OperatorOS and synced into Tech Deck.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`hover-elevate relative ${plan.highlighted ? "border-primary shadow-lg" : ""}`}
                  data-testid={`card-plan-${plan.name.toLowerCase()}`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                    </div>
                  )}
                  <CardContent className="p-6">
                    <div className="mb-4">
                      <h3 className="font-semibold text-lg">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                    </div>
                    <div className="mb-6">
                      <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                    </div>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "default" : "outline"}
                      asChild
                      data-testid={`button-plan-${plan.name.toLowerCase()}`}
                    >
                      <a href={plan.href}>{plan.cta}</a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Need a different module set or workspace access? <a href={REQUEST_ACCESS_URL} className="underline hover:text-foreground" data-testid="link-enterprise-contact">Request access</a>.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section className="py-16 px-6 bg-card/40 border-y">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="outline" className="mb-3">Trust</Badge>
            <h2 className="text-2xl font-bold tracking-tight mb-3">
              Built like infrastructure should be built
            </h2>
            <div className="grid sm:grid-cols-3 gap-4 mt-8">
              <div className="flex flex-col items-center gap-2" data-testid="trust-tenant">
                <Shield className="w-8 h-8 text-primary" />
                <h3 className="font-semibold text-sm">Tenant-isolated</h3>
                <p className="text-xs text-muted-foreground">Every query scoped at the middleware layer.</p>
              </div>
              <div className="flex flex-col items-center gap-2" data-testid="trust-mfa">
                <Lock className="w-8 h-8 text-primary" />
                <h3 className="font-semibold text-sm">OperatorOS SSO</h3>
                <p className="text-xs text-muted-foreground">Shared login, tenant roles, and entitlement-gated module launch.</p>
              </div>
              <div className="flex flex-col items-center gap-2" data-testid="trust-audit">
                <Database className="w-8 h-8 text-primary" />
                <h3 className="font-semibold text-sm">Immutable audit</h3>
                <p className="text-xs text-muted-foreground">Every state change emits an event. Nothing is lost.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-3">FAQ</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-2">
                Questions, answered
              </h2>
              <p className="text-muted-foreground">
                Still curious? <a href="mailto:hello@techdeck.app" className="underline hover:text-foreground" data-testid="link-faq-contact">Email us</a>.
              </p>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={f.q} value={`item-${i}`} data-testid={`faq-item-${i}`}>
                  <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Ecosystem */}
        <section id="ecosystem" className="py-20 px-6 bg-card/40 border-y">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <Badge variant="outline" className="mb-3">The Ecosystem</Badge>
              <h2 className="text-3xl font-bold tracking-tight mb-3">
                Part of the Shotgun Ninjas stack
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Tech Deck is one product in a focused suite of operational tools. If your work spans more than just IT, here are the sister platforms worth a look.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <a
                href="https://tradeflowkit.com"
                target="_blank"
                rel="noreferrer"
                className="block hover-elevate rounded-lg"
                data-testid="link-ecosystem-tradeflowkit"
              >
                <Card>
                  <CardContent className="p-6">
                    <Badge variant="secondary" className="mb-3 text-xs">Business Ops</Badge>
                    <h3 className="font-semibold mb-2">TradeFlowKit</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      Leads, quotes, jobs, invoices, and follow-ups in one revenue pipeline. Pair with Tech Deck for IT shops that need both technical ops and business flow.
                    </p>
                    <span className="text-xs text-primary inline-flex items-center gap-1">
                      tradeflowkit.com <ArrowRight className="w-3 h-3" />
                    </span>
                  </CardContent>
                </Card>
              </a>
              <a
                href="https://faultlinelab.com"
                target="_blank"
                rel="noreferrer"
                className="block hover-elevate rounded-lg"
                data-testid="link-ecosystem-faultlinelab"
              >
                <Card>
                  <CardContent className="p-6">
                    <Badge variant="secondary" className="mb-3 text-xs">Diagnostic Training</Badge>
                    <h3 className="font-semibold mb-2">FaultlineLab</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      Diagnostic challenges, fault analysis, and high-pressure technical scenarios. Sharpen the troubleshooting muscle your bench techs use every day.
                    </p>
                    <span className="text-xs text-primary inline-flex items-center gap-1">
                      faultlinelab.com <ArrowRight className="w-3 h-3" />
                    </span>
                  </CardContent>
                </Card>
              </a>
              <a
                href="https://shotgunninjas.com"
                target="_blank"
                rel="noreferrer"
                className="block hover-elevate rounded-lg"
                data-testid="link-ecosystem-shotgunninjas"
              >
                <Card>
                  <CardContent className="p-6">
                    <Badge variant="secondary" className="mb-3 text-xs">Ecosystem Hub</Badge>
                    <h3 className="font-semibold mb-2">ShotgunNinjas.com</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      The full Shotgun Ninjas Productions catalog — software, security, creator tools, music, and experimental tech under one roof.
                    </p>
                    <span className="text-xs text-primary inline-flex items-center gap-1">
                      shotgunninjas.com <ArrowRight className="w-3 h-3" />
                    </span>
                  </CardContent>
                </Card>
              </a>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 px-6 bg-gradient-to-b from-card/40 to-background border-t">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-3">
              Stop juggling tools. Start owning the stack.
            </h2>
            <p className="text-muted-foreground mb-6">
              Launch Tech Deck from OperatorOS so the right plan, role, and modules are already in place.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild data-testid="button-final-cta-register">
                <a href={OPERATOROS_URL}>
                  Launch from OperatorOS
                  <ArrowRight className="w-4 h-4 ml-1" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-final-cta-pricing">
                <a href={REQUEST_ACCESS_URL}>Request Access</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              OperatorOS manages billing and access &middot; Tech Deck enforces the synced snapshot
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <img
                src={logoImage}
                alt="Tech Deck"
                className="w-6 h-6 rounded object-cover"
              />
              <span className="font-semibold text-sm">Tech Deck</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">&middot; IT operations cockpit for MSPs</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <a href="#features" className="hover:text-foreground transition-colors" data-testid="link-footer-features">Features</a>
              <a href={OPERATOROS_BILLING_URL} className="hover:text-foreground transition-colors" data-testid="link-footer-pricing">OperatorOS Billing</a>
              <a href="#faq" className="hover:text-foreground transition-colors" data-testid="link-footer-faq">FAQ</a>
              <a href={OPERATOROS_URL} className="hover:text-foreground transition-colors" data-testid="link-footer-login">Launch from OperatorOS</a>
              <a href={REQUEST_ACCESS_URL} className="hover:text-foreground transition-colors" data-testid="link-footer-register">Request Access</a>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t text-xs text-muted-foreground">
            <span>
              &copy; {new Date().getFullYear()} Tech Deck &middot; Built by{" "}
              <a href="https://shotgunninjas.com" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors" data-testid="link-footer-snp">
                Shotgun Ninjas Productions
              </a>
            </span>
            <div className="flex items-center gap-3">
              <a href={OPERATOROS_BILLING_URL} className="hover:text-foreground transition-colors" data-testid="link-footer-pricing-page">OperatorOS Billing</a>
              <a href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a>
              <a href="/terms" className="hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms</a>
              <a href="/refund" className="hover:text-foreground transition-colors" data-testid="link-footer-refund">Refunds</a>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
<a href="/delete-account" className="hover:text-foreground transition-colors" data-testid="link-footer-delete">Delete Account</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
