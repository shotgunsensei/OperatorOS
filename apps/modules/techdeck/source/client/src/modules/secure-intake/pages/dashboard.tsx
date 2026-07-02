import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Link } from "wouter";
import { Upload, FolderOpen, FileText, Clock, HardDrive, Shield, AlertTriangle, AlertCircle } from "lucide-react";

export default function IntakeDashboardPage() {
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["/api/secure-intake/dashboard"] });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    const is402 = (error as any)?.message?.includes("402") || (error as any)?.message?.includes("plan");
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">{is402 ? "Secure Intake is not enabled by OperatorOS" : "Failed to load dashboard"}</p>
          <p className="text-xs text-muted-foreground mt-1">{is402 ? "Manage module access in OperatorOS, then sign in again." : "Please try again later."}</p>
        </div>
      </div>
    );
  }

  const storageUsedGb = ((data?.storageUsedBytes || 0) / (1024 * 1024 * 1024)).toFixed(2);
  const storageLimitGb = data?.limits?.intakeStorageGb || 1;
  const storagePercent = Math.min(100, ((data?.storageUsedBytes || 0) / (storageLimitGb * 1024 * 1024 * 1024)) * 100);

  return (
    <div className="p-6 space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake" }]} />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-intake-dashboard-title">Secure Intake</h1>
            <p className="text-sm text-muted-foreground">Manage secure file intake from external parties</p>
          </div>
          <Link href="/secure-intake/requests">
            <Button data-testid="button-new-request">
              <Upload className="w-4 h-4 mr-2" />
              New Upload Request
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate" data-testid="card-total-files">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalFiles || 0}</div>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-intake-spaces">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Intake Spaces</CardTitle>
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalSpaces || 0}</div>
            <p className="text-xs text-muted-foreground">of {data?.limits?.intakeSpacesMax || 1} allowed</p>
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-active-requests">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Requests</CardTitle>
            <Upload className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.activeRequests || 0}</div>
            {(data?.expiredRequests || 0) > 0 && (
              <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {data.expiredRequests} expired
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="hover-elevate" data-testid="card-storage-usage">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Storage</CardTitle>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{storageUsedGb} GB</div>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{storageLimitGb} GB limit</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.recentFiles || []).length === 0 ? (
              <div className="py-6 text-center">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground opacity-40 mb-2" />
                <p className="text-sm text-muted-foreground">No files uploaded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentFiles.slice(0, 5).map((file: any) => (
                  <div key={file.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate">{file.originalName}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">{file.status}</Badge>
                      <span className="text-xs text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.recentAudit || []).length === 0 ? (
              <div className="py-6 text-center">
                <Shield className="w-8 h-8 mx-auto text-muted-foreground opacity-40 mb-2" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.recentAudit.slice(0, 5).map((event: any) => (
                  <div key={event.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{event.action}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/secure-intake/spaces">
          <Card className="hover-elevate cursor-pointer" data-testid="link-manage-spaces">
            <CardContent className="pt-6 text-center">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">Manage Spaces</p>
              <p className="text-sm text-muted-foreground">Create and configure intake spaces</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/secure-intake/requests">
          <Card className="hover-elevate cursor-pointer" data-testid="link-manage-requests">
            <CardContent className="pt-6 text-center">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">Upload Requests</p>
              <p className="text-sm text-muted-foreground">Generate secure upload links</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/secure-intake/files">
          <Card className="hover-elevate cursor-pointer" data-testid="link-view-files">
            <CardContent className="pt-6 text-center">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">View Files</p>
              <p className="text-sm text-muted-foreground">Browse and review uploaded files</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
