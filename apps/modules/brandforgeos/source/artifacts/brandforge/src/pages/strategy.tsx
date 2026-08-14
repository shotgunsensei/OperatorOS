import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGenerateAiStrategy, useGenerateCampaignIdeas } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, Sparkles, Target, Megaphone } from "lucide-react";

const strategyTypes = ["positioning", "messaging", "content_strategy", "channel_strategy", "competitive_analysis", "value_proposition"];

export default function Strategy() {
  const { tenantId } = useTenant();
  const generateStrategy = useGenerateAiStrategy();
  const generateIdeas = useGenerateCampaignIdeas();
  const [strategyType, setStrategyType] = useState("positioning");
  const [context, setContext] = useState("");
  const [strategyResult, setStrategyResult] = useState<any>(null);
  const [ideaForm, setIdeaForm] = useState({ objective: "", audience: "", budget: "" });
  const [ideaResult, setIdeaResult] = useState<any>(null);

  const handleGenStrategy = () => {
    if (!tenantId) return;
    generateStrategy.mutate(
      { tenantId, data: { strategyType, context } },
      { onSuccess: (data) => setStrategyResult(data) }
    );
  };

  const handleGenIdeas = () => {
    if (!tenantId) return;
    generateIdeas.mutate(
      { tenantId, data: ideaForm },
      { onSuccess: (data) => setIdeaResult(data) }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Strategy Workspace</h1>
          <p className="text-muted-foreground text-sm">AI-powered strategic planning for your marketing</p>
        </div>

        <Tabs defaultValue="strategy">
          <TabsList>
            <TabsTrigger value="strategy"><Target className="h-4 w-4 mr-2" /> Strategy Generator</TabsTrigger>
            <TabsTrigger value="ideas"><Megaphone className="h-4 w-4 mr-2" /> Campaign Ideas</TabsTrigger>
          </TabsList>

          <TabsContent value="strategy" className="space-y-6 mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Generate Marketing Strategy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Strategy Type</Label>
                  <Select value={strategyType} onValueChange={setStrategyType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{strategyTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Context</Label><Textarea value={context} onChange={e => setContext(e.target.value)} rows={4} placeholder="Describe your business, target market, current challenges, and goals..." /></div>
                <Button onClick={handleGenStrategy} disabled={generateStrategy.isPending}>
                  {generateStrategy.isPending ? "Generating..." : "Generate Strategy"}
                  <Sparkles className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {strategyResult && (
              <Card>
                <CardHeader><CardTitle className="text-base">{strategyResult.title}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-sm max-w-none text-foreground">
                    <p className="whitespace-pre-wrap">{strategyResult.content}</p>
                  </div>
                  {strategyResult.suggestions?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Next Steps</h4>
                      <ul className="space-y-2">
                        {strategyResult.suggestions.map((s: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="ideas" className="space-y-6 mt-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Generate Campaign Ideas</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Objective</Label><Input value={ideaForm.objective} onChange={e => setIdeaForm({...ideaForm, objective: e.target.value})} placeholder="Increase brand awareness, drive sales..." /></div>
                <div><Label>Target Audience</Label><Input value={ideaForm.audience} onChange={e => setIdeaForm({...ideaForm, audience: e.target.value})} placeholder="Small business owners, millennials..." /></div>
                <div><Label>Budget Range</Label><Input value={ideaForm.budget} onChange={e => setIdeaForm({...ideaForm, budget: e.target.value})} placeholder="$1,000 - $5,000" /></div>
                <Button onClick={handleGenIdeas} disabled={generateIdeas.isPending}>
                  {generateIdeas.isPending ? "Generating..." : "Generate Ideas"}
                  <Lightbulb className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {ideaResult?.ideas?.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {ideaResult.ideas.map((idea: any, i: number) => (
                  <Card key={i}>
                    <CardHeader><CardTitle className="text-base">{idea.name}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm">{idea.description}</p>
                      <div><span className="text-xs text-muted-foreground font-medium">Objective:</span><p className="text-sm">{idea.objective}</p></div>
                      {idea.channels?.length > 0 && (
                        <div className="flex flex-wrap gap-1">{idea.channels.map((c: string) => <span key={c} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{c}</span>)}</div>
                      )}
                      {idea.estimatedBudget && <p className="text-xs text-muted-foreground">Budget: {idea.estimatedBudget}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
