import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PulseLoader } from "@/components/pulse-line";
import {
  BarChart3, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, RefreshCw, Cpu, Users2, Download, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TICKET_CATEGORY_LABELS } from "@shared/schema";

interface AnalyticsData {
  volumeOverTime: { date: string; count: number }[];
  categoryCounts: Record<string, number>;
  departmentCounts: Record<string, number>;
  recurringCount: number;
  overdueCount: number;
  avgResolutionHours: number;
  vendorRelatedIncidents: number;
  equipmentDowntime: number;
  supplyRequestTrend: { date: string; count: number }[];
  totalTickets: number;
  totalResolved: number;
}

function MetricCard({ label, value, icon: Icon, iconColor = "text-muted-foreground", sub }: {
  label: string; value: number | string; icon: any; iconColor?: string; sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BarChartSimple({ data, color = "bg-primary" }: { data: { date: string; count: number }[]; color?: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No data available</p>;
  const maxCount = Math.max(...data.map(v => v.count), 1);
  return (
    <div>
      <div className="flex items-end gap-[2px] h-32">
        {data.map((d, i) => {
          const height = (d.count / maxCount) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.date}: ${d.count}`}>
              <div className={`${color} rounded-t-sm min-h-[2px] transition-all group-hover:opacity-80`} style={{ height: `${Math.max(height, 2)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">{data[0]?.date}</span>
        <span className="text-[10px] text-muted-foreground">{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function HorizontalBar({ items, color = "bg-primary" }: { items: [string, number][]; color?: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No data</p>;
  const maxCnt = Math.max(...items.map(([, c]) => c));
  return (
    <div className="space-y-2.5">
      {items.map(([label, cnt]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <span className="text-sm truncate flex-1">{label}</span>
          <div className="flex items-center gap-2 w-20 sm:w-32">
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${(cnt / maxCnt) * 100}%` }} />
            </div>
            <span className="text-sm font-medium tabular-nums w-6 text-right">{cnt}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<AnalyticsData>({ queryKey: ["/api/analytics"] });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Analytics" description="Loading operational data..." />
        <div className="flex-1 flex items-center justify-center">
          <PulseLoader />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const resolutionRate = data.totalTickets > 0 ? Math.round((data.totalResolved / data.totalTickets) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Analytics"
        description="Issue volume, resolution trends, and department performance"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              if (!data) return;
              const rows: string[] = [];
              rows.push("Section,Label,Value");
              rows.push(`Summary,Total Issues,${data.totalTickets}`);
              rows.push(`Summary,Resolution Rate,${resolutionRate}%`);
              rows.push(`Summary,Avg Resolution Hours,${data.avgResolutionHours}`);
              rows.push(`Summary,Overdue,${data.overdueCount}`);
              rows.push(`Summary,Recurring,${data.recurringCount}`);
              rows.push(`Summary,Vendor Incidents,${data.vendorRelatedIncidents}`);
              rows.push(`Summary,Equipment Down,${data.equipmentDowntime}`);
              data.volumeOverTime.forEach(v => rows.push(`Volume,${v.date},${v.count}`));
              Object.entries(data.categoryCounts).forEach(([k, v]) => rows.push(`Category,"${(TICKET_CATEGORY_LABELS[k] || k).replace(/"/g, '""')}",${v}`));
              Object.entries(data.departmentCounts).forEach(([k, v]) => rows.push(`Department,"${k.replace(/"/g, '""')}",${v}`));
              const csv = rows.join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `pulsedesk-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast({ title: "Export complete", description: "Analytics report downloaded as CSV." });
            }} data-testid="button-export-analytics">
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-analytics">
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Issues" value={data.totalTickets} icon={BarChart3} iconColor="text-primary" />
          <MetricCard label="Resolution Rate" value={`${resolutionRate}%`} icon={CheckCircle2} iconColor="text-emerald-600" sub={`${data.totalResolved} resolved`} />
          <MetricCard label="Avg. Resolution" value={`${data.avgResolutionHours}h`} icon={Clock} iconColor="text-accent" />
          <MetricCard label="Overdue" value={data.overdueCount} icon={AlertTriangle} iconColor={data.overdueCount > 0 ? "text-rose-600" : "text-muted-foreground"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Issue Volume (30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartSimple data={data.volumeOverTime} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                By Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBar
                items={Object.entries(data.categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) => [TICKET_CATEGORY_LABELS[cat] || cat, cnt])}
                color="bg-accent"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users2 className="h-4 w-4 text-muted-foreground" />
                By Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBar
                items={Object.entries(data.departmentCounts).sort((a, b) => b[1] - a[1])}
                color="bg-primary"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                Operational Indicators
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <RefreshCw className="h-4 w-4 text-muted-foreground mx-auto" />
                  <p className="text-xl font-bold tabular-nums mt-1">{data.recurringCount}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Recurring Issues</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <Users2 className="h-4 w-4 text-muted-foreground mx-auto" />
                  <p className="text-xl font-bold tabular-nums mt-1">{data.vendorRelatedIncidents}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Vendor Incidents</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <Cpu className="h-4 w-4 text-muted-foreground mx-auto" />
                  <p className="text-xl font-bold tabular-nums mt-1">{data.equipmentDowntime}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Equipment Down</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground mx-auto" />
                  <p className="text-xl font-bold tabular-nums mt-1">{data.totalResolved}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Total Resolved</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.supplyRequestTrend && data.supplyRequestTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Supply Request Trend (30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChartSimple data={data.supplyRequestTrend} color="bg-accent" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
