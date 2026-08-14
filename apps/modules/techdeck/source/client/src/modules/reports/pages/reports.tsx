import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  Download,
  Loader2,
  FileArchive,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RefreshCw,
} from "lucide-react";
import type { ReportJob } from "@shared/schema";

function statusBadge(status: string) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary" data-testid="badge-status-queued"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
    case "running":
      return <Badge variant="secondary" data-testid="badge-status-running"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case "complete":
      return <Badge variant="default" data-testid="badge-status-complete"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>;
    case "failed":
      return <Badge variant="destructive" data-testid="badge-status-failed"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [includeAudit, setIncludeAudit] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [tagsIncludeText, setTagsIncludeText] = useState("");
  const [tagsExcludeText, setTagsExcludeText] = useState("");

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<ReportJob[]>({
    queryKey: ["/api/reports/jobs"],
    refetchInterval: 5000,
  });

  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const { data: assets = [] } = useQuery<any[]>({
    queryKey: ["/api/assets"],
  });

  const { data: tagsData = [] } = useQuery<any[]>({
    queryKey: ["/api/evidence/tags"],
  });

  const generateMutation = useMutation({
    mutationFn: async (params: any) => {
      const res = await apiRequest("POST", "/api/reports/evidence-packet", params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/jobs"] });
      toast({ title: "Report job created", description: "Your evidence packet is being generated." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create report", description: err.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    const params: any = {
      includeAudit,
      includeEvidenceFiles: includeFiles,
    };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (selectedClient && selectedClient !== "all") params.clientId = selectedClient;
    if (selectedAsset && selectedAsset !== "all") params.assetId = selectedAsset;
    if (tagsIncludeText.trim()) {
      params.tagsInclude = tagsIncludeText.split(",").map((t: string) => t.trim()).filter(Boolean);
    }
    if (tagsExcludeText.trim()) {
      params.tagsExclude = tagsExcludeText.split(",").map((t: string) => t.trim()).filter(Boolean);
    }
    generateMutation.mutate(params);
  };

  const handleDownload = (jobId: string) => {
    window.open(`/api/reports/jobs/${jobId}/download`, "_blank");
  };

  const hasActiveJobs = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <ClipboardList className="w-6 h-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Compliance Reports</h1>
          <p className="text-sm text-muted-foreground">Generate Evidence Packet ZIP exports for compliance and auditing</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5" />
            Generate Evidence Packet
          </CardTitle>
          <CardDescription>
            Configure filters to select which evidence and audit data to include in the export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Asset</Label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger data-testid="select-asset">
                  <SelectValue placeholder="All assets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assets</SelectItem>
                  {assets.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tagsInclude">Include Tags (comma separated)</Label>
              <Input
                id="tagsInclude"
                placeholder="e.g. critical, network"
                value={tagsIncludeText}
                onChange={(e) => setTagsIncludeText(e.target.value)}
                data-testid="input-tags-include"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagsExclude">Exclude Tags (comma separated)</Label>
              <Input
                id="tagsExclude"
                placeholder="e.g. draft, temp"
                value={tagsExcludeText}
                onChange={(e) => setTagsExcludeText(e.target.value)}
                data-testid="input-tags-exclude"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeFiles}
                onCheckedChange={(checked) => setIncludeFiles(checked === true)}
                data-testid="checkbox-include-files"
              />
              <span className="text-sm">Include evidence files</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeAudit}
                onCheckedChange={(checked) => setIncludeAudit(checked === true)}
                data-testid="checkbox-include-audit"
              />
              <span className="text-sm">Include audit trail</span>
            </label>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            data-testid="button-generate-packet"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Generate Packet
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Recent Jobs</CardTitle>
            {hasActiveJobs && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Auto-refreshing
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4" data-testid="text-no-jobs">
              No report jobs yet. Use the form above to generate your first Evidence Packet.
            </p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const params = (job.params || {}) as Record<string, any>;
                const filterSummary: string[] = [];
                if (params.dateFrom || params.dateTo) {
                  filterSummary.push(`${params.dateFrom || "..."} to ${params.dateTo || "..."}`);
                }
                if (params.clientId) filterSummary.push("filtered by client");
                if (params.assetId) filterSummary.push("filtered by asset");
                if (params.tagsInclude?.length) filterSummary.push(`tags: ${params.tagsInclude.join(", ")}`);

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-4 flex-wrap p-3 rounded-md border"
                    data-testid={`row-job-${job.id}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      {statusBadge(job.status)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" data-testid={`text-job-type-${job.id}`}>
                          Evidence Packet
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString() : ""}
                          {filterSummary.length > 0 && ` — ${filterSummary.join(", ")}`}
                        </p>
                        {job.errorMessage && (
                          <p className="text-xs text-destructive mt-1" data-testid={`text-job-error-${job.id}`}>
                            {job.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    {job.status === "complete" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(job.id)}
                        data-testid={`button-download-${job.id}`}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
