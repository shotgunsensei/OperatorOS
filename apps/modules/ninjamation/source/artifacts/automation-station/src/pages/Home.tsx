import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Brain, Link2, Zap, Monitor, Package, Lock, Bot, ArrowRight, Layers, Cpu, Box, Vault } from "lucide-react";
import { Link } from "wouter";

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function NinjaLogo({ className = "w-20 h-20" }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <img
        src="/images/ninja-head.png"
        alt="Ninjamation"
        className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(220,38,38,0.3)]"
      />
    </div>
  );
}

function NodeGraph() {
  return (
    <div className="relative w-full h-80 lg:h-96">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" fill="none">
        <line x1="80" y1="60" x2="200" y2="150" stroke="hsl(210 100% 56% / 0.3)" strokeWidth="1.5" />
        <line x1="200" y1="150" x2="320" y2="80" stroke="hsl(210 100% 56% / 0.3)" strokeWidth="1.5" />
        <line x1="200" y1="150" x2="320" y2="220" stroke="hsl(0 85% 55% / 0.3)" strokeWidth="1.5" />
        <line x1="80" y1="240" x2="200" y2="150" stroke="hsl(210 100% 56% / 0.2)" strokeWidth="1.5" />
        <line x1="320" y1="80" x2="320" y2="220" stroke="hsl(210 100% 56% / 0.15)" strokeWidth="1" strokeDasharray="4 4" />
        {[
          { cx: 80, cy: 60, color: "primary", delay: 0 },
          { cx: 200, cy: 150, color: "ninja-red", delay: 0.2 },
          { cx: 320, cy: 80, color: "primary", delay: 0.4 },
          { cx: 320, cy: 220, color: "primary", delay: 0.6 },
          { cx: 80, cy: 240, color: "primary", delay: 0.8 },
        ].map((node, i) => (
          <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 + node.delay, duration: 0.4 }}>
            <circle cx={node.cx} cy={node.cy} r="20" fill={`hsl(var(--${node.color}) / 0.1)`} stroke={`hsl(var(--${node.color}) / 0.5)`} strokeWidth="1.5" />
            <circle cx={node.cx} cy={node.cy} r="6" fill={`hsl(var(--${node.color}))`}>
              <animate attributeName="r" values="5;7;5" dur="3s" repeatCount="indefinite" begin={`${node.delay}s`} />
              <animate attributeName="opacity" values="0.7;1;0.7" dur="3s" repeatCount="indefinite" begin={`${node.delay}s`} />
            </circle>
          </motion.g>
        ))}
        <motion.circle r="3" fill="hsl(var(--primary))" opacity="0.8" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
          <animateMotion dur="3s" repeatCount="indefinite" path="M80,60 L200,150 L320,80" />
        </motion.circle>
      </svg>
    </div>
  );
}

export default function Home() {
  const features = [
    { icon: <Brain className="w-7 h-7" />, title: "AI Agents", desc: "Build intelligent workflows that think and act. Auto-handle tickets, alerts, onboarding, responses." },
    { icon: <Link2 className="w-7 h-7" />, title: "Integrations", desc: "Connect APIs, RMM tools, Slack, email, scripts. Replace manual glue work." },
    { icon: <Zap className="w-7 h-7" />, title: "Execution Engine", desc: "Trigger-based, scheduled, or event-driven. Runs silently in the background." },
  ];

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    primary: { bg: "bg-primary/10", text: "text-primary", border: "border-primary/20" },
    "ninja-red": { bg: "bg-ninja-red/10", text: "text-ninja-red", border: "border-ninja-red/20" },
  };

  const useCases = [
    { icon: <Monitor className="w-6 h-6" />, title: "MSP Automation", desc: "Auto-resolve tickets. Alert, diagnose, fix, close loop.", color: "primary" },
    { icon: <Package className="w-6 h-6" />, title: "Business Ops", desc: "Lead intake, CRM, follow-up, reporting — all automated.", color: "primary" },
    { icon: <Lock className="w-6 h-6" />, title: "Security", desc: "Alert, isolate, notify, document. Instant response.", color: "ninja-red" },
    { icon: <Bot className="w-6 h-6" />, title: "AI Workflows", desc: "Prompt, analyze, decision, action. End-to-end AI pipelines.", color: "primary" },
  ];

  const stack = [
    { icon: <Layers className="w-6 h-6" />, title: "Ninjamation Core", desc: "Workflow engine", badge: null },
    { icon: <Cpu className="w-6 h-6" />, title: "Ninjamation Agents", desc: "AI-driven decision logic", badge: null },
    { icon: <Box className="w-6 h-6" />, title: "Ninjamation Packs", desc: "Prebuilt automation bundles", badge: "Popular" },
    { icon: <Vault className="w-6 h-6" />, title: "Ninjamation Vault", desc: "Marketplace for workflows", badge: "Coming Soon" },
  ];

  const pricing = [
    {
      name: "Starter", price: 10, features: ["Basic workflows", "Script library access", "Community support", "Limited executions"],
      cta: "Get Started", highlight: false,
    },
    {
      name: "Pro", price: 20, features: ["Unlimited workflows", "AI agents & generation", "All integrations", "Priority support", "Automation packs"],
      cta: "Go Pro", highlight: true,
    },
    {
      name: "Enterprise", price: 100, features: ["Multi-tenant support", "All automation packs", "White-label potential", "Dedicated support", "Custom integrations"],
      cta: "Contact Sales", highlight: false,
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-32 overflow-hidden circuit-pattern">
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
              <div className="flex items-center gap-4 mb-8">
                <NinjaLogo className="w-16 h-16" />
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-ninja-red/20 text-ninja-red/80 text-sm font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ninja-red opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-ninja-red"></span>
                  </span>
                  Platform is Live
                </div>
              </div>
              <h1 className="text-5xl md:text-7xl font-black font-display tracking-tight mb-6 leading-[1.05]">
                Automate Everything.<br />
                <span className="text-gradient">Control Anything.</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-xl mb-10 leading-relaxed">
                Ninjamation is your AI-powered command center for building, deploying, and scaling automation workflows across your business, clients, and systems.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/pricing" className="px-8 py-4 rounded-xl font-bold bg-ninja-red text-white red-glow red-glow-hover transition-all duration-300 hover:-translate-y-1 text-center text-lg flex items-center justify-center gap-2">
                  Launch Your First Automation <ArrowRight className="w-5 h-5" />
                </Link>
                <Link href="/library" className="px-8 py-4 rounded-xl font-semibold glass glass-hover text-foreground transition-all duration-300 hover:-translate-y-1 text-center text-lg">
                  View Live Demo
                </Link>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }} className="hidden lg:block">
              <NodeGraph />
            </motion.div>
          </div>
        </div>
      </section>

      {/* What It Does */}
      <Section className="py-24 bg-card/20" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black font-display mb-4">Stop Doing Work. <span className="text-gradient">Start Orchestrating It.</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((f, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15 }}
                className="glass p-8 rounded-2xl group hover:border-primary/30 transition-all duration-300"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 text-primary group-hover:bg-primary/20 transition-colors">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Why It Matters */}
      <Section className="py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-black font-display mb-6">
            This Isn't Automation...<br /><span className="text-gradient">It's Leverage.</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-12 text-left">
            {[
              "Replace hours of daily work with seconds",
              "Scale without hiring",
              "Standardize operations across clients",
              "Turn processes into products",
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="flex items-start gap-4 p-5 glass rounded-xl"
              >
                <div className="w-8 h-8 rounded-lg bg-ninja-red/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-ninja-red" />
                </div>
                <p className="text-lg font-medium">{item}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Use Cases */}
      <Section className="py-24 bg-card/20 circuit-pattern" id="use-cases">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black font-display mb-4">Real <span className="text-gradient">Use Cases</span></h2>
            <p className="text-xl text-muted-foreground">This is where you win.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((uc, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="glass p-6 rounded-2xl hover:border-primary/30 transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-xl ${colorMap[uc.color].bg} flex items-center justify-center mb-4 ${colorMap[uc.color].text} border ${colorMap[uc.color].border}`}>
                  {uc.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{uc.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{uc.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Product Stack */}
      <Section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black font-display mb-4">Build Once. <span className="text-gradient">Deploy Everywhere.</span></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stack.map((s, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="glass p-6 rounded-2xl relative overflow-hidden group hover:border-primary/30 transition-all"
              >
                {s.badge && (
                  <span className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    s.badge === "Coming Soon" ? "bg-muted text-muted-foreground" : "bg-ninja-red/20 text-ninja-red border border-ninja-red/20"
                  }`}>
                    {s.badge}
                  </span>
                )}
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary border border-primary/20">
                  {s.icon}
                </div>
                <h3 className="text-lg font-bold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Pricing Preview */}
      <Section className="py-24 bg-card/20" id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black font-display mb-4"><span className="text-gradient">Simple, Scalable</span> Pricing</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricing.map((p, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`glass p-8 rounded-3xl relative overflow-hidden flex flex-col ${
                  p.highlight ? "border-ninja-red/30 shadow-[0_0_40px_-10px_rgba(220,38,38,0.15)]" : ""
                }`}
              >
                {p.highlight && <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary to-ninja-red" />}
                <h3 className="text-2xl font-bold font-display mb-2">{p.name}</h3>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tight">${p.price}</span>
                  <span className="text-muted-foreground font-medium">/month</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {p.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span className="text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`w-full py-4 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 text-center ${
                    p.highlight
                      ? "bg-ninja-red hover:bg-red-600 text-white shadow-lg red-glow"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground neon-shadow"
                  }`}
                >
                  {p.cta} <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Final CTA */}
      <Section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black font-display mb-6">
            Your Systems Should <span className="text-gradient">Work For You.</span>
          </h2>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Stop wasting time on repetitive tasks. Start building automation that scales.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing" className="px-10 py-5 rounded-xl font-bold bg-ninja-red text-white red-glow red-glow-hover transition-all duration-300 hover:-translate-y-1 text-lg flex items-center justify-center gap-2">
              Start Automating Now <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/library" className="px-10 py-5 rounded-xl font-semibold glass glass-hover text-foreground transition-all duration-300 hover:-translate-y-1 text-lg">
              Try Demo Environment
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
