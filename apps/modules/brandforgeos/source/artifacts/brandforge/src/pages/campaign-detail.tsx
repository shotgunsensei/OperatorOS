import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGetCampaign, useUpdateCampaign, useListCopyAssets, getGetCampaignQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import {
  ArrowLeft, LayoutDashboard, Target, PenTool, Calendar, MessageSquare,
  CheckSquare, Save, BarChart3,
} from "lucide-react";
import { Link } from "wouter";

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-500",
};

export default function CampaignDetail({ campaignId }: { campaignId: number }) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: campaign, isLoading } = useGetCampaign(tenantId!, campaignId, { query: { enabled: !!tenantId } });
  const { data: copyAssets } = useListCopyAssets(tenantId!, { campaignId }, { query: { enabled: !!tenantId } });
  const updateCampaign = useUpdateCampaign();
  const [form, setForm] = useState<any>({});
  const [checklist, setChecklist] = useState([
    { id: 1, text: "Define target audience", done: false },
    { id: 2, text: "Write core messaging", done: false },
    { id: 3, text: "Create ad copy variants", done: false },
    { id: 4, text: "Set up tracking/analytics", done: false },
    { id: 5, text: "Schedule content calendar", done: false },
    { id: 6, text: "Get stakeholder approval", done: false },
    { id: 7, text: "Launch campaign", done: false },
  ]);

  useEffect(() => {
    if (campaign) setForm({
      name: campaign.name, objective: campaign.objective || "", status: campaign.status,
      targetAudience: campaign.targetAudience || "", coreMessage: campaign.coreMessage || "",
      offer: campaign.offer || "", notes: campaign.notes || "", budget: campaign.budget || "",
      startDate: campaign.startDate || "", endDate: campaign.endDate || "",
    });
  }, [campaign]);

  const handleSave = () => {
    if (!tenantId) return;
    updateCampaign.mutate(
      { tenantId, campaignId, data: form },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCampaignQueryKey(tenantId, campaignId) }) }
    );
  };

  if (isLoading) return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-12 bg-muted rounded w-64" />
          <div className="grid grid-cols-2 gap-6">{[1,2].map(i => <div key={i} className="h-64 bg-muted rounded-xl" />)}</div>
        </div>
      </div>
    </AppLayout>
  );

  const completedCount = checklist.filter(c => c.done).length;
  const progress = Math.round((completedCount / checklist.length) * 100);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/campaigns">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{campaign?.name}</h1>
              <p className="text-muted-foreground text-sm">Campaign details and management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={form.status || "draft"} onValueChange={v => setForm({...form, status: v})}>
              <SelectTrigger className="w-32 h-8 text-xs rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleSave} disabled={updateCampaign.isPending} className="rounded-full">
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview" className="text-xs"><LayoutDashboard className="h-3.5 w-3.5 mr-1.5" /> Overview</TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs"><Target className="h-3.5 w-3.5 mr-1.5" /> Strategy</TabsTrigger>
            <TabsTrigger value="copy" className="text-xs"><PenTool className="h-3.5 w-3.5 mr-1.5" /> Copy</TabsTrigger>
            <TabsTrigger value="checklist" className="text-xs"><CheckSquare className="h-3.5 w-3.5 mr-1.5" /> Checklist</TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-5 pb-4">
                  <div className="text-xs text-muted-foreground font-medium mb-1">Status</div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColors[form.status] || ""}`}>{form.status}</span>
                </CardContent>
              </Card>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-5 pb-4">
                  <div className="text-xs text-muted-foreground font-medium mb-1">Timeline</div>
                  <div className="text-sm font-medium">{form.startDate || "Not set"} — {form.endDate || "Ongoing"}</div>
                </CardContent>
              </Card>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-5 pb-4">
                  <div className="text-xs text-muted-foreground font-medium mb-1">Progress</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs font-medium">{progress}%</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Campaign Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label className="text-xs">Name</Label><Input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} className="mt-1" /></div>
                  <div><Label className="text-xs">Objective</Label><Textarea value={form.objective || ""} onChange={e => setForm({...form, objective: e.target.value})} rows={3} className="mt-1" /></div>
                  <div><Label className="text-xs">Core Message</Label><Input value={form.coreMessage || ""} onChange={e => setForm({...form, coreMessage: e.target.value})} className="mt-1" /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Schedule & Budget</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Start Date</Label><Input type="date" value={form.startDate || ""} onChange={e => setForm({...form, startDate: e.target.value})} className="mt-1" /></div>
                    <div><Label className="text-xs">End Date</Label><Input type="date" value={form.endDate || ""} onChange={e => setForm({...form, endDate: e.target.value})} className="mt-1" /></div>
                  </div>
                  <div><Label className="text-xs">Budget</Label><Input value={form.budget || ""} onChange={e => setForm({...form, budget: e.target.value})} placeholder="$5,000" className="mt-1" /></div>
                  <div><Label className="text-xs">Notes</Label><Textarea value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} rows={3} className="mt-1" /></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="strategy" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Target Audience</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={form.targetAudience || ""} onChange={e => setForm({...form, targetAudience: e.target.value})} rows={4} placeholder="Describe your target audience..." />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Offer</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={form.offer || ""} onChange={e => setForm({...form, offer: e.target.value})} rows={4} placeholder="What's the offer?" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="copy" className="mt-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Copy Assets</CardTitle>
                  <Button variant="outline" size="sm" className="rounded-full" asChild>
                    <Link href="/copy-studio"><PenTool className="h-3.5 w-3.5 mr-1.5" /> Copy Studio</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!copyAssets || copyAssets.length === 0 ? (
                  <div className="py-8 text-center">
                    <PenTool className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mb-3">No copy assets linked to this campaign</p>
                    <Button size="sm" variant="outline" asChild className="rounded-full">
                      <Link href="/copy-studio">Create in Copy Studio</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {copyAssets.map(asset => (
                      <div key={asset.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{asset.title}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-[10px] capitalize">{asset.copyType?.replace(/_/g, " ")}</Badge>
                            {asset.channel && <Badge variant="outline" className="text-[10px] capitalize">{asset.channel}</Badge>}
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize text-[10px] shrink-0">{asset.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="mt-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Campaign Checklist</CardTitle>
                  <Badge variant="secondary" className="text-xs">{completedCount}/{checklist.length} done</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  {checklist.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${item.done ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/30"}`}>
                        {item.done && <CheckSquare className="h-3 w-3" />}
                      </div>
                      <span className={`text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.text}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Campaign Analytics</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Impressions", value: "12.4K" },
                    { label: "Clicks", value: "891" },
                    { label: "CTR", value: "7.2%" },
                    { label: "Conversions", value: "47" },
                  ].map(m => (
                    <div key={m.label} className="p-4 bg-muted/30 rounded-xl text-center">
                      <div className="text-2xl font-bold">{m.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground text-center">Connect your ad platforms to see real performance data</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
