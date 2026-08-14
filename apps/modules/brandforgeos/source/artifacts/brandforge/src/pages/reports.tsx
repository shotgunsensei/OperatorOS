import { AppLayout } from "@/components/app-layout";
import { useTenant } from "@/lib/tenant-context";
import { useReports, useCreateReport, useGenerateReport, useExports, useCreateExport } from "@/lib/api-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import {
  FileText, Download, Plus, BarChart3, TrendingUp, Users,
  Megaphone, PenTool, Eye, Palette, ArrowUpRight, Lock, CheckCircle2, Crown, Sparkles
} from "lucide-react";

const reportTypes = [
  { value: "campaign_summary", label: "Campaign Summary", icon: Megaphone, description: "Performance overview of selected campaigns with impressions, clicks, and conversions" },
  { value: "content_performance", label: "Content Performance", icon: PenTool, description: "Analysis of copy and content effectiveness across channels" },
  { value: "channel_breakdown", label: "Channel Breakdown", icon: BarChart3, description: "Performance metrics segmented by marketing channel" },
  { value: "executive_summary", label: "Executive Summary", icon: TrendingUp, description: "High-level KPI overview for leadership and stakeholders" },
  { value: "team_activity", label: "Team Activity", icon: Users, description: "Team member contributions, output volume, and activity trends" },
  { value: "brand_health", label: "Brand Health", icon: Palette, description: "Brand consistency score, voice adherence, and usage metrics" },
];

export default function ReportsPage() {
  const { tenantId } = useTenant();
  const { data: reports } = useReports(tenantId);
  const { data: exports } = useExports(tenantId);
  const createReport = useCreateReport(tenantId);
  const generateReport = useGenerateReport(tenantId);
  const createExport = useCreateExport(tenantId);
  const [showCreate, setShowCreate] = useState(false);
  const [newReport, setNewReport] = useState({ name: "", reportType: "campaign_summary", isWhiteLabel: false, brandingCompanyName: "", brandingColor: "#7c3aed" });

  const handleCreate = () => {
    createReport.mutate(newReport, {
      onSuccess: () => {
        setShowCreate(false);
        setNewReport({ name: "", reportType: "campaign_summary", isWhiteLabel: false, brandingCompanyName: "", brandingColor: "#7c3aed" });
      }
    });
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground text-sm">Build and export branded performance reports</p>
          </div>
          <Button className="rounded-full" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Report
          </Button>
        </div>

        <Tabs defaultValue="reports">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="reports" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1.5" /> Reports</TabsTrigger>
            <TabsTrigger value="preview" className="text-xs"><Eye className="h-3.5 w-3.5 mr-1.5" /> Preview</TabsTrigger>
            <TabsTrigger value="exports" className="text-xs"><Download className="h-3.5 w-3.5 mr-1.5" /> Exports</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportTypes.map(rt => (
                <Card key={rt.value} className="group hover:shadow-md transition-all cursor-pointer" onClick={() => { setNewReport({ ...newReport, reportType: rt.value, name: rt.label }); setShowCreate(true); }}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <rt.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{rt.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{rt.description}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-full text-xs w-full">
                      Create Report <ArrowUpRight className="h-3 w-3 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            {reports && reports.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Your Reports</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {reports.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{r.name}</div>
                          <div className="text-[10px] text-muted-foreground capitalize">{r.reportType.replace(/_/g, " ")} — {new Date(r.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.status === "generated" ? "secondary" : "outline"} className="text-[10px] capitalize">{r.status}</Badge>
                        {r.isWhiteLabel && (
                          <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            <Crown className="h-2.5 w-2.5 mr-0.5" /> White-Label
                          </Badge>
                        )}
                        {r.status !== "generated" && (
                          <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => generateReport.mutate(r.id)}>
                            Generate
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="rounded-full text-xs" onClick={() => createExport.mutate({ exportType: "report", format: "pdf", entityType: "report", entityId: r.id })}>
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(!reports || reports.length === 0) && (
              <Card>
                <CardContent className="py-10 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="font-medium text-sm mb-1">No reports created yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Choose a report type above to create your first performance report.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="preview" className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                <Eye className="h-2.5 w-2.5 mr-1" /> Sample Preview
              </Badge>
              <span className="text-xs text-muted-foreground">This is what your generated reports will look like.</span>
            </div>
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold">B</div>
                  <div>
                    <div className="text-xs text-white/60 uppercase tracking-wider">BrandForge Report</div>
                    <h2 className="text-xl font-bold">Campaign Performance Report</h2>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-white/70">
                  <span>Last 30 days</span>
                  <span>All campaigns</span>
                </div>
              </div>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Total Impressions", value: "24.8K", change: "+12%" },
                    { label: "Click-Through Rate", value: "3.2%", change: "+0.4%" },
                    { label: "Conversions", value: "847", change: "+18%" },
                    { label: "Cost Per Acquisition", value: "$12.40", change: "-8%" },
                    { label: "Revenue Generated", value: "$10.5K", change: "+22%" },
                    { label: "ROAS", value: "4.2x", change: "+0.6x" },
                  ].map(kpi => (
                    <div key={kpi.label} className="p-4 bg-muted/30 rounded-xl text-center">
                      <div className="text-2xl font-bold">{kpi.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
                      <div className="text-xs text-green-600 font-medium mt-0.5">{kpi.change}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/30 rounded-xl p-6">
                  <div className="text-xs font-medium text-muted-foreground mb-3">Performance Trend</div>
                  <div className="flex items-end gap-[4px] h-28">
                    {[32,45,38,52,28,60,55,42,68,50,35,72,48,58,40,65,52,45,75,55,62,48,70,42,58,65,50,78,60,72].map((h, i) => (
                      <div key={i} className="flex-1 bg-primary/20 rounded-t-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                    <span>30 days ago</span>
                    <span>Today</span>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-xl p-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" /> AI Recommendations
                  </h3>
                  <div className="space-y-2">
                    {["Increase ad spend on top-performing channels — CTR is above average", "Test video creatives for social campaigns — video tends to drive higher engagement", "Create retargeting sequences for visitors who didn't convert"].map((rec, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exports" className="mt-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Export History</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(!exports || exports.length === 0) && (
                  <div className="text-center py-8">
                    <Download className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">No exports yet</p>
                    <p className="text-xs text-muted-foreground">Generate a report, then export it as PDF to share with clients or stakeholders.</p>
                  </div>
                )}
                {(exports || []).map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{e.fileName || "Export"}</div>
                        <div className="text-[10px] text-muted-foreground">{e.format?.toUpperCase()} — {new Date(e.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <Badge variant={e.status === "completed" ? "secondary" : "outline"} className="text-[10px] capitalize">{e.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <Card className="max-w-md w-full" onClick={e => e.stopPropagation()}>
              <CardContent className="pt-6 space-y-4">
                <h2 className="font-bold text-lg">Create Report</h2>
                <div>
                  <Label className="text-xs">Report Name</Label>
                  <Input value={newReport.name} onChange={e => setNewReport({ ...newReport, name: e.target.value })} placeholder="Q1 Campaign Summary" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Report Type</Label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-background"
                    value={newReport.reportType}
                    onChange={e => setNewReport({ ...newReport, reportType: e.target.value })}
                  >
                    {reportTypes.map(rt => (
                      <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newReport.isWhiteLabel}
                    onChange={e => setNewReport({ ...newReport, isWhiteLabel: e.target.checked })}
                    className="rounded"
                  />
                  <Label className="text-xs">White-label report (use your client's branding)</Label>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    <Crown className="h-2.5 w-2.5 mr-0.5" /> Agency
                  </Badge>
                </div>
                {newReport.isWhiteLabel && (
                  <div className="space-y-3 pl-4 border-l-2 border-purple-200">
                    <div>
                      <Label className="text-xs">Client Company Name</Label>
                      <Input value={newReport.brandingCompanyName} onChange={e => setNewReport({ ...newReport, brandingCompanyName: e.target.value })} placeholder="Acme Corp" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Brand Color</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input type="color" value={newReport.brandingColor} onChange={e => setNewReport({ ...newReport, brandingColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer" />
                        <Input value={newReport.brandingColor} onChange={e => setNewReport({ ...newReport, brandingColor: e.target.value })} className="flex-1" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-full" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button className="flex-1 rounded-full" onClick={handleCreate} disabled={!newReport.name || createReport.isPending}>Create Report</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
