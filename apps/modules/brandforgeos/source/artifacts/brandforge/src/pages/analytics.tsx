import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGetAnalytics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  TrendingUp, TrendingDown, Zap, PenTool, Megaphone, BarChart3,
  Lightbulb, AlertTriangle, ArrowUpRight, Eye, MousePointerClick, Target,
  Sparkles, FileText, Crown, Palette
} from "lucide-react";

export default function Analytics() {
  const { tenantId } = useTenant();
  const { data: analytics, isLoading } = useGetAnalytics(tenantId!, {}, { query: { enabled: !!tenantId } });

  if (isLoading || !analytics) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <div className="h-8 bg-muted rounded w-48 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{[1,2,3,4].map(i => <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />)}</div>
        </div>
      </AppLayout>
    );
  }

  const maxContent = Math.max(...(analytics.contentOutput?.map((d: any) => d.value) || [1]));
  const maxAi = Math.max(...(analytics.aiUsageTrend?.map((d: any) => d.value) || [1]));
  const totalContent = analytics.contentOutput?.reduce((s: number, d: any) => s + d.value, 0) || 0;
  const totalAiUsage = analytics.aiUsageTrend?.reduce((s: number, d: any) => s + d.value, 0) || 0;
  const campaignCount = analytics.campaignPerformance?.length || 0;
  const channelCount = analytics.channelBreakdown?.length || 0;

  const hasData = totalContent > 0 || totalAiUsage > 0 || campaignCount > 0;

  const liveMetrics = [
    { label: "Content Produced", value: totalContent, icon: PenTool, change: totalContent > 0 ? `${totalContent} items` : "No data yet", up: true },
    { label: "AI Sessions", value: totalAiUsage, icon: Zap, change: totalAiUsage > 0 ? `${totalAiUsage} credits used` : "No usage yet", up: true },
    { label: "Active Campaigns", value: campaignCount, icon: Megaphone, change: campaignCount > 0 ? `Across ${channelCount} channels` : "Launch to track", up: campaignCount > 0 },
    { label: "Channels Active", value: channelCount, icon: Target, change: channelCount > 0 ? "With content" : "Assign channels", up: channelCount > 0 },
  ];

  const contextualInsights = [];
  if (!hasData) {
    contextualInsights.push({ icon: Lightbulb, text: "Start creating content and running campaigns to see performance data here", type: "tip" });
    contextualInsights.push({ icon: Target, text: "Set up your brand identity first — it helps the AI generate better, more targeted copy", type: "tip" });
  } else {
    if (channelCount === 1) {
      contextualInsights.push({ icon: Lightbulb, text: "You're only using one channel. Expanding to 2-3 channels typically improves reach by 40%.", type: "tip" });
    }
    if (totalAiUsage > 0 && totalContent === 0) {
      contextualInsights.push({ icon: AlertTriangle, text: "You've used AI credits but haven't published content yet. Publish your drafts to start measuring performance.", type: "warning" });
    }
    if (campaignCount > 0) {
      contextualInsights.push({ icon: TrendingUp, text: "Create retargeting variants for your top-performing campaigns to maximize ROI", type: "growth" });
    }
    if (totalContent > 10) {
      contextualInsights.push({ icon: Lightbulb, text: "You have enough content data for a performance report. Export one from Reports to share with stakeholders.", type: "tip" });
    }
    contextualInsights.push({ icon: Target, text: "Add clear CTAs to any campaigns missing them — this can improve conversion by 30%", type: "growth" });
    contextualInsights.push({ icon: Lightbulb, text: "Try shorter ad hooks (under 6 words) for paid channels — they tend to outperform longer variants", type: "tip" });
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground text-sm">Track performance and get AI-powered insights</p>
          </div>
          <Button variant="outline" size="sm" asChild className="rounded-full">
            <Link href="/reports"><FileText className="h-3.5 w-3.5 mr-1.5" /> Export Report</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {liveMetrics.map(m => (
            <Card key={m.label} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <m.icon className="h-4 w-4" />
                  </div>
                  {m.value > 0 && (
                    <Badge variant="secondary" className="text-[10px] text-green-600">
                      <TrendingUp className="h-3 w-3 mr-0.5" />
                      Active
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold tracking-tight">{m.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.label}</div>
                <div className="text-[11px] text-muted-foreground/70 mt-1">{m.change}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Content Output (30 days)</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{totalContent} total</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {totalContent === 0 ? (
                  <div className="h-44 flex items-center justify-center text-center">
                    <div>
                      <PenTool className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Content data will appear here as you create and publish assets.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-[3px] h-44">
                      {analytics.contentOutput?.map((d: any, i: number) => (
                        <div key={i} className="flex-1 flex flex-col justify-end group relative">
                          <div
                            className="bg-primary/70 hover:bg-primary rounded-t-sm min-h-[2px] transition-colors cursor-default"
                            style={{ height: `${maxContent > 0 ? (d.value / maxContent) * 100 : 0}%` }}
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            {d.date}: {d.value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-2 px-1">
                      <span>{analytics.contentOutput?.[0]?.date}</span>
                      <span>{analytics.contentOutput?.[analytics.contentOutput.length - 1]?.date}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">AI Credit Usage (30 days)</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{totalAiUsage} credits</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {totalAiUsage === 0 ? (
                  <div className="h-36 flex items-center justify-center text-center">
                    <div>
                      <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Use the AI Copy Studio or Workflows to see credit usage trends.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-[3px] h-36">
                      {analytics.aiUsageTrend?.map((d: any, i: number) => (
                        <div key={i} className="flex-1 flex flex-col justify-end group relative">
                          <div
                            className="bg-violet-500/70 hover:bg-violet-500 rounded-t-sm min-h-[2px] transition-colors cursor-default"
                            style={{ height: `${maxAi > 0 ? (d.value / maxAi) * 100 : 0}%` }}
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            {d.date}: {d.value}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-2 px-1">
                      <span>{analytics.aiUsageTrend?.[0]?.date}</span>
                      <span>{analytics.aiUsageTrend?.[analytics.aiUsageTrend.length - 1]?.date}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Channel Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {!analytics.channelBreakdown || analytics.channelBreakdown.length === 0 ? (
                    <div className="text-center py-6">
                      <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Assign channels to campaigns to see breakdown data.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analytics.channelBreakdown.map((ch: any) => {
                        const max = Math.max(...(analytics.channelBreakdown?.map((c: any) => c.count) || [1]));
                        return (
                          <div key={ch.channel}>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="font-medium capitalize">{ch.channel}</span>
                              <span className="text-muted-foreground">{ch.count} items</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(ch.count / max) * 100}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Campaign Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {!analytics.campaignPerformance || analytics.campaignPerformance.length === 0 ? (
                    <div className="text-center py-6">
                      <Megaphone className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Launch campaigns to track impressions, clicks, and conversions.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {analytics.campaignPerformance.map((cp: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/30 rounded-lg">
                          <p className="font-medium text-sm mb-2">{cp.name}</p>
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div><p className="text-lg font-bold">{cp.impressions?.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Impressions</p></div>
                            <div><p className="text-lg font-bold">{cp.clicks?.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Clicks</p></div>
                            <div><p className="text-lg font-bold">{cp.conversions?.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Conversions</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="border-amber-200 dark:border-amber-800/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">AI Insights</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {contextualInsights.slice(0, 5).map((rec, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2.5 bg-muted/30 rounded-lg">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      rec.type === "warning" ? "bg-yellow-500/10 text-yellow-600" :
                      rec.type === "tip" ? "bg-blue-500/10 text-blue-500" :
                      "bg-green-500/10 text-green-600"
                    }`}>
                      <rec.icon className="h-3 w-3" />
                    </div>
                    <p className="text-xs leading-relaxed">{rec.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {!hasData && (
              <Card className="border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Get Started</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {[
                    { icon: Palette, text: "Set up a brand in Brand HQ", href: "/brands" },
                    { icon: PenTool, text: "Generate copy in the AI Copy Studio", href: "/copy-studio" },
                    { icon: Megaphone, text: "Launch a campaign to track metrics", href: "/campaigns" },
                  ].map((step, i) => (
                    <Link key={i} href={step.href}>
                      <div className="flex items-center gap-2.5 p-2.5 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                        <step.icon className="h-4 w-4 text-primary" />
                        <span className="text-sm">{step.text}</span>
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
