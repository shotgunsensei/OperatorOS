import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useListLaunchTemplates,
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import {
  ArrowRight, FolderKanban, Activity, BarChart3, Plus, Zap, Sparkles, Crown,
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading } = useGetRecentActivity();
  const { data: templatesResp } = useListLaunchTemplates();

  if (isSummaryLoading || isActivityLoading) {
    return <div className="p-8 font-mono animate-pulse text-muted-foreground">LOADING_DASHBOARD_DATA...</div>;
  }

  const isFree = (summary?.plan ?? "free") === "free";
  const monthlyLimit = summary?.monthlyLimit ?? null;
  const kitsThisMonth = summary?.kitsThisMonth ?? 0;
  const usagePct = monthlyLimit ? Math.min(100, Math.round((kitsThisMonth / monthlyLimit) * 100)) : 0;
  const recommendedTemplates = (templatesResp?.templates ?? []).slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Operational overview & status</p>
        </div>
        <Link href="/builder" data-testid="dashboard-quick-create">
          <Button
            size="lg"
            className="font-bold tracking-widest gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(220,38,38,0.5)]"
          >
            <Plus className="h-5 w-5" />
            NEW LAUNCH KIT
          </Button>
        </Link>
      </div>

      {isFree && (
        <Card
          className="relative overflow-hidden border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent"
          data-testid="upgrade-banner"
        >
          <div className="absolute right-0 top-0 w-64 h-full bg-amber-500/10 blur-[80px] pointer-events-none" />
          <CardContent className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-md bg-amber-500/20 flex items-center justify-center shrink-0">
                <Crown className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="font-bold text-base">
                  You're on the <span className="text-amber-400">Free</span> plan — unlock the full payload with Pro.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Unlimited kits · Markdown / JSON exports · all 9 visual creative briefs · email + SMS sequences ·
                  5 brand profiles. <span className="font-mono text-xs">$19/mo · cancel anytime.</span>
                </p>
              </div>
            </div>
            <Link href="/pricing" data-testid="upgrade-banner-cta">
              <Button className="font-bold tracking-wider bg-amber-500 hover:bg-amber-400 text-amber-950 gap-2 shrink-0">
                UPGRADE TO PRO <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/50 bg-card/50 backdrop-blur" data-testid="stat-total-kits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium font-mono">TOTAL_KITS</CardTitle>
              <FolderKanban className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.totalKits}</div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">All-time generated</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 backdrop-blur" data-testid="stat-monthly-usage">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium font-mono">THIS_MONTH</CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {kitsThisMonth}
                {monthlyLimit ? <span className="text-base text-muted-foreground font-normal"> / {monthlyLimit}</span> : null}
              </div>
              {monthlyLimit ? (
                <Progress value={usagePct} className="h-1.5 mt-2" />
              ) : (
                <p className="text-xs text-muted-foreground mt-1 font-mono">UNLIMITED</p>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/50 backdrop-blur" data-testid="stat-exports">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium font-mono">EXPORTS</CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.totalExports}</div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">Files downloaded</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5" data-testid="stat-current-plan">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium font-mono">CURRENT_PLAN</CardTitle>
              <Zap className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold capitalize">{summary.plan}</div>
              <Link
                href="/pricing"
                className="text-xs text-primary hover:underline mt-1 inline-block font-mono"
              >
                {isFree ? "UPGRADE_CAPACITY →" : "MANAGE_PLAN →"}
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/50 bg-card/50" data-testid="recent-kits">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent launch kits</CardTitle>
              <CardDescription className="font-mono text-xs">Latest activity log</CardDescription>
            </div>
            <Link href="/kits">
              <Button variant="ghost" size="sm" className="font-mono text-xs gap-1">
                VIEW_ALL <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activity && activity.length > 0 ? (
                activity.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 border-b border-border/30 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        <span className="capitalize">{item.kind}</span>:{" "}
                        <span className="font-bold text-primary/80">{item.kitTitle}</span>
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {format(new Date(item.timestamp), "yyyy-MM-dd HH:mm")}
                      </p>
                    </div>
                    <Link href={`/kits/${item.kitId}`}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 space-y-3">
                  <p className="text-muted-foreground font-mono text-sm">NO_ACTIVITY_DETECTED</p>
                  <Link href="/builder">
                    <Button variant="outline" size="sm" className="font-mono text-xs gap-2">
                      <Plus className="h-3 w-3" /> CREATE_FIRST_KIT
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3 border-border/50 bg-card/50" data-testid="recommended-templates">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Recommended templates
              </CardTitle>
              <CardDescription className="font-mono text-xs">One-click prefill</CardDescription>
            </div>
            <Link href="/templates">
              <Button variant="ghost" size="sm" className="font-mono text-xs gap-1">
                ALL <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendedTemplates.length > 0 ? (
                recommendedTemplates.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/templates/${t.slug}`}
                    data-testid={`recommended-template-${t.slug}`}
                  >
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-card hover:border-primary/40 hover:bg-card/80 transition-all p-3 group">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate group-hover:text-primary transition-colors">
                          {t.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{t.category}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`font-mono text-[9px] uppercase shrink-0 ${
                          t.tier === "free"
                            ? "border-green-500/40 text-green-500"
                            : t.tier === "pro"
                            ? "border-amber-500/40 text-amber-500"
                            : "border-primary/40 text-primary"
                        }`}
                      >
                        {t.tier}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-center text-muted-foreground font-mono text-xs py-6">
                  LOADING_TEMPLATES...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {summary?.kitsByType && summary.kitsByType.length > 0 && (
        <Card className="border-border/50 bg-card/50" data-testid="kits-by-type">
          <CardHeader>
            <CardTitle>Kit distribution</CardTitle>
            <CardDescription className="font-mono text-xs">By business type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {summary.kitsByType.map((type) => (
                <div
                  key={type.businessType}
                  className="flex items-center justify-between border border-border/40 bg-card/50 rounded-md p-3"
                >
                  <div className="font-medium text-sm truncate">{type.businessType}</div>
                  <Badge variant="secondary" className="font-mono shrink-0 ml-2">
                    {type.count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
