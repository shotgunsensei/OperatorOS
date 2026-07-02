import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { HardDrive, FileText, AlertCircle } from "lucide-react";

export default function IntakeStoragePage() {
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["/api/secure-intake/storage"] });
  const { data: dashboard } = useQuery<any>({ queryKey: ["/api/secure-intake/dashboard"] });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Storage" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">Failed to load storage info</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  const usedBytes = data?.usedBytes || 0;
  const limitGb = data?.limitGb || 1;
  const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(3);
  const usedMb = (usedBytes / (1024 * 1024)).toFixed(1);
  const percent = Math.min(100, (usedBytes / (limitGb * 1024 * 1024 * 1024)) * 100);

  return (
    <div className="p-6 space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Storage" }]} />
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-storage-title">Storage Usage</h1>
        <p className="text-sm text-muted-foreground">Monitor intake file storage consumption</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Storage Quota</CardTitle>
          </div>
          <CardDescription>Current usage across all intake spaces</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold" data-testid="text-storage-used">{Number(usedGb) < 0.01 ? usedMb + " MB" : usedGb + " GB"}</span>
            <span className="text-lg text-muted-foreground mb-1">/ {limitGb} GB</span>
          </div>

          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${percent > 90 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : "bg-primary"}`}
              style={{ width: `${Math.max(percent, 1)}%` }}
            />
          </div>

          <p className="text-sm text-muted-foreground">{percent.toFixed(1)}% used</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-elevate">
          <CardContent className="pt-6 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{dashboard?.totalFiles || 0}</p>
            <p className="text-sm text-muted-foreground">Total Files</p>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-6 text-center">
            <HardDrive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{dashboard?.totalSpaces || 0}</p>
            <p className="text-sm text-muted-foreground">Intake Spaces</p>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="pt-6 text-center">
            <HardDrive className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{limitGb} GB</p>
            <p className="text-sm text-muted-foreground">Plan Limit</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
