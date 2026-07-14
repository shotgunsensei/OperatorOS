import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useTemplates, useUseTemplate } from "@/lib/api-hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Link } from "wouter";
import {
  Search, Sparkles, Lock, Star, Eye, Copy, ArrowRight,
  Megaphone, PenTool, Globe, Mail, Calendar, Palette, Package, Filter
} from "lucide-react";

const typeIcons: Record<string, any> = {
  campaign: Megaphone, copy_pack: PenTool, landing_page: Globe, email_sequence: Mail,
  content_calendar: Calendar, brand_kit: Palette, design_pack: Package,
};

const categoryLabels: Record<string, string> = {
  all: "All", campaign: "Campaigns", copy: "Copy Packs", landing_page: "Landing Pages",
  email: "Email", social: "Social", brand: "Brand Kits", design: "Design",
};


export default function TemplatesPage() {
  const { tenantId } = useTenant();
  const { data: apiTemplates } = useTemplates(tenantId);
  const useTemplateMutation = useUseTemplate(tenantId);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showPremiumOnly, setShowPremiumOnly] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const allTemplates = apiTemplates || [];
  const categories = allTemplates.length > 0 ? ["all", ...Array.from(new Set(allTemplates.map((t: any) => t.category)))] : ["all"];

  const filtered = allTemplates.filter((t: any) => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (showPremiumOnly && !t.isPremium) return false;
    return true;
  });

  const featured = allTemplates.filter((t: any) => t.isFeatured);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Template Marketplace</h1>
            <p className="text-muted-foreground text-sm">Ready-to-use marketing templates for every channel</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Package className="h-3 w-3 mr-1" />
            {allTemplates.length} templates
          </Badge>
        </div>

        {allTemplates.length > 0 && featured.length > 0 && categoryFilter === "all" && !search && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Star className="h-4 w-4 text-yellow-500" /> Featured Templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {featured.slice(0, 3).map((t: any) => (
                <Card key={t.id} className="group hover:shadow-md transition-all border-yellow-200/50 dark:border-yellow-800/30 bg-gradient-to-br from-yellow-50/50 to-transparent dark:from-yellow-900/10">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                        {(() => { const Icon = typeIcons[t.templateType] || Sparkles; return <Icon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />; })()}
                      </div>
                      <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Star className="h-2.5 w-2.5 mr-0.5 fill-current" /> Featured
                      </Badge>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{t.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      {t.usageCount > 0 && <span className="text-[10px] text-muted-foreground">{t.usageCount.toLocaleString()} uses</span>}
                      <Button size="sm" className="rounded-full text-xs h-7" onClick={() => setSelectedTemplate(t)}>
                        Use Template <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {allTemplates.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <Button key={cat} variant={categoryFilter === cat ? "default" : "outline"} size="sm" className="rounded-full text-xs" onClick={() => setCategoryFilter(cat)}>
                  {categoryLabels[cat]}
                </Button>
              ))}
            </div>
          </div>
        )}

        {allTemplates.length === 0 && !search && categoryFilter === "all" ? (
          <div className="text-center py-16">
            <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-sm mb-1">No templates available yet</p>
            <p className="text-xs text-muted-foreground mb-4">Templates will be added here as they become available. You can also create your own from any campaign or copy asset.</p>
            <Button variant="outline" size="sm" className="rounded-full" asChild>
              <Link href="/campaigns">Browse Campaigns <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-sm mb-1">No templates match your filters</p>
            <p className="text-xs text-muted-foreground mb-4">Try a different search term or category.</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSearch(""); setCategoryFilter("all"); setShowPremiumOnly(false); }}>
              Clear Filters
            </Button>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t: any) => (
            <Card key={t.id} className={`group hover:shadow-md transition-all ${t.isPremium ? "border-purple-200/50 dark:border-purple-800/30" : ""}`}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.isPremium ? "bg-purple-100 dark:bg-purple-900/30" : "bg-muted"}`}>
                    {(() => { const Icon = typeIcons[t.templateType] || Sparkles; return <Icon className={`h-5 w-5 ${t.isPremium ? "text-purple-600 dark:text-purple-400" : "text-primary"}`} />; })()}
                  </div>
                  <div className="flex gap-1">
                    {t.isPremium && (
                      <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        <Lock className="h-2.5 w-2.5 mr-0.5" /> Premium
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                </div>
                {t.tags && t.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {t.tags.slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  {t.usageCount > 0 && <span className="text-[10px] text-muted-foreground">{t.usageCount.toLocaleString()} uses</span>}
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" className="rounded-full text-xs h-7" onClick={() => setSelectedTemplate(t)}>
                      <Eye className="h-3 w-3 mr-1" /> Preview
                    </Button>
                    <Button size="sm" className="rounded-full text-xs h-7" onClick={() => { if (t.id) useTemplateMutation.mutate(t.id); }}>
                      <Copy className="h-3 w-3 mr-1" /> Use
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}

        {selectedTemplate && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedTemplate(null)}>
            <Card className="max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedTemplate.isPremium ? "bg-purple-100 dark:bg-purple-900/30" : "bg-muted"}`}>
                      {(() => { const Icon = typeIcons[selectedTemplate.templateType] || Sparkles; return <Icon className="h-6 w-6 text-primary" />; })()}
                    </div>
                    <div>
                      <h2 className="font-bold text-lg">{selectedTemplate.name}</h2>
                      <div className="flex gap-1 mt-1">
                        {selectedTemplate.isPremium && <Badge className="text-[10px] bg-purple-100 text-purple-700">Premium</Badge>}
                        {selectedTemplate.isFeatured && <Badge className="text-[10px] bg-yellow-100 text-yellow-700">Featured</Badge>}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>✕</Button>
                </div>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                {selectedTemplate.tags && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTemplate.tags.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium capitalize">{selectedTemplate.category}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">{selectedTemplate.templateType?.replace(/_/g, " ")}</span>
                  </div>
                  {selectedTemplate.usageCount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Used by</span>
                      <span className="font-medium">{selectedTemplate.usageCount.toLocaleString()} teams</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 rounded-full" onClick={() => { if (selectedTemplate.id) useTemplateMutation.mutate(selectedTemplate.id); setSelectedTemplate(null); }}>
                    {selectedTemplate.isPremium ? <><Lock className="h-3.5 w-3.5 mr-1.5" /> Unlock & Use</> : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Use Template</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
