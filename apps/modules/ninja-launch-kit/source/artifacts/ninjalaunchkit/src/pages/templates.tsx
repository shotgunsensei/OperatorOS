import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useListLaunchTemplates } from "@workspace/api-client-react";
import type { LaunchTemplateSummary } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Lock, Sparkles, Zap } from "lucide-react";

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  pro: { label: "Pro", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  agency: { label: "Agency", className: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
};

export default function TemplatesPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [activeTier, setActiveTier] = useState<string>("");

  const { data, isLoading } = useListLaunchTemplates({
    q: search || undefined,
    category: activeCategory || undefined,
    tier: (activeTier as "free" | "pro" | "agency" | undefined) || undefined,
  });

  const categories = data?.categories ?? [];
  const templates: LaunchTemplateSummary[] = useMemo(() => data?.templates ?? [], [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-7 w-7 text-primary" />
          Niche Launch Templates
        </h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">
          Pre-built launch kits for {templates.length || 20}+ niches — pick one and go
        </p>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="input-template-search"
              placeholder="Search templates by name, niche, audience…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeCategory === "" ? "default" : "outline"}
              onClick={() => setActiveCategory("")}
              data-testid="filter-category-all"
              className="font-mono text-xs"
            >
              ALL CATEGORIES
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={activeCategory === c ? "default" : "outline"}
                onClick={() => setActiveCategory(c)}
                data-testid={`filter-category-${c.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className="font-mono text-xs"
              >
                {c.toUpperCase()}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["", "free", "pro", "agency"] as const).map((t) => (
              <Button
                key={t || "all-tiers"}
                size="sm"
                variant={activeTier === t ? "default" : "outline"}
                onClick={() => setActiveTier(t)}
                data-testid={`filter-tier-${t || "all"}`}
                className="font-mono text-xs"
              >
                {t === "" ? "ALL TIERS" : t.toUpperCase()}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground font-mono text-sm">Loading templates…</p>
      ) : templates.length === 0 ? (
        <Card className="border-border/50 bg-card/50">
          <CardContent className="py-12 text-center">
            <p className="font-mono text-sm text-muted-foreground">No templates match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const badge = TIER_BADGE[t.tier] ?? TIER_BADGE.free;
            return (
              <Card
                key={t.slug}
                className="border-border/50 bg-card/50 hover:border-primary/50 transition-colors flex flex-col"
                data-testid={`template-card-${t.slug}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <Badge variant="outline" className={`font-mono text-[10px] ${badge.className}`}>
                      {t.locked && <Lock className="h-3 w-3 mr-1" />}
                      {badge.label.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs font-mono text-muted-foreground/80">
                    {t.category}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pb-3">
                  <p className="text-sm">{t.description}</p>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono text-primary/80">OFFER:</span> {t.recommendedOffer}
                  </div>
                </CardContent>
                <CardFooter className="gap-2 pt-0">
                  <Link href={`/templates/${t.slug}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full font-mono text-xs" data-testid={`button-preview-${t.slug}`}>
                      PREVIEW
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    className="flex-1 font-mono text-xs"
                    data-testid={`button-use-${t.slug}`}
                    onClick={() => {
                      if (t.locked) {
                        setLocation("/pricing");
                        return;
                      }
                      setLocation(`/builder?template=${t.slug}`);
                    }}
                  >
                    {t.locked ? (
                      <><Lock className="h-3 w-3 mr-1" /> UPGRADE</>
                    ) : (
                      <><Zap className="h-3 w-3 mr-1" /> USE THIS</>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
