import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { FileText, Download, Trash2, CheckCircle, XCircle, Search, AlertCircle } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function IntakeFilesPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [spaceFilter, setSpaceFilter] = useState("");
  const { data: files, isLoading, error } = useQuery<any[]>({
    queryKey: ["/api/secure-intake/files", { query, status: statusFilter, spaceId: spaceFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (statusFilter) params.set("status", statusFilter);
      if (spaceFilter) params.set("spaceId", spaceFilter);
      const res = await fetch(`/api/secure-intake/files?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load files");
      return res.json();
    },
  });
  const { data: spaces } = useQuery<any[]>({ queryKey: ["/api/secure-intake/spaces"] });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/secure-intake/files/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      toast({ title: "File updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/secure-intake/files/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secure-intake/dashboard"] });
      toast({ title: "File deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const downloadFile = (id: string, name: string) => {
    const link = document.createElement("a");
    link.href = `/api/secure-intake/files/${id}/download`;
    link.download = name;
    link.click();
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "uploaded": return "default" as const;
      case "reviewed": return "secondary" as const;
      case "approved": return "outline" as const;
      case "rejected": return "destructive" as const;
      case "archived": return "secondary" as const;
      default: return "secondary" as const;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-3"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-44" /></div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Files" }]} />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">Failed to load files</p>
          <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Breadcrumbs items={[{ label: "Secure Intake", href: "/secure-intake" }, { label: "Files" }]} />
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-files-title">Uploaded Files</h1>
        <p className="text-sm text-muted-foreground">Review and manage files received through secure intake</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files..." className="pl-9" data-testid="input-file-search" />
        </div>
        <Select value={statusFilter || "__all__"} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[160px]" data-testid="select-file-status"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={spaceFilter || "__all__"} onValueChange={(v) => setSpaceFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-[180px]" data-testid="select-file-space"><SelectValue placeholder="All spaces" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All spaces</SelectItem>
            {(spaces || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(!files || files.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-10 h-10 text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm font-medium">No files found</p>
          <p className="text-xs text-muted-foreground mt-1">Files will appear here when external users upload through secure links</p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Uploader</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file: any) => (
                <TableRow key={file.id} data-testid={`row-file-${file.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate max-w-[200px]">{file.originalName}</span>
                    </div>
                    {file.mimeType && <div className="text-xs text-muted-foreground mt-0.5">{file.mimeType}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{file.uploaderName || "-"}</div>
                    {file.uploaderEmail && <div className="text-xs text-muted-foreground">{file.uploaderEmail}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{formatBytes(file.sizeBytes)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(file.status)}>{file.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(file.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => downloadFile(file.id, file.originalName)} data-testid={`button-download-${file.id}`} title="Download">
                        <Download className="w-4 h-4" />
                      </Button>
                      {file.status !== "approved" && (
                        <Button variant="ghost" size="icon" onClick={() => updateMutation.mutate({ id: file.id, status: "approved" })} data-testid={`button-approve-${file.id}`} title="Approve">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        </Button>
                      )}
                      {file.status !== "rejected" && (
                        <Button variant="ghost" size="icon" onClick={() => updateMutation.mutate({ id: file.id, status: "rejected" })} data-testid={`button-reject-${file.id}`} title="Reject">
                          <XCircle className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Permanently delete this file?")) deleteMutation.mutate(file.id); }} data-testid={`button-delete-file-${file.id}`} title="Delete">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
