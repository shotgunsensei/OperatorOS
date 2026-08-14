import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useGetDashboard, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Palette, Megaphone, PenTool, Calendar, Zap, TrendingUp,
  ArrowRight, Lightbulb, ArrowUpRight, Plus, Sparkles,
  Crown, Target, BarChart3
} from "lucide-react";

export default function Dashboard() {
  const { tenantId } = useTenant();
  const { data: dashboard, isLoading } = useGetDashboard(tenantId!, { query: { enabled: !!tenantId } });
  const { data: activity } = useGetRecentActivity(tenantId!, { limit: 10 }, { query: { enabled: !!tenantId } });

  if (isLoading || !dashboard) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted rounded-xl" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1,2].map(i => <div key={i} className="h-64 bg-muted rounded-xl" />)}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const creditPercent = dashboard.aiCreditsLimit > 0 ? Math.round((dashboard.aiCreditsUsed / dashboard.aiCreditsLimit) * 100) : 0;
  const creditColor = creditPercent > 80 ? "text-red-500" : creditPercent > 50 ? "text-yellow-500" : "text-green-500";
  const remaining = Math.max(0, dashboard.aiCreditsLimit - dashboard.aiCreditsUsed);

  const hasBrands = dashboard.totalBrands > 0;
  const hasCampaigns = dashboard.totalCampaigns > 0;
  const hasCopy = dashboard.totalCopyAssets > 0;

  const stats = [
    { label: "Brands", value: dashboard.totalBrands, icon: Palette, color: "bg-violet-500/10 text-violet-500", sub: hasBrands ? "Active" : "Set up your first brand" },
    { label: "Campaigns", value: dashboard.activeCampaigns, icon: Megaphone, color: "bg-blue-500/10 text-blue-500", sub: hasCampaigns ? `${dashboard.totalCampaigns} total` : "Launch a campaign" },
    { label: "Copy Assets", value: dashboard.totalCopyAssets, icon: PenTool, color: "bg-orange-500/10 text-orange-500", sub: hasCopy ? "Across all brands" : "Generate with AI" },
    { label: "AI Credits", value: `${dashboard.aiCreditsUsed}/${dashboard.aiCreditsLimit}`, icon: Zap, color: "bg-amber-500/10 text-amber-500", sub: remaining > 0 ? `${remaining} remaining` : "Upgrade for more" },
  ];

  const contextualActions = [];
  if (!hasBrands) {
    contextualActions.push({ icon: Target, text: "Set up your brand identity to unlock AI-powered copy generation", action: "/brands", priority: "high" as const });
  }
  if (hasBrands && !hasCopy) {
    contextualActions.push({ icon: PenTool, text: "Generate your first AI copy — ads, emails, or social posts", action: "/copy-studio", priority: "high" as const });
  }
  if (hasBrands && hasCopy && !hasCampaigns) {
    contextualActions.push({ icon: Megaphone, text: "Create a campaign to organize and launch your content", action: "/campaigns", priority: "medium" as const });
  }
  if (hasCampaigns && dashboard.upcomingCalendarItems.length === 0) {
    contextualActions.push({ icon: Calendar, text: "Schedule your content to keep publishing consistent", action: "/calendar", priority: "medium" as const });
  }
  if (creditPercent > 70) {
    contextualActions.push({ icon: Crown, text: `You've used ${creditPercent}% of your AI credits this cycle`, action: "/settings", priority: creditPercent > 90 ? "high" as const : "medium" as const });
  }
  if (hasBrands && hasCampaigns) {
    contextualActions.push({ icon: Lightbulb, text: "Check Analytics for AI-powered insights on your campaigns", action: "/analytics", priority: "low" as const });
  }
  if (contextualActions.length === 0) {
    contextualActions.push({ icon: Sparkles, text: "You're all caught up. Explore AI Workflows to accelerate your next launch.", action: "/ai-workflows", priority: "low" as const });
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Your marketing command center</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild className="rounded-full">
              <Link href="/copy-studio"><PenTool className="h-3.5 w-3.5 mr-1.5" /> New Copy</Link>
            </Button>
            <Button size="sm" asChild className="rounded-full">
              <Link href="/campaigns"><Plus className="h-3.5 w-3.5 mr-1.5" /> New Campaign</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                <div className="text-[11px] text-muted-foreground/70 mt-1">{stat.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">AI Credits</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={`text-xs ${creditColor}`}>{creditPercent}% used</Badge>
                    {creditPercent > 80 && (
                      <Button variant="outline" size="sm" asChild className="rounded-full text-xs h-7">
                        <Link href="/settings">
                          <Crown className="h-3 w-3 mr-1" /> Get More Credits
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-3 bg-muted rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${creditPercent > 80 ? "bg-red-500" : creditPercent > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(creditPercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{dashboard.aiCreditsUsed} credits used this cycle</span>
                  <span className="font-medium">{remaining} remaining</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Campaigns</CardTitle>
                  <Link href="/campaigns" className="text-sm text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboard.campaignsByStatus.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                      <Megaphone className="h-6 w-6 text-blue-500" />
                    </div>
                    <p className="font-medium text-sm mb-1">No campaigns yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Campaigns help you organize and track your marketing efforts across channels.</p>
                    <Button size="sm" asChild className="rounded-full">
                      <Link href="/campaigns"><Plus className="h-3.5 w-3.5 mr-1" /> Create Campaign</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {dashboard.campaignsByStatus.map((item: any) => (
                      <div key={item.status} className="p-3 bg-muted/50 rounded-xl text-center">
                        <div className="text-xl font-bold">{item.count}</div>
                        <div className="text-xs text-muted-foreground capitalize mt-0.5">{item.status}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Recent Copy</CardTitle>
                  <Link href="/copy-studio" className="text-sm text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboard.recentCopyAssets.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
                      <PenTool className="h-6 w-6 text-orange-500" />
                    </div>
                    <p className="font-medium text-sm mb-1">No copy generated yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Use the AI Copy Studio to create ads, emails, social posts, and landing page copy.</p>
                    <Button size="sm" asChild className="rounded-full">
                      <Link href="/copy-studio"><Sparkles className="h-3.5 w-3.5 mr-1" /> Generate with AI</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recentCopyAssets.map((asset: any) => (
                      <div key={asset.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="min-w-0 mr-3">
                          <p className="font-medium text-sm truncate">{asset.title}</p>
                          <p className="text-xs text-muted-foreground capitalize">{asset.copyType?.replace(/_/g, " ")}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">{asset.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <CardTitle className="text-base font-semibold">Next Steps</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {contextualActions.slice(0, 4).map((rec, i) => (
                  <Link key={i} href={rec.action}>
                    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        rec.priority === "high" ? "bg-red-500/10 text-red-500" :
                        rec.priority === "medium" ? "bg-amber-500/10 text-amber-600" :
                        "bg-blue-500/10 text-blue-500"
                      }`}>
                        <rec.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{rec.text}</p>
                        <p className="text-xs text-primary mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Go <ArrowUpRight className="h-3 w-3" />
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {!activity || activity.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">Activity will appear here as you use BrandForge.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activity.slice(0, 6).map((item: any) => (
                      <div key={item.id} className="flex items-start gap-2.5 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                        <div className="min-w-0">
                          <span className="capitalize font-medium">{item.action}</span>{" "}
                          <span className="text-muted-foreground">{item.entityType}:</span>{" "}
                          <span className="truncate">{item.entityName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Upcoming</CardTitle>
                  <Link href="/calendar" className="text-sm text-primary hover:underline flex items-center gap-1">Calendar <ArrowRight className="h-3 w-3" /></Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboard.upcomingCalendarItems.length === 0 ? (
                  <div className="text-center py-4">
                    <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Schedule content from the Calendar to see it here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.upcomingCalendarItems.slice(0, 4).map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                        <div className="min-w-0 mr-2">
                          <p className="font-medium text-sm truncate">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">{item.scheduledDate}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">{item.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
