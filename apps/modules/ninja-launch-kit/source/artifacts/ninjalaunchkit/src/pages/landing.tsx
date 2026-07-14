import { Link } from "wouter";
import {
  ArrowRight, Zap, Target, Mail, Layout, Terminal, Shield, Rocket, CheckCircle2,
  Wrench, Hammer, Cpu, Heart, Music, Utensils, Scissors, Home, GraduationCap, CalendarDays,
  Quote, Star, Sparkles, Lock, ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const useCases = [
  { icon: Wrench, name: "Auto & Mechanical", example: "Brake-check lead funnel for a neighborhood shop" },
  { icon: Hammer, name: "Home Services", example: "Pre-summer pressure-wash booking blitz" },
  { icon: Cpu, name: "Tech & Cyber", example: "MSP audit campaign for 50-employee SMBs" },
  { icon: Heart, name: "Health & Fitness", example: "12-week transformation challenge launch" },
  { icon: Music, name: "Creative & Media", example: "EP release with pre-save + tour announce" },
  { icon: Utensils, name: "Food & Hospitality", example: "Tuesday-night chef's special promo" },
  { icon: Scissors, name: "Beauty & Personal", example: "Grand-opening week for a new barber chair" },
  { icon: Home, name: "Real Estate", example: "Open-house weekend lead-magnet flow" },
  { icon: GraduationCap, name: "Digital & Education", example: "Cohort-based course early-bird launch" },
  { icon: CalendarDays, name: "Events & Community", example: "Local festival sponsor + ticket drive" },
];

const planTeasers = [
  {
    name: "Free",
    price: "$0",
    sub: "Try it forever",
    features: ["2 launch kits/month", "TXT export", "1 visual brief (Facebook ad)", "Anonymous account, no card"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    sub: "For solo operators",
    features: [
      "Unlimited kits",
      "TXT / Markdown / JSON export",
      "All 9 visual creative briefs",
      "Email + SMS sequences, ad variants",
      "5 brand profiles",
    ],
    cta: "Go Pro",
    highlighted: true,
  },
  {
    name: "Agency",
    price: "$59",
    sub: "For client work",
    features: [
      "Everything in Pro",
      "Unlimited brand profiles",
      "White-label creative briefs",
      "Client workspaces & team access",
      "Commercial-use rights",
    ],
    cta: "Run an agency",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "Do I need to provide my own AI API keys?",
    a: "No. NinjaLaunchKit uses a tuned, deterministic content engine that runs server-side — no per-token charges, no API key required from you. Your output is consistent every time and ready to use as-is or paste into your favorite AI for further iteration.",
  },
  {
    q: "How long does it actually take to generate a kit?",
    a: "Under 60 seconds end-to-end. Fill out a short brief (business type, target customer, pain point, offer, tone), hit generate, and you'll get a complete launch campaign with landing copy, ad variants, a 5-day email sequence, social posts, SMS blasts, FAQ, QR flyer copy, visual creative briefs for 9 placements, and a step-by-step launch checklist.",
  },
  {
    q: "What's a 'visual creative brief' — does it generate the actual image?",
    a: "It generates a paste-ready brief you drop into Canva, Adobe Express, Figma, Midjourney, or any AI image tool. Every brief includes exact dimensions, composition, color palette in hex, headline copy, recommended tools, and 'do not' guardrails so the asset matches your launch.",
  },
  {
    q: "Can I use the output for client work?",
    a: "Yes — on the Agency plan. Agency adds white-label delivery notes to every creative brief, unlimited brand profiles, and explicit commercial-use rights. Pro is licensed for your own business.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. Free gives you 2 kits/month, TXT export, and the Facebook ad visual brief — enough to validate one campaign before upgrading. No credit card required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your account page — your plan stays active through the end of the billing period. No refunds for partial months.",
  },
];

const testimonials = [
  {
    name: "M. Reyes",
    role: "Owner, Mainline Auto Care",
    quote: "Generated my whole spring brake-check promo on a Tuesday afternoon. Booked 14 new inspections by Friday. The QR flyer copy alone was worth it.",
    rating: 5,
  },
  {
    name: "Priya K.",
    role: "Solo marketing consultant",
    quote: "I run launches for 6 retainer clients a month. NinjaLaunchKit cut my brief-to-deliverable time from 8 hours to about 30 minutes. The white-label briefs are gold.",
    rating: 5,
  },
  {
    name: "J. Holloway",
    role: "Cybersecurity MSP",
    quote: "Finally — marketing copy for IT/MSP that doesn't sound like a 2014 LinkedIn post. The audit-funnel kit converted a 12-seat client in week one.",
    rating: 5,
  },
];

function MockBrowser({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/80 backdrop-blur shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2 bg-muted/30">
        <div className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <div className="ml-3 flex-1 text-[10px] font-mono text-muted-foreground truncate">{label}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FaqItem({ q, a, index, defaultOpen }: { q: string; a: string; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const buttonId = `faq-button-${index}`;
  const panelId = `faq-panel-${index}`;
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
        onClick={() => setOpen((o) => !o)}
        data-testid={`faq-toggle-${index}`}
      >
        <span className="font-bold text-lg group-hover:text-primary transition-colors">{q}</span>
        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180 text-primary" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          data-testid={`faq-panel-${index}`}
        >
          <p className="text-muted-foreground leading-relaxed pb-5 pr-8">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-28 overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background pointer-events-none" />
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div className="w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-50" />
        </div>

        <div className="container relative z-10 px-4 md:px-6 max-w-6xl mx-auto">
          <div className="text-center space-y-8">
            <motion.div initial="hidden" animate="visible" variants={fadeIn}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                LAUNCH KIT GENERATOR // V 2.0
              </div>
              <h1 className="text-5xl md:text-7xl font-bold tracking-tighter uppercase leading-[1.05]" data-testid="hero-headline">
                Generate a full launch <br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                  campaign in minutes
                </span>
              </h1>
              <p className="mt-6 text-xl md:text-2xl text-muted-foreground font-mono max-w-3xl mx-auto leading-relaxed">
                Stop staring at blank pages. Turn a 60-second brief into landing copy, ads, emails, social posts,
                visual briefs, and a launch checklist — ready to ship today.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/signup" data-testid="hero-cta-primary" className="w-full sm:w-auto inline-flex h-14 items-center justify-center rounded-sm bg-primary px-8 text-sm font-bold tracking-wider text-primary-foreground shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                INITIALIZE DEPLOYMENT <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link href="/templates" data-testid="hero-cta-secondary" className="w-full sm:w-auto inline-flex h-14 items-center justify-center rounded-sm border border-border bg-card/50 px-8 text-sm font-bold tracking-wider text-foreground shadow transition-colors hover:bg-muted backdrop-blur">
                BROWSE 20 TEMPLATES
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="pt-6 text-xs font-mono text-muted-foreground uppercase flex items-center justify-center gap-6 flex-wrap"
            >
              <span className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-primary" /> No credit card</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-primary" /> 60-second setup</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-primary" /> Full ownership</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-primary" /> No AI keys needed</span>
            </motion.div>
          </div>

          {/* Mock product preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-16 grid md:grid-cols-3 gap-4 max-w-5xl mx-auto"
          >
            <MockBrowser label="ninjalaunchkit.com/builder">
              <div className="space-y-2 font-mono text-[10px]">
                <div className="text-primary">BUSINESS_TYPE</div>
                <div className="rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-foreground">Auto repair</div>
                <div className="text-primary mt-2">TARGET</div>
                <div className="rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-foreground">Drivers 25-65</div>
                <div className="text-primary mt-2">OFFER</div>
                <div className="rounded border border-border/50 bg-muted/20 px-2 py-1.5 text-foreground">$29 inspection</div>
                <div className="mt-3 rounded bg-primary/90 text-primary-foreground text-center py-1.5 font-bold">GENERATE →</div>
              </div>
            </MockBrowser>
            <MockBrowser label="kit-detail / hero section">
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground">HEADLINE</p>
                <p className="font-bold text-sm leading-tight">$29 Inspection. No Dealership Surprises.</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-2">CTA</p>
                <div className="inline-block px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] font-bold">Book inspection →</div>
                <p className="text-[10px] font-mono text-muted-foreground mt-3">SOCIAL_POSTS · 7 ready</p>
                <div className="text-[10px] text-foreground/80 leading-relaxed">"Cars over 5 years old skip 1 of every 4 brake checks. Don't be the 1. $29 today."</div>
              </div>
            </MockBrowser>
            <MockBrowser label="visual-promo / facebook ad">
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-primary">FB_AD_BRIEF · 1200×628</p>
                <div className="rounded border border-border/50 bg-muted/10 p-2 space-y-1 text-[10px] font-mono">
                  <div className="flex gap-2">
                    <span className="h-3 w-3 rounded" style={{ background: "#0F172A" }} />
                    <span className="h-3 w-3 rounded" style={{ background: "#F97316" }} />
                    <span className="h-3 w-3 rounded" style={{ background: "#E2E8F0" }} />
                    <span className="text-muted-foreground">PALETTE</span>
                  </div>
                  <p className="text-foreground/80">Stop the scroll for local drivers. Right 45%: bold headline overlay…</p>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground">+ 8 more creative briefs ready to copy</p>
              </div>
            </MockBrowser>
          </motion.div>
        </div>
      </section>

      {/* Pain Point Section */}
      <section className="py-24 border-b border-border/40 relative overflow-hidden">
        <div className="container px-4 md:px-6 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex px-3 py-1 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono font-bold">
                THE PROBLEM
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
                Launching takes weeks. <br />
                <span className="text-primary">You needed it shipped yesterday.</span>
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                You've got a great offer and zero hours to spare. The marketing tab stays open for 6 weeks while you
                cobble together landing copy, hire a freelancer for ads, ChatGPT a half-baked email sequence, and
                forget the social posts entirely. By the time it's "ready," the season has passed.
              </p>
              <ul className="space-y-3 pt-2 text-sm font-mono">
                <li className="flex items-start gap-3"><span className="text-destructive mt-0.5">✗</span> Hours wasted on blank-page paralysis</li>
                <li className="flex items-start gap-3"><span className="text-destructive mt-0.5">✗</span> Inconsistent voice across landing, ads, and email</li>
                <li className="flex items-start gap-3"><span className="text-destructive mt-0.5">✗</span> No system — every launch starts from scratch</li>
                <li className="flex items-start gap-3"><span className="text-destructive mt-0.5">✗</span> Designer back-and-forth on every Facebook ad image</li>
              </ul>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 space-y-3">
                <div className="inline-flex px-2 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono font-bold">THE FIX</div>
                <p className="text-2xl font-bold leading-tight">One brief in. One complete launch out.</p>
                <p className="text-muted-foreground">
                  NinjaLaunchKit gives you a system that runs once. Brief → kit → ship. Same voice across every
                  surface. Visual briefs ready for Canva or Midjourney. Done before lunch.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded border border-border/50 bg-card/50 p-4">
                  <div className="text-3xl font-bold text-primary">60s</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">FORM TIME</div>
                </div>
                <div className="rounded border border-border/50 bg-card/50 p-4">
                  <div className="text-3xl font-bold text-primary">9</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">VISUAL BRIEFS</div>
                </div>
                <div className="rounded border border-border/50 bg-card/50 p-4">
                  <div className="text-3xl font-bold text-primary">20+</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-1">NICHE TEMPLATES</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Payload */}
      <section className="py-24 border-b border-border/40 bg-card/20 relative">
        <div className="container px-4 md:px-6 max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
              THE PAYLOAD
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight uppercase">Everything to launch — generated instantly</h2>
            <p className="text-muted-foreground font-mono text-lg">One brief. Eight asset categories. Zero blank pages.</p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[
              { icon: Layout, title: "Landing Page Copy", desc: "Hero headline, subhead, value prop, offer stack, FAQ, CTA buttons — voice-matched and conversion-tested." },
              { icon: Target, title: "Ad Campaigns", desc: "Facebook & Instagram primary text, Google Search ad headlines + descriptions, with multiple variants on Pro." },
              { icon: Mail, title: "Email Sequence", desc: "5-day automated drip with subject lines, body copy, and clear CTAs — paste straight into your ESP." },
              { icon: Zap, title: "Social & SMS", desc: "Short-form posts, hooks, and SMS blasts engineered for thumb-stopping action — not the recycled-LinkedIn tone." },
              { icon: Sparkles, title: "Visual Promo Kit", desc: "9 paste-ready creative briefs (FB ad, IG square, IG story, hero, flyer, QR poster, logo, colors, fonts) for Canva/Midjourney/Figma." },
              { icon: Terminal, title: "FAQ + Objections", desc: "Anticipates the 6-8 objections your buyer is whispering — and answers them in your voice before they ask." },
              { icon: Rocket, title: "Launch Checklist", desc: "A step-by-step operational playbook so nothing slips between 'kit generated' and 'campaign live.'" },
              { icon: Shield, title: "QR Flyer Copy", desc: "Print-ready masthead, scan prompt, and benefit copy sized for hand-to-hand and door-drop." },
              { icon: Wrench, title: "20+ Niche Templates", desc: "One-click prefill for auto, home services, tech, health, food, beauty, real estate, courses, events, and more." },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeIn} className="relative group rounded-lg border border-border/50 bg-card p-6 hover:border-primary/50 transition-colors">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" />
                <feature.icon className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Use-case grid */}
      <section className="py-24 border-b border-border/40 relative overflow-hidden">
        <div className="absolute right-0 top-1/3 w-1/3 h-1/2 bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="container px-4 md:px-6 max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex px-3 py-1 rounded bg-secondary/50 border border-border text-xs font-mono font-bold">
              BUILT FOR THESE OPERATORS
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight uppercase">Use cases & niche templates</h2>
            <p className="text-muted-foreground font-mono text-lg">Real campaigns for real businesses. No SaaS-flavored fluff.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="use-case-grid">
            {useCases.map((u, i) => (
              <motion.div
                key={u.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="rounded-lg border border-border/50 bg-card/50 hover:border-primary/40 hover:bg-card transition-all p-5 group"
                data-testid={`use-case-${u.name.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              >
                <u.icon className="h-7 w-7 text-primary mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="font-bold text-sm mb-1.5">{u.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{u.example}</p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/templates" data-testid="use-case-browse-templates" className="inline-flex items-center gap-2 px-5 py-2.5 rounded border border-primary/30 text-primary text-sm font-mono font-bold hover:bg-primary/10 transition-colors">
              EXPLORE_ALL_TEMPLATES <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 border-b border-border/40 bg-card/20" id="pricing">
        <div className="container px-4 md:px-6 max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
              PRICING
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight uppercase">Pick your operational tier</h2>
            <p className="text-muted-foreground font-mono text-lg">Start free. Scale when it pays for itself.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6" data-testid="pricing-table">
            {planTeasers.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-lg p-7 flex flex-col ${
                  p.highlighted
                    ? "border-2 border-primary bg-primary/5 shadow-lg shadow-primary/20"
                    : "border border-border/50 bg-card/50"
                }`}
                data-testid={`pricing-card-${p.name.toLowerCase()}`}
              >
                {p.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full tracking-widest">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-2xl font-bold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{p.sub}</p>
                <div className="mt-5 mb-6">
                  <span className="text-5xl font-bold">{p.price}</span>
                  <span className="text-muted-foreground ml-1">/mo</span>
                </div>
                <ul className="space-y-3 text-sm flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.name === "Free" ? "/signup" : "/pricing"}
                  data-testid={`pricing-cta-${p.name.toLowerCase()}`}
                  className={`mt-7 inline-flex h-11 items-center justify-center rounded-sm px-5 text-sm font-bold tracking-wider transition-all ${
                    p.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                      : "border border-border bg-card hover:bg-muted"
                  }`}
                >
                  {p.cta.toUpperCase()}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-xs font-mono text-muted-foreground mt-8 flex items-center justify-center gap-2">
            <Lock className="h-3 w-3" /> Cancel anytime · Stripe-powered · No long-term contract
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-b border-border/40 relative overflow-hidden">
        <div className="absolute left-1/4 top-0 w-1/2 h-1/2 bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="container px-4 md:px-6 max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-14">
            <div className="inline-flex px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
              FIELD REPORTS
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight uppercase">What operators are saying</h2>
            <p className="text-muted-foreground font-mono text-sm">
              <em>(Placeholder testimonials — replace with real ones from your launch cohort.)</em>
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6" data-testid="testimonials">
            {testimonials.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-lg border border-border/50 bg-card/70 backdrop-blur p-6 flex flex-col"
                data-testid={`testimonial-${i}`}
              >
                <Quote className="h-7 w-7 text-primary/40 mb-3" />
                <p className="text-foreground/90 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                <div className="flex gap-0.5 mt-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-primary text-primary" />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/40">
                  <p className="font-bold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 border-b border-border/40 bg-card/20">
        <div className="container px-4 md:px-6 max-w-3xl mx-auto">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex px-3 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-bold">
              QUESTIONS
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight uppercase">Frequently asked</h2>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/40 backdrop-blur px-6" data-testid="faq-section">
            {faqs.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} index={i} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-32 relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div className="w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] opacity-50" />
        </div>
        <div className="container relative z-10 px-4 md:px-6 max-w-4xl mx-auto text-center space-y-8">
          <Shield className="h-16 w-16 text-primary mx-auto opacity-80" />
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight uppercase leading-tight">
            Ready to ship your <br className="hidden md:block" />
            <span className="text-primary">next launch this week?</span>
          </h2>
          <p className="text-xl text-muted-foreground font-mono">
            One brief in. One complete campaign out. Free to start, no card required.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup" data-testid="final-cta-primary" className="inline-flex h-14 items-center justify-center rounded-sm bg-primary px-10 text-base font-bold tracking-widest text-primary-foreground shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(220,38,38,0.6)]">
              START FREE <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link href="/pricing" data-testid="final-cta-secondary" className="inline-flex h-14 items-center justify-center rounded-sm border border-border bg-card/50 px-8 text-sm font-bold tracking-wider hover:bg-muted backdrop-blur">
              SEE PRICING
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
