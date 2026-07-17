import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useListCampaigns, useCreateCampaign, useDeleteCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Megaphone, Trash2, LayoutGrid, List,
  Rocket, Gift, Mail, Users, TrendingUp, MapPin, FileText, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

const campaignTemplates = [
  { name: "Product Launch", icon: Rocket, desc: "Full launch with ads, email, and social", objective: "Launch new product with maximum awareness" },
  { name: "Lead Generation", icon: Users, desc: "Capture and nurture qualified leads", objective: "Generate qualified leads through targeted campaigns" },
  { name: "Seasonal Promo", icon: Gift, desc: "Time-limited promotional campaign", objective: "Drive seasonal sales with limited-time offers" },
  { name: "Email Drip", icon: Mail, desc: "Automated email nurture sequence", objective: "Nurture leads through automated email sequences" },
  { name: "Content Growth", icon: TrendingUp, desc: "Organic content marketing push", objective: "Grow organic reach through consistent content" },
  { name: "Local Service", icon: MapPin, desc: "Local market lead generation", objective: "Generate local leads for service businesses" },
];

export default function Campaigns() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: campaigns, isLoading } = useListCampaigns(tenantId!, {}, { query: { enabled: !!tenantId } });
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const [open, setOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [form, setForm] = useState({ name: "", objective: "", status: "draft", coreMessage: "" });

  const filtered = campaigns?.filter(c => statusFilter === "all" || c.status === statusFilter) || [];

  const handleCreate = () => {
    if (!tenantId || !form.name) return;
    createCampaign.mutate(
      { tenantId, data: form },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) }); setOpen(false); setForm({ name: "", objective: "", status: "draft", coreMessage: "" }); } }
    );
  };

  const handleCreateFromTemplate = (t: typeof campaignTemplates[0]) => {
    if (!tenantId) return;
    createCampaign.mutate(
      { tenantId, data: { name: t.name, objective: t.objective, status: "draft", coreMessage: "" } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) }); setTemplateOpen(false); } }
    );
  };

  const statusCounts = campaigns?.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
            <p className="text-muted-foreground text-sm">Plan, execute, and track your marketing campaigns</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> From Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Campaign Templates</DialogTitle></DialogHeader>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                  {campaignTemplates.map(t => (
                    <button
                      key={t.name}
                      onClick={() => handleCreateFromTemplate(t)}
                      className="p-4 rounded-xl border text-left hover:border-primary/30 hover:bg-muted/50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                        <t.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-sm font-medium">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full"><Plus className="h-3.5 w-3.5 mr-1.5" /> New Campaign</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Campaign Name</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Q1 Product Launch" /></div>
                  <div><Label>Objective</Label><Textarea value={form.objective} onChange={e => setForm({...form, objective: e.target.value})} placeholder="What's the goal?" /></div>
                  <div><Label>Core Message</Label><Input value={form.coreMessage} onChange={e => setForm({...form, coreMessage: e.target.value})} placeholder="The key message" /></div>
                  <Button onClick={handleCreate} disabled={!form.name} className="w-full rounded-full">Create Campaign</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {["all", "draft", "active", "paused", "completed"].map(s => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)} className="rounded-full text-xs h-7 capitalize">
                {s} {s !== "all" && statusCounts[s] ? `(${statusCounts[s]})` : s === "all" ? `(${campaigns?.length || 0})` : ""}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}><List className="h-3.5 w-3.5" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}><LayoutGrid className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">Start from scratch or use a template to launch your first marketing campaign.</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setTemplateOpen(true)} className="rounded-full"><FileText className="h-3.5 w-3.5 mr-1.5" /> From Template</Button>
                <Button onClick={() => setOpen(true)} className="rounded-full"><Plus className="h-3.5 w-3.5 mr-1.5" /> Create Campaign</Button>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filtered.map(campaign => (
              <Card key={campaign.id} className="group hover:shadow-sm transition-shadow">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <Link href={`/campaigns/${campaign.id}`}>
                      <h3 className="font-semibold text-sm hover:text-primary cursor-pointer flex items-center gap-1.5">
                        {campaign.name}
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h3>
                    </Link>
                    {campaign.objective && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{campaign.objective}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[campaign.status] || ""}`}>{campaign.status}</span>
                      {campaign.startDate && <span className="text-[10px] text-muted-foreground">{campaign.startDate} — {campaign.endDate || "Ongoing"}</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={() => tenantId && deleteCampaign.mutate({ tenantId, campaignId: campaign.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) }) })}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(campaign => (
              <Card key={campaign.id} className="group hover:shadow-md transition-all">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[campaign.status] || ""}`}>{campaign.status}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => tenantId && deleteCampaign.mutate({ tenantId, campaignId: campaign.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey(tenantId) }) })}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                  <Link href={`/campaigns/${campaign.id}`}>
                    <h3 className="font-semibold hover:text-primary cursor-pointer mb-1">{campaign.name}</h3>
                  </Link>
                  {campaign.objective && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{campaign.objective}</p>}
                  {campaign.startDate && <p className="text-[10px] text-muted-foreground">{campaign.startDate} — {campaign.endDate || "Ongoing"}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
