import { useState } from "react";
import { useTenant } from "@/lib/tenant-context";
import { useCreateTenant, useCompleteOnboarding, getListTenantsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronRight, ChevronLeft, Check, Building2, Users, Target,
  Palette, Rocket, Globe, Sparkles, ArrowRight,
} from "lucide-react";

const userTypes = [
  { value: "solo_founder", label: "Solo Founder", desc: "Building and marketing on your own", icon: "🚀" },
  { value: "small_business", label: "Small Business", desc: "Local or online business, small team", icon: "🏪" },
  { value: "agency", label: "Agency", desc: "Managing multiple client brands", icon: "🏢" },
  { value: "saas_startup", label: "SaaS / Startup", desc: "Tech product, growth-focused", icon: "💻" },
  { value: "local_service", label: "Local Service", desc: "Service-based, local market", icon: "📍" },
  { value: "ecommerce", label: "E-commerce", desc: "Online store, product-based", icon: "🛍️" },
];

const industries = [
  "Technology", "E-commerce", "Healthcare", "Finance", "Education", "Real Estate",
  "Food & Beverage", "Fitness", "Fashion", "Consulting", "Agency", "Legal",
  "Home Services", "Beauty & Wellness", "Travel", "Automotive", "Other",
];

const businessTypes = ["B2B", "B2C", "B2B2C", "D2C", "Marketplace", "SaaS"];

const goalOptions = [
  "Brand Awareness", "Lead Generation", "Sales Growth", "Customer Retention",
  "Content Marketing", "Social Media Growth", "SEO / Organic Traffic", "Paid Advertising",
  "Email Marketing", "Community Building",
];

const channelOptions = [
  "Instagram", "Twitter/X", "LinkedIn", "Facebook", "YouTube", "TikTok",
  "Email", "Blog", "Google Ads", "SEO", "Podcast", "Newsletter",
];

const maturityLevels = [
  { value: "just_starting", label: "Just Starting", desc: "No marketing in place yet" },
  { value: "early", label: "Early Stage", desc: "Some content, no real strategy" },
  { value: "growing", label: "Growing", desc: "Active marketing, looking to scale" },
  { value: "established", label: "Established", desc: "Mature marketing, optimizing" },
];

export default function Onboarding() {
  const { tenantId, setTenantId } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const createTenant = useCreateTenant();
  const completeOnboarding = useCompleteOnboarding();
  const [step, setStep] = useState(0);
  const [createdTenantId, setCreatedTenantId] = useState<number | null>(tenantId);
  const [form, setForm] = useState({
    businessName: "", website: "", industry: "", businessType: "", userType: "",
    products: "", idealCustomer: "", geoMarket: "", tone: "", competitors: "",
    goals: [] as string[], channels: [] as string[], brandColors: [] as string[],
    maturity: "", logo: "",
  });

  const toggleGoal = (g: string) => setForm(f => ({ ...f, goals: f.goals.includes(g) ? f.goals.filter(x => x !== g) : [...f.goals, g] }));
  const toggleChannel = (c: string) => setForm(f => ({ ...f, channels: f.channels.includes(c) ? f.channels.filter(x => x !== c) : [...f.channels, c] }));

  const handleCreateWorkspace = () => {
    if (!form.businessName) return;
    createTenant.mutate(
      { data: { name: form.businessName, industry: form.industry, businessType: form.businessType } },
      {
        onSuccess: (data) => {
          setCreatedTenantId(data.id);
          setTenantId(data.id);
          queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
          setStep(1);
        },
      }
    );
  };

  const handleComplete = () => {
    const tid = createdTenantId;
    if (!tid) return;
    completeOnboarding.mutate(
      { tenantId: tid, data: form },
      { onSuccess: () => setLocation("/dashboard") }
    );
  };

  const totalSteps = 6;
  const stepProgress = Math.round(((step + 1) / totalSteps) * 100);

  const stepIcons = [Building2, Users, Target, Palette, Globe, Rocket];
  const stepLabels = ["Business", "Type & Industry", "Audience", "Brand Voice", "Goals", "Finish"];

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:flex w-80 gradient-brand flex-col justify-between p-8 text-white">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-sm">B</div>
            <span className="font-bold text-lg">BrandForge</span>
          </div>
          <div className="space-y-6">
            {stepLabels.map((label, i) => {
              const Icon = stepIcons[i];
              const isActive = i === step;
              const isDone = i < step;
              return (
                <div key={i} className={`flex items-center gap-3 ${isActive ? "opacity-100" : isDone ? "opacity-70" : "opacity-40"}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDone ? "bg-white/30" : isActive ? "bg-white/20 ring-2 ring-white/50" : "bg-white/10"}`}>
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-sm text-white/60">
          Setup takes about 2 minutes. You can always update this later.
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center text-white font-bold text-sm">B</div>
            <span className="font-bold text-lg">BrandForge</span>
          </div>

          <div className="mb-6">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Step {step + 1} of {totalSteps}</span>
              <span>{stepProgress}% complete</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${stepProgress}%` }} />
            </div>
          </div>

          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Let's set up your workspace</h2>
                <p className="text-muted-foreground mt-1">Tell us about your business to get started.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label>Business Name *</Label>
                  <Input value={form.businessName} onChange={e => setForm({...form, businessName: e.target.value})} placeholder="Acme Corp" className="mt-1" />
                </div>
                <div>
                  <Label>Website (optional)</Label>
                  <Input value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://acme.com" className="mt-1" />
                </div>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={!form.businessName || createTenant.isPending}
                  className="w-full rounded-full h-11"
                >
                  {createTenant.isPending ? "Creating..." : "Create Workspace"}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">What type of business are you?</h2>
                <p className="text-muted-foreground mt-1">This helps us personalize your experience.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {userTypes.map(ut => (
                  <button
                    key={ut.value}
                    onClick={() => setForm({...form, userType: ut.value})}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      form.userType === ut.value ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="text-2xl mb-2">{ut.icon}</div>
                    <div className="text-sm font-medium">{ut.label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{ut.desc}</div>
                  </button>
                ))}
              </div>
              <div>
                <Label>Industry</Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                  {industries.map(i => (
                    <Button key={i} variant={form.industry === i ? "default" : "outline"} size="sm" onClick={() => setForm({...form, industry: i})} className="text-xs rounded-full">{i}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Business Model</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {businessTypes.map(t => (
                    <Button key={t} variant={form.businessType === t ? "default" : "outline"} size="sm" onClick={() => setForm({...form, businessType: t})} className="rounded-full">{t}</Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)} className="rounded-full"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(2)} className="rounded-full">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Who are your customers?</h2>
                <p className="text-muted-foreground mt-1">Help us understand your audience and offerings.</p>
              </div>
              <div className="space-y-4">
                <div><Label>Products / Services</Label><Textarea value={form.products} onChange={e => setForm({...form, products: e.target.value})} placeholder="Describe your main products or services..." rows={3} className="mt-1" /></div>
                <div><Label>Ideal Customer</Label><Textarea value={form.idealCustomer} onChange={e => setForm({...form, idealCustomer: e.target.value})} placeholder="Who is your ideal customer? Age, role, pain points..." rows={3} className="mt-1" /></div>
                <div><Label>Geographic Market</Label><Input value={form.geoMarket} onChange={e => setForm({...form, geoMarket: e.target.value})} placeholder="US, Global, Southeast Asia..." className="mt-1" /></div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="rounded-full"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(3)} className="rounded-full">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Define your brand voice</h2>
                <p className="text-muted-foreground mt-1">What should your brand sound like?</p>
              </div>
              <div className="space-y-4">
                <div><Label>Brand Tone & Voice</Label><Input value={form.tone} onChange={e => setForm({...form, tone: e.target.value})} placeholder="Professional yet approachable, authoritative, empathetic..." className="mt-1" /></div>
                <div><Label>Key Competitors</Label><Textarea value={form.competitors} onChange={e => setForm({...form, competitors: e.target.value})} placeholder="Who are your top 3 competitors? What makes you different?" rows={3} className="mt-1" /></div>
                <div>
                  <Label>Marketing Maturity</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {maturityLevels.map(m => (
                      <button
                        key={m.value}
                        onClick={() => setForm({...form, maturity: m.value})}
                        className={`p-3 rounded-xl border text-left transition-all ${form.maturity === m.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                      >
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} className="rounded-full"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(4)} className="rounded-full">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Goals & Channels</h2>
                <p className="text-muted-foreground mt-1">What are you trying to achieve and where?</p>
              </div>
              <div>
                <Label>Marketing Goals (select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {goalOptions.map(g => (
                    <Button key={g} variant={form.goals.includes(g) ? "default" : "outline"} size="sm" onClick={() => toggleGoal(g)} className="justify-start rounded-full text-xs">{g}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Active Channels (select all that apply)</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {channelOptions.map(c => (
                    <Button key={c} variant={form.channels.includes(c) ? "default" : "outline"} size="sm" onClick={() => toggleChannel(c)} className="rounded-full text-xs">{c}</Button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)} className="rounded-full"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(5)} className="rounded-full">Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 text-center py-8">
              <div className="w-20 h-20 rounded-2xl gradient-brand flex items-center justify-center mx-auto shadow-lg">
                <Sparkles className="h-9 w-9 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">You're all set!</h2>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Your workspace is ready. BrandForge will use your business context to generate personalized marketing strategies, copy, and campaign ideas.
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-4 max-w-md mx-auto text-left space-y-2">
                <div className="text-sm font-medium mb-2">What's next:</div>
                <div className="flex items-center gap-2 text-sm"><div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div> Create your first brand in Brand HQ</div>
                <div className="flex items-center gap-2 text-sm"><div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div> Generate AI copy in the Copy Studio</div>
                <div className="flex items-center gap-2 text-sm"><div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div> Launch your first campaign</div>
              </div>
              <Button onClick={handleComplete} disabled={completeOnboarding.isPending} size="lg" className="rounded-full px-10">
                Go to Dashboard <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
