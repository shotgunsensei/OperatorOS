import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useIntegrations, useConnectIntegration, useDisconnectIntegration, useSyncIntegration } from "@/lib/api-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Search, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock,
  Plug, Unplug, ArrowUpRight, Filter, Zap, Lock
} from "lucide-react";

const categoryLabels: Record<string, string> = {
  advertising: "Advertising",
  social: "Social Media",
  email: "Email & Marketing",
  crm: "CRM",
  analytics: "Analytics",
  communication: "Communication",
  developer: "Developer Tools",
};

const iconMap: Record<string, string> = {
  meta: "📘", google: "🔍", linkedin: "💼", tiktok: "🎵",
  mailchimp: "📧", mail: "✉️", webhook: "🔗", hubspot: "🟠",
  salesforce: "☁️", analytics: "📊", slack: "💬", zapier: "⚡",
};

export default function IntegrationsPage() {
  const { tenantId } = useTenant();
  const { data: integrations, isLoading } = useIntegrations(tenantId);
  const connectMutation = useConnectIntegration(tenantId);
  const disconnectMutation = useDisconnectIntegration(tenantId);
  const syncMutation = useSyncIntegration(tenantId);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = (integrations || []).filter((i: any) => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    return true;
  });

  const categories = ["all", ...new Set((integrations || []).map((i: any) => i.category))];
  const connectedCount = (integrations || []).filter((i: any) => i.status === "connected").length;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
            <p className="text-muted-foreground text-sm">Connect your marketing tools and platforms</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Plug className="h-3 w-3 mr-1" />
            {connectedCount} connected
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search integrations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs"
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === "all" ? "All" : categoryLabels[cat] || cat}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
            </div>
          </div>
        ) : filtered.length === 0 && !search && categoryFilter === "all" ? (
          <div className="text-center py-16">
            <Plug className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-sm mb-1">No integrations available</p>
            <p className="text-xs text-muted-foreground">Integrations will appear here as they become available for your plan.</p>
          </div>
        ) : filtered.length === 0 && (search || categoryFilter !== "all") ? (
          <div className="text-center py-16">
            <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-sm mb-1">No integrations match your filters</p>
            <p className="text-xs text-muted-foreground mb-4">Try a different search term or category.</p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSearch(""); setCategoryFilter("all"); }}>
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((int: any) => (
              <Card key={int.provider} className={`transition-all hover:shadow-md ${int.status === "connected" ? "border-green-200 dark:border-green-800/50" : ""}`}>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center text-xl">
                        {iconMap[int.icon] || "🔌"}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{int.name}</div>
                        <div className="text-[11px] text-muted-foreground">{int.description}</div>
                      </div>
                    </div>
                    {int.status === "connected" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : int.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : null}
                  </div>

                  {int.status === "connected" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                      {int.accountName && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Account</span>
                          <span className="font-medium">{int.accountName}</span>
                        </div>
                      )}
                      {int.lastSyncAt && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Last sync</span>
                          <span className="font-medium">{new Date(int.lastSyncAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                      </div>
                    </div>
                  )}

                  {int.status === "error" && int.errorMessage && (
                    <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-3 border border-red-200 dark:border-red-800/50">
                      <p className="text-xs text-red-600 dark:text-red-400">{int.errorMessage}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {int.status === "connected" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-full text-xs"
                          onClick={() => syncMutation.mutate(int.provider)}
                          disabled={syncMutation.isPending}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                          Sync Now
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => disconnectMutation.mutate(int.provider)}
                          disabled={disconnectMutation.isPending}
                        >
                          <Unplug className="h-3 w-3 mr-1" />
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="w-full rounded-full text-xs"
                        size="sm"
                        onClick={() => connectMutation.mutate(int.provider)}
                        disabled={connectMutation.isPending}
                      >
                        <Plug className="h-3 w-3 mr-1" />
                        Connect
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t">
                    <Badge variant="outline" className="text-[10px]">{categoryLabels[int.category] || int.category}</Badge>
                    {int.requiredPlan && int.requiredPlan !== "free" && (
                      <span className="text-[10px] text-muted-foreground capitalize">{int.requiredPlan}+ required</span>
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
