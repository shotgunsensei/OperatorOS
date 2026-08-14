import { Link, useLocation, useRoute } from "wouter";
import { useGetLaunchTemplate, getGetLaunchTemplateQueryKey } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Lock, Zap, Target, Users, Megaphone, ListChecks, MessageSquare, Layout } from "lucide-react";

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  pro: { label: "Pro", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  agency: { label: "Agency", className: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
};

export default function TemplateDetail() {
  const [, params] = useRoute("/templates/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";
  const { data, isLoading, error } = useGetLaunchTemplate(slug, {
    query: { enabled: !!slug, queryKey: getGetLaunchTemplateQueryKey(slug) },
  });

  if (isLoading) {
    return <p className="text-muted-foreground font-mono text-sm">Loading template…</p>;
  }
  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground font-mono text-sm">Template not found.</p>
        <Link href="/templates">
          <Button variant="outline" size="sm" className="font-mono text-xs">
            <ArrowLeft className="h-4 w-4 mr-2" /> BACK_TO_TEMPLATES
          </Button>
        </Link>
      </div>
    );
  }

  const badge = TIER_BADGE[data.tier] ?? TIER_BADGE.free;

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/templates">
        <Button variant="ghost" size="sm" className="font-mono text-xs -ml-2" data-testid="button-back-templates">
          <ArrowLeft className="h-4 w-4 mr-2" /> BACK_TO_TEMPLATES
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Badge variant="outline" className={`font-mono text-[10px] ${badge.className}`}>
              {data.locked && <Lock className="h-3 w-3 mr-1" />}
              {badge.label.toUpperCase()}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground/80">{data.category}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
          <p className="text-muted-foreground mt-1">{data.description}</p>
        </div>
        <Button
          size="lg"
          data-testid="button-use-template"
          className="font-mono text-xs whitespace-nowrap shadow-[0_0_10px_rgba(220,38,38,0.4)]"
          onClick={() => {
            if (data.locked) {
              setLocation("/pricing");
              return;
            }
            setLocation(`/builder?template=${data.slug}`);
          }}
        >
          {data.locked ? (
            <><Lock className="h-4 w-4 mr-2" /> UPGRADE_TO_USE</>
          ) : (
            <><Zap className="h-4 w-4 mr-2" /> USE_THIS_TEMPLATE</>
          )}
        </Button>
      </div>

      {data.locked && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-300">This template is part of the {badge.label} tier.</p>
              <p className="text-muted-foreground mt-1">
                You can preview the full structure below. Upgrade to auto-fill the Launch Kit Builder with these inputs.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <Target className="h-4 w-4" /> RECOMMENDED_OFFER
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{data.recommendedOffer}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> SUGGESTED_AUDIENCE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{data.suggestedAudience}</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> AD_ANGLE
            </CardTitle>
            <CardDescription className="text-xs font-mono">
              Tone preset: {data.tonePreset.toUpperCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm italic">"{data.adAngle}"</p>
            <p className="text-xs font-mono text-muted-foreground">
              CTA: <span className="text-foreground">{data.suggestedCTA}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <Layout className="h-4 w-4" /> LANDING_PAGE_STRUCTURE
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm list-decimal list-inside">
              {data.landingPageStructure.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> LAUNCH_CHECKLIST
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.launchChecklist.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">▸</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-primary text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> SOCIAL_HOOKS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.socialHooks.map((s, i) => (
                <li key={i} className="border-l-2 border-primary/40 pl-3 italic">
                  "{s}"
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
