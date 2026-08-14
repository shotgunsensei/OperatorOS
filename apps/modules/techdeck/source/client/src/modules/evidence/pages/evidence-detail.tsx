import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import {
  FileText,
  Download,
  Trash2,
  Clock,
  Users,
  MapPin,
  Server,
  Tag,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EvidencePreviewButton } from "../components/evidence-preview";
import type { EvidenceWithRelations, TenantWithMember } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export default function EvidenceDetailPage() {
  const [, params] = useRoute("/evidence/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: tenantInfo, isLoading: tenantLoading } = useQuery<TenantWithMember>({
    queryKey: ["/api/tenant"],
    queryFn: async () => {
      const res = await fetch("/api/tenant", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const role = tenantInfo?.role;
  const canDelete = role && role !== "CLIENT";

  const { data: item, isLoading } = useQuery<EvidenceWithRelations>({
    queryKey: ["/api/evidence", params?.id],
    enabled: !!params?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/evidence/${params?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("/api/evidence"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Evidence deleted" });
      navigate("/evidence");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Evidence not found.</p>
      </div>
    );
  }

  const isImage = item.fileType.startsWith("image/");
  const isPdf = item.fileType === "application/pdf";

  const breadcrumbs = [
    { label: "Evidence", href: "/evidence" },
    ...(item.clientName && item.clientId
      ? [{ label: item.clientName, href: `/clients/${item.clientId}` }]
      : []),
    { label: item.title },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Breadcrumbs items={breadcrumbs} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            data-testid="text-evidence-detail-title"
          >
            {item.title}
          </h1>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <Clock className="w-3 h-3" />
            {item.createdAt
              ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
              : "Just now"}
            {item.uploadedByName && ` by ${item.uploadedByName}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EvidencePreviewButton
            id={item.id}
            title={item.title}
            fileType={item.fileType}
            fileName={item.fileName}
          />
          <Button variant="outline" asChild data-testid="button-download-evidence">
            <a href={`/api/evidence/${item.id}/download`} download>
              <Download className="w-4 h-4 mr-1" />
              Download
            </a>
          </Button>
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" data-testid="button-delete-evidence">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete evidence?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the evidence file and its metadata.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground"
                    data-testid="button-confirm-delete"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {isImage && (
        <Card>
          <CardContent className="p-4">
            <img
              src={`/api/evidence/${item.id}/download`}
              alt={item.title}
              className="w-full rounded-md max-h-[400px] object-contain bg-muted"
              data-testid="img-evidence-preview"
            />
          </CardContent>
        </Card>
      )}

      {isPdf && (
        <Card>
          <CardContent className="p-4">
            <iframe
              src={`/api/evidence/${item.id}/download#toolbar=0`}
              title={item.title}
              className="w-full rounded-md border-0"
              style={{ height: "400px" }}
              data-testid="iframe-evidence-preview"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">File name</p>
              <p className="text-sm mt-0.5">{item.fileName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">File type</p>
              <p className="text-sm mt-0.5">{item.fileType}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">File size</p>
              <p className="text-sm mt-0.5">{formatFileSize(item.fileSize)}</p>
            </div>
            {item.sha256 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium">SHA-256</p>
                <p className="text-sm mt-0.5 font-mono text-muted-foreground truncate" title={item.sha256}>
                  {item.sha256.substring(0, 16)}...
                </p>
              </div>
            )}
          </div>

          {item.notes && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Notes</p>
              <p className="text-sm mt-0.5 whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {item.clientName && (
              <div className="flex items-center gap-1 text-sm">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Client:</span>
                <Link href={`/clients/${item.clientId}`}>
                  <span className="font-medium cursor-pointer">{item.clientName}</span>
                </Link>
              </div>
            )}
            {item.siteName && (
              <div className="flex items-center gap-1 text-sm">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Site:</span>
                <span>{item.siteName}</span>
              </div>
            )}
            {item.assetName && (
              <div className="flex items-center gap-1 text-sm">
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Asset:</span>
                <Link href={`/assets/${item.assetId}`}>
                  <span className="font-medium cursor-pointer">{item.assetName}</span>
                </Link>
              </div>
            )}
          </div>

          {item.tagNames && item.tagNames.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Tags</p>
              <div className="flex flex-wrap gap-1">
                {item.tagNames.map((tagName: string, i: number) => (
                  <Badge key={i} variant="secondary">
                    <Tag className="w-3 h-3 mr-1" />
                    {tagName}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
