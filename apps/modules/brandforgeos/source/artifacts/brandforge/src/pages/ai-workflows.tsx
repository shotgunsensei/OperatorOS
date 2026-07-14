import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGenerateAiStrategy } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Workflow, Rocket, Calendar, Megaphone, Target, Mail,
  RefreshCw, Sparkles, ArrowRight, CheckCircle2, ChevronLeft,
  Lightbulb, Zap, PenTool,
} from "lucide-react";

const workflows = [
  { id: "product_launch", name: "Launch a New Product", desc: "Generate messaging, ad copy, email sequences, and social content for a product launch", icon: Rocket, color: "bg-blue-500/10 text-blue-500", steps: 5 },
  { id: "content_plan", name: "30-Day Content Plan", desc: "Create a full month of content ideas, copy, and calendar entries across your channels", icon: Calendar, color: "bg-green-500/10 text-green-500", steps: 4 },
  { id: "ad_campaign", name: "Paid Ad Campaign", desc: "Generate ad angles, copy variants, audience targeting, and landing page copy", icon: Megaphone, color: "bg-orange-500/10 text-orange-500", steps: 4 },
  { id: "lead_gen", name: "Lead Gen Campaign", desc: "Build a complete lead generation funnel with landing page, emails, and ads", icon: Target, color: "bg-purple-500/10 text-purple-500", steps: 5 },
  { id: "email_sequence", name: "Email Nurture Sequence", desc: "Create a multi-email drip campaign for lead nurturing or onboarding", icon: Mail, color: "bg-pink-500/10 text-pink-500", steps: 3 },
  { id: "refresh_messaging", name: "Refresh Weak Messaging", desc: "Analyze and improve existing copy with stronger hooks, clearer CTAs, and better positioning", icon: RefreshCw, color: "bg-amber-500/10 text-amber-500", steps: 3 },
];

const workflowInputs: Record<string, { label: string; placeholder: string; type: "text" | "textarea" }[]> = {
  product_launch: [
    { label: "Product Name", placeholder: "What are you launching?", type: "text" },
    { label: "Key Features & Benefits", placeholder: "What makes this product special?", type: "textarea" },
    { label: "Target Audience", placeholder: "Who is this for?", type: "text" },
    { label: "Price Point", placeholder: "$49/mo, Free trial, etc.", type: "text" },
    { label: "Launch Date", placeholder: "When are you launching?", type: "text" },
  ],
  content_plan: [
    { label: "Business/Product", placeholder: "What business or product is this for?", type: "text" },
    { label: "Target Audience", placeholder: "Who are you creating content for?", type: "text" },
    { label: "Active Channels", placeholder: "Instagram, LinkedIn, Blog, Email...", type: "text" },
    { label: "Content Goals", placeholder: "Brand awareness, lead gen, thought leadership...", type: "text" },
  ],
  ad_campaign: [
    { label: "Product/Offer", placeholder: "What are you advertising?", type: "text" },
    { label: "Target Audience", placeholder: "Who should see these ads?", type: "text" },
    { label: "Budget Range", placeholder: "$500-$2,000/month", type: "text" },
    { label: "Ad Platforms", placeholder: "Google, Meta, LinkedIn...", type: "text" },
  ],
  lead_gen: [
    { label: "Service/Product", placeholder: "What are you selling?", type: "text" },
    { label: "Ideal Customer", placeholder: "Describe your ideal lead", type: "textarea" },
    { label: "Lead Magnet Idea", placeholder: "Free guide, webinar, consultation...", type: "text" },
    { label: "Geographic Focus", placeholder: "Local, national, global...", type: "text" },
  ],
  email_sequence: [
    { label: "Sequence Purpose", placeholder: "Onboarding, nurture, re-engagement...", type: "text" },
    { label: "Audience", placeholder: "Who will receive these emails?", type: "text" },
    { label: "Number of Emails", placeholder: "5-7 emails over 2 weeks", type: "text" },
  ],
  refresh_messaging: [
    { label: "Current Copy", placeholder: "Paste your existing copy here...", type: "textarea" },
    { label: "What's Not Working", placeholder: "Low conversions, unclear value prop...", type: "text" },
    { label: "Desired Outcome", placeholder: "Higher CTR, more sign-ups...", type: "text" },
  ],
};

export default function AIWorkflows() {
  const { tenantId } = useTenant();
  const generateStrategy = useGenerateAiStrategy();
  const [selectedWorkflow, setSelectedWorkflow] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const workflow = workflows.find(w => w.id === selectedWorkflow);
  const fields = selectedWorkflow ? workflowInputs[selectedWorkflow] || [] : [];

  const handleRun = () => {
    if (!tenantId || !selectedWorkflow) return;
    setGenerating(true);
    const context = Object.entries(inputs).map(([k, v]) => `${k}: ${v}`).join("\n");
    generateStrategy.mutate(
      { tenantId, data: { strategyType: selectedWorkflow, context } },
      {
        onSuccess: (data) => {
          setResult(data);
          setCurrentStep(2);
          setGenerating(false);
        },
        onError: () => setGenerating(false),
      }
    );
  };

  const handleBack = () => {
    if (currentStep === 0) {
      setSelectedWorkflow(null);
      setInputs({});
      setResult(null);
    } else {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Workflows</h1>
            <p className="text-muted-foreground text-sm">Guided AI workflows for common marketing tasks</p>
          </div>
        </div>

        {!selectedWorkflow ? (
          <>
            <div className="text-center max-w-xl mx-auto mb-8">
              <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center text-white mx-auto mb-4">
                <Workflow className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold mb-2">What do you want to create?</h2>
              <p className="text-sm text-muted-foreground">Choose a workflow and we'll guide you through it step by step, generating connected outputs based on your brand context.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {workflows.map(w => (
                <button
                  key={w.id}
                  onClick={() => { setSelectedWorkflow(w.id); setCurrentStep(0); setResult(null); setInputs({}); }}
                  className="p-5 rounded-xl border text-left hover:border-primary/30 hover:shadow-md transition-all group"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${w.color} group-hover:scale-105 transition-transform`}>
                    <w.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-sm mb-1">{w.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{w.desc}</p>
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-muted-foreground">
                    <Zap className="h-3 w-3" />
                    {w.steps} steps
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="max-w-3xl mx-auto">
            <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 rounded-full">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> {currentStep === 0 ? "All Workflows" : "Back"}
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${workflow?.color}`}>
                    {workflow && <workflow.icon className="h-5 w-5" />}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{workflow?.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{workflow?.desc}</p>
                  </div>
                </div>
                <div className="flex gap-1 mt-4">
                  {["Input", "Generate", "Results"].map((label, i) => (
                    <div key={label} className="flex-1">
                      <div className={`h-1.5 rounded-full mb-1 ${i <= currentStep ? "bg-primary" : "bg-muted"}`} />
                      <div className={`text-[10px] font-medium ${i <= currentStep ? "text-primary" : "text-muted-foreground"}`}>{label}</div>
                    </div>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {currentStep === 0 && (
                  <div className="space-y-4">
                    {fields.map(field => (
                      <div key={field.label}>
                        <Label className="text-sm">{field.label}</Label>
                        {field.type === "textarea" ? (
                          <Textarea
                            value={inputs[field.label] || ""}
                            onChange={e => setInputs({...inputs, [field.label]: e.target.value})}
                            placeholder={field.placeholder}
                            rows={3}
                            className="mt-1"
                          />
                        ) : (
                          <Input
                            value={inputs[field.label] || ""}
                            onChange={e => setInputs({...inputs, [field.label]: e.target.value})}
                            placeholder={field.placeholder}
                            className="mt-1"
                          />
                        )}
                      </div>
                    ))}
                    <Button onClick={() => { setCurrentStep(1); handleRun(); }} className="w-full rounded-full" disabled={Object.keys(inputs).length === 0}>
                      <Sparkles className="h-4 w-4 mr-2" /> Generate
                    </Button>
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center text-white mx-auto mb-4 animate-pulse">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Generating your {workflow?.name}...</h3>
                    <p className="text-sm text-muted-foreground">This usually takes 10-20 seconds</p>
                  </div>
                )}

                {currentStep === 2 && result && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800/50">
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Workflow completed successfully</span>
                    </div>

                    <div>
                      <h3 className="font-bold text-lg mb-3">{result.title}</h3>
                      <div className="prose prose-sm max-w-none text-foreground">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{result.content}</div>
                      </div>
                    </div>

                    {result.suggestions?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Recommended Next Steps</h4>
                        {result.suggestions.map((s: string, i: number) => (
                          <div key={i} className="flex items-start gap-2.5 p-3 bg-muted/30 rounded-lg">
                            <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</div>
                            <span className="text-sm">{s}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setSelectedWorkflow(null); setInputs({}); setResult(null); setCurrentStep(0); }} className="rounded-full">
                        New Workflow
                      </Button>
                      <Button variant="outline" onClick={() => { setCurrentStep(0); setResult(null); }} className="rounded-full">
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
