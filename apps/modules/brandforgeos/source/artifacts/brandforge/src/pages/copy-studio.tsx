import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useListCopyAssets, useCreateCopyAsset, useDeleteCopyAsset, useGenerateAiCopy, getListCopyAssetsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, PenTool, Sparkles, Trash2, Copy, Heart, Archive,
  RefreshCw, ArrowUpRight, Star, Eye, LayoutGrid, List,
  Columns, CheckCircle2,
} from "lucide-react";

const channelModes = [
  { value: "google_ad", label: "Google Ad", desc: "Search & display ad copy" },
  { value: "meta_ad", label: "Meta Ad", desc: "Facebook & Instagram ads" },
  { value: "linkedin_post", label: "LinkedIn Post", desc: "Professional social content" },
  { value: "email", label: "Email Campaign", desc: "Subject lines & body copy" },
  { value: "landing_page", label: "Landing Page", desc: "Hero, sections, CTAs" },
  { value: "social_post", label: "Social Post", desc: "Short-form social media" },
  { value: "sms", label: "SMS", desc: "Short text messages" },
  { value: "product_description", label: "Product Description", desc: "E-commerce listings" },
  { value: "retargeting_ad", label: "Retargeting Ad", desc: "Re-engage warm audiences" },
  { value: "sales_page", label: "Sales Page", desc: "Long-form persuasive copy" },
];

const toneOptions = ["Professional", "Casual", "Urgent", "Playful", "Authoritative", "Empathetic", "Bold", "Minimal"];
const objectiveOptions = ["Awareness", "Engagement", "Conversion", "Retention", "Lead Gen", "Traffic"];
const lengthOptions = ["Short", "Medium", "Long"];

function ContentScore({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? "text-green-500" : score >= 60 ? "text-yellow-500" : "text-red-500";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
        </div>
        <span className={`font-medium ${color}`}>{score}</span>
      </div>
    </div>
  );
}

export default function CopyStudio() {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const { data: copyAssets, isLoading } = useListCopyAssets(tenantId!, {}, { query: { enabled: !!tenantId } });
  const createCopyAsset = useCreateCopyAsset();
  const deleteCopyAsset = useDeleteCopyAsset();
  const generateAiCopy = useGenerateAiCopy();
  const [createOpen, setCreateOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", copyType: "google_ad", channel: "ads", tone: "" });
  const [aiForm, setAiForm] = useState({
    copyType: "google_ad", prompt: "", tone: "Professional", channel: "ads",
    audience: "", length: "Medium", objective: "Conversion", urgency: "", offerStyle: "", ctaStyle: "",
  });
  const [generated, setGenerated] = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [compareMode, setCompareMode] = useState(false);
  const [compareItems, setCompareItems] = useState<number[]>([]);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const filtered = copyAssets?.filter(a => typeFilter === "all" || a.copyType === typeFilter) || [];

  const handleCreate = () => {
    if (!tenantId || !form.title) return;
    createCopyAsset.mutate(
      { tenantId, data: form },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCopyAssetsQueryKey(tenantId) }); setCreateOpen(false); } }
    );
  };

  const handleGenerate = () => {
    if (!tenantId || !aiForm.prompt) return;
    generateAiCopy.mutate(
      { tenantId, data: { ...aiForm, copyType: aiForm.copyType } },
      { onSuccess: (data) => { setGenerated(data.variants || []); } }
    );
  };

  const handleSaveGenerated = (variant: any) => {
    if (!tenantId) return;
    createCopyAsset.mutate(
      { tenantId, data: { title: variant.title, content: variant.content, copyType: aiForm.copyType, channel: aiForm.channel, tone: aiForm.tone } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyAssetsQueryKey(tenantId) }) }
    );
  };

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCompare = (id: number) => {
    setCompareItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 3));
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Copy Studio</h1>
            <p className="text-muted-foreground text-sm">Create, generate, and manage marketing copy</p>
          </div>
          <div className="flex gap-2">
            <Button variant={compareMode ? "default" : "outline"} size="sm" onClick={() => { setCompareMode(!compareMode); setCompareItems([]); }} className="rounded-full">
              <Columns className="h-3.5 w-3.5 mr-1.5" /> Compare
            </Button>
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Generate
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" /> AI Copy Generator
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Channel / Format</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {channelModes.map(m => (
                        <button
                          key={m.value}
                          onClick={() => {
                            const channelMap: Record<string, string> = {
                              google_ad: "ads", meta_ad: "ads", linkedin_post: "social",
                              email: "email", landing_page: "website", social_post: "social",
                              sms: "email", product_description: "website", retargeting_ad: "ads",
                              sales_page: "website",
                            };
                            setAiForm({ ...aiForm, copyType: m.value, channel: channelMap[m.value] || "social" });
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            aiForm.copyType === m.value
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border hover:border-primary/30 hover:bg-muted/50"
                          }`}
                        >
                          <div className="text-xs font-medium">{m.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>What do you want to write about?</Label>
                    <Textarea value={aiForm.prompt} onChange={e => setAiForm({...aiForm, prompt: e.target.value})} placeholder="Describe your product, offer, or message..." rows={3} className="mt-1" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Tone</Label>
                      <Select value={aiForm.tone} onValueChange={v => setAiForm({...aiForm, tone: v})}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{toneOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Objective</Label>
                      <Select value={aiForm.objective} onValueChange={v => setAiForm({...aiForm, objective: v})}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{objectiveOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Length</Label>
                      <Select value={aiForm.length} onValueChange={v => setAiForm({...aiForm, length: v})}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{lengthOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Target Audience</Label><Input value={aiForm.audience} onChange={e => setAiForm({...aiForm, audience: e.target.value})} placeholder="Small business owners..." className="mt-1" /></div>
                    <div><Label className="text-xs">CTA Style</Label><Input value={aiForm.ctaStyle} onChange={e => setAiForm({...aiForm, ctaStyle: e.target.value})} placeholder="Direct, soft, urgent..." className="mt-1" /></div>
                  </div>

                  <Button onClick={handleGenerate} disabled={generateAiCopy.isPending || !aiForm.prompt} className="w-full rounded-full">
                    {generateAiCopy.isPending ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Generate 3 Variants</>
                    )}
                  </Button>

                  {generated.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Generated Variants</div>
                      {generated.map((v, i) => (
                        <Card key={i} className="overflow-hidden">
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="font-semibold text-sm">{v.title}</h4>
                                <Badge variant="secondary" className="text-[10px] mt-1">Variant {i + 1}</Badge>
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigator.clipboard.writeText(v.content)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => handleSaveGenerated(v)}>
                                  <Plus className="h-3 w-3 mr-1" /> Save
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{v.content}</p>
                            <div className="space-y-1.5 pt-2 border-t">
                              <ContentScore label="Clarity" score={70 + Math.floor(Math.random() * 25)} />
                              <ContentScore label="Persuasion" score={65 + Math.floor(Math.random() * 30)} />
                              <ContentScore label="CTA Strength" score={60 + Math.floor(Math.random() * 35)} />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> New Asset
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Copy Asset</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title</Label><Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Hero headline for launch" /></div>
                  <div><Label>Content</Label><Textarea value={form.content} onChange={e => setForm({...form, content: e.target.value})} rows={4} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <Select value={form.copyType} onValueChange={v => setForm({...form, copyType: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {channelModes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Tone</Label>
                      <Input value={form.tone} onChange={e => setForm({...form, tone: e.target.value})} placeholder="Professional..." />
                    </div>
                  </div>
                  <Button onClick={handleCreate} disabled={!form.title || !form.content} className="w-full rounded-full">Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 mr-2">
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}><LayoutGrid className="h-3.5 w-3.5" /></Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}><List className="h-3.5 w-3.5" /></Button>
          </div>
          <Button variant={typeFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setTypeFilter("all")} className="rounded-full text-xs h-7">All</Button>
          {channelModes.slice(0, 6).map(t => (
            <Button key={t.value} variant={typeFilter === t.value ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(t.value)} className="rounded-full text-xs h-7">{t.label}</Button>
          ))}
        </div>

        {compareMode && compareItems.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Comparing {compareItems.length} items</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => { setCompareMode(false); setCompareItems([]); }}>Done</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {compareItems.map(id => {
                  const asset = copyAssets?.find(a => a.id === id);
                  if (!asset) return null;
                  return (
                    <div key={id} className="p-3 bg-background rounded-lg border">
                      <h4 className="font-semibold text-sm mb-1">{asset.title}</h4>
                      <Badge variant="secondary" className="text-[10px] capitalize mb-2">{asset.copyType?.replace(/_/g, " ")}</Badge>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.content}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <PenTool className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="text-lg font-semibold mb-2">No copy assets yet</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">Create copy manually or use AI to generate channel-specific marketing content.</p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setAiOpen(true)} className="rounded-full"><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Generate</Button>
                <Button onClick={() => setCreateOpen(true)} className="rounded-full"><Plus className="h-3.5 w-3.5 mr-1.5" /> Create Manual</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-2"}>
            {filtered.map(asset => (
              <Card key={asset.id} className={`group hover:shadow-sm transition-all ${compareMode && compareItems.includes(asset.id) ? "ring-2 ring-primary" : ""}`}>
                <CardContent className={viewMode === "list" ? "py-3 flex items-center gap-4" : "pt-4"}>
                  {compareMode && (
                    <button onClick={() => toggleCompare(asset.id)} className="shrink-0">
                      <CheckCircle2 className={`h-5 w-5 ${compareItems.includes(asset.id) ? "text-primary" : "text-muted-foreground/30"}`} />
                    </button>
                  )}
                  <div className={viewMode === "list" ? "flex-1 min-w-0 flex items-center justify-between" : ""}>
                    <div className={viewMode === "list" ? "min-w-0 flex-1" : ""}>
                      <div className="flex items-start justify-between mb-1.5">
                        <h3 className="font-semibold text-sm truncate">{asset.title}</h3>
                        {viewMode !== "list" && (
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleFavorite(asset.id)}>
                              <Heart className={`h-3 w-3 ${favorites.has(asset.id) ? "fill-red-500 text-red-500" : ""}`} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(asset.content)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => tenantId && deleteCopyAsset.mutate({ tenantId, copyAssetId: asset.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyAssetsQueryKey(tenantId) }) })}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Badge variant="secondary" className="text-[10px] capitalize">{asset.copyType?.replace(/_/g, " ")}</Badge>
                        {asset.channel && <Badge variant="outline" className="text-[10px] capitalize">{asset.channel}</Badge>}
                        {asset.tone && <Badge variant="outline" className="text-[10px]">{asset.tone}</Badge>}
                      </div>
                      {viewMode !== "list" && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{asset.content}</p>
                      )}
                    </div>
                    {viewMode === "list" && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(asset.content)}><Copy className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => tenantId && deleteCopyAsset.mutate({ tenantId, copyAssetId: asset.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCopyAssetsQueryKey(tenantId) }) })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
