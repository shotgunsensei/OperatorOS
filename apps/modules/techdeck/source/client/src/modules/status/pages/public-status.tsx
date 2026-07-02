import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  CheckCircle2,
  MinusCircle,
  AlertCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Info,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import logoImage from "@assets/ShotgunNinjaVaulticon_1770412982737.png";

function componentStatusIcon(status: string, size = "w-5 h-5") {
  switch (status) {
    case "operational": return <CheckCircle2 className={`${size} text-green-500`} />;
    case "degraded": return <MinusCircle className={`${size} text-yellow-500`} />;
    case "partial_outage": return <AlertCircle className={`${size} text-orange-500`} />;
    case "major_outage": return <XCircle className={`${size} text-red-500`} />;
    case "maintenance": return <Clock className={`${size} text-blue-500`} />;
    default: return <CheckCircle2 className={`${size} text-muted-foreground`} />;
  }
}

function componentStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityIcon(severity: string) {
  switch (severity) {
    case "info": return <Info className="w-4 h-4 text-blue-500" />;
    case "minor": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "major": return <AlertCircle className="w-4 h-4 text-orange-500" />;
    case "critical": return <XCircle className="w-4 h-4 text-red-500" />;
    default: return <Info className="w-4 h-4" />;
  }
}

function overallStatus(components: any[]) {
  if (components.length === 0) return { label: "No components", color: "text-muted-foreground", bg: "bg-muted" };
  const hasOutage = components.some((c) => c.status === "major_outage");
  const hasPartial = components.some((c) => c.status === "partial_outage");
  const hasDegraded = components.some((c) => c.status === "degraded");
  const hasMaintenance = components.some((c) => c.status === "maintenance");

  if (hasOutage) return { label: "Major Outage", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" };
  if (hasPartial) return { label: "Partial Outage", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" };
  if (hasDegraded) return { label: "Degraded Performance", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10" };
  if (hasMaintenance) return { label: "Under Maintenance", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" };
  return { label: "All Systems Operational", color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PublicStatusPage() {
  const params = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery<{
    page: any;
    components: any[];
    activeIncidents: any[];
    recentIncidents: any[];
  }>({
    queryKey: ["/api/public/status", params.slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/status/${params.slug}`);
      if (!res.ok) throw new Error("Status page not found");
      return res.json();
    },
    enabled: !!params.slug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Shield className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Status page not found</h1>
        <p className="text-sm text-muted-foreground">This status page doesn't exist or is not public.</p>
      </div>
    );
  }

  const { page, components, activeIncidents, recentIncidents } = data;
  const overall = overallStatus(components);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="Tech Deck" className="w-8 h-8 rounded-md" />
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-public-status-title">{page.title}</h1>
            {page.description && <p className="text-sm text-muted-foreground">{page.description}</p>}
          </div>
        </div>

        <Card className={overall.bg}>
          <CardContent className="flex items-center gap-3 p-4">
            {overall.label === "All Systems Operational" ? (
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            ) : (
              <AlertCircle className="w-6 h-6" />
            )}
            <span className={`font-semibold ${overall.color}`} data-testid="text-overall-status">{overall.label}</span>
          </CardContent>
        </Card>

        {components.length > 0 && (
          <Card>
            <CardContent className="divide-y p-0">
              {components.map((comp: any) => (
                <div key={comp.id} className="flex items-center justify-between gap-4 px-4 py-3" data-testid={`public-component-${comp.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{comp.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {componentStatusIcon(comp.status, "w-4 h-4")}
                    <span className="text-xs text-muted-foreground">{componentStatusLabel(comp.status)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {activeIncidents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Active Incidents</h2>
            {activeIncidents.map((inc: any) => (
              <Card key={inc.id} data-testid={`public-active-incident-${inc.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {severityIcon(inc.severity)}
                    <span className="font-medium text-sm">{inc.title}</span>
                    <Badge variant="outline" className="text-xs ml-auto">{inc.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{inc.description}</p>
                  <p className="text-xs text-muted-foreground">Started {formatDate(inc.startedAt || inc.createdAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {recentIncidents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">Recently Resolved</h2>
            {recentIncidents.map((inc: any) => (
              <Card key={inc.id} data-testid={`public-resolved-incident-${inc.id}`}>
                <CardContent className="p-4 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-sm">{inc.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      Resolved {inc.resolvedAt ? formatDate(inc.resolvedAt) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{inc.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="text-center text-xs text-muted-foreground pt-4 border-t">
          Powered by Tech Deck
        </div>
      </div>
    </div>
  );
}
